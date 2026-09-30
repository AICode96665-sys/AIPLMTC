// Planner: plain-English request -> validated flow of catalog operations.
//
//   1. Understand  (LLM) request -> ordered actions, with VALUES kept apart
//                        ("create item" + {object_name: "Test part"})
//   2. Retrieve    (code) search the catalog per action — values never pollute
//                        the search ("Test part" can't pull in TestManagement)
//   3. Choose      (LLM) pick ONE operation per action from that action's own
//                        short list (enum-constrained, so always a real op)
//   4. Wire        (code) connect steps by port types — deterministic
//
// Small local models do well at these narrow jobs; our code does the rest.

import type { Catalog, Operation } from '../types'
import { operationPorts, typesCompatible, typesMatchExactly, type Port } from '../ports'
import { retrieveOperations } from './retrieve'
import { matchRecipe, resolveOp, type Recipe } from './recipes'

/** The user's words beat the model's paraphrase: "Lock an object" must mean check
 *  out even if the model rewrote it as "set properties". Only words that really
 *  appear in the request are used, so an invented quote can't steer anything. */
function recipeFor(query: string, quote: string, action: string): { recipe: Recipe; matched: string } | null {
  const said = new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))
  const own = quote
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => said.has(w))
    .join(' ')
  const fromOwn = own ? matchRecipe(own) : null
  if (fromOwn) return { recipe: fromOwn, matched: own }
  const fromAction = matchRecipe(action)
  return fromAction ? { recipe: fromAction, matched: action } : null
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Any LLM backend: gets messages + a JSON schema, returns the JSON text. */
export type ChatFn = (messages: ChatMessage[], schema: object) => Promise<string>

/** Values the user gave for one step, e.g. object_name = "Test part". */
export interface StepValues {
  objectType: string
  properties: { name: string; value: string }[]
  file: string
}

export interface PlanStep {
  id: string
  /** Operation url, e.g. "Core-2006-03-DataManagement/revise" */
  url: string
  /** What this step does, in plain words, e.g. "create item" */
  action: string
  values: StepValues
  /** Where the operation came from: the built-in recipe book or catalog search. */
  source: 'recipe' | 'search'
  /** How the operation was picked and the alternatives ("Why?" and "Change" in the chat). */
  choice: StepChoice
}

/** A candidate operation with its search relevance, 0–100 (100 = best match found). */
export interface RankedOption {
  url: string
  score: number
}

export interface StepChoice {
  /** recipe = recipe book · setup/cleanup = added around a recipe step ·
   *  only = the one search match · ai = the AI chose among the search matches ·
   *  top = the AI gave no usable answer, so the best search match was used ·
   *  user = chosen by the user with "Change operation" */
  by: 'recipe' | 'setup' | 'cleanup' | 'only' | 'ai' | 'top' | 'user'
  /** recipe: the words that matched it */
  matched?: string
  /** setup/cleanup: the step that needs it */
  forAction?: string
  /** Search matches for this action, best first (for recipe steps: other matches). */
  options: RankedOption[]
}

export interface PlanConnection {
  from: string
  fromPort: string
  to: string
  toPort: string
}

export interface AiPlan {
  explanation: string
  steps: PlanStep[]
  connections: PlanConnection[]
}

export type AiPlanResult =
  | { ok: true; plan: AiPlan; notes: string[]; candidates: string[] }
  | { ok: false; error: string; candidates: string[] }

const MAX_STEPS = 8
const OPTIONS_PER_STEP = 4

// ---------- 1. Understand ----------

const UNDERSTAND_SCHEMA = {
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          quote: { type: 'string' },
          object_type: { type: 'string' },
          properties: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, value: { type: 'string' } },
              required: ['name', 'value']
            }
          },
          file: { type: 'string' }
        },
        required: ['action', 'quote', 'object_type', 'properties', 'file']
      }
    }
  },
  required: ['steps']
}

const UNDERSTAND_PROMPT = `You turn a Teamcenter request into the list of actions it needs, in the order they happen.
For each action:
- action: 2 to 5 words saying WHAT to do, for example: create item, create folder, find item by ID, attach dataset, upload file, download file, set properties, get properties, check out, check in, cancel checkout, revise item, save as new item, delete object, find objects, create relation, delete relation, list attached datasets, assign to project, open BOM window, add child line, remove child line, save BOM window, close BOM window, expand structure, expand all levels, find where used, run saved query, start workflow, send for approval, list workflow templates, complete workflow task, set release status, create change request.
- KEEP the Teamcenter words the user used in action (BOM, window, child line, structure, where used, saved query, workflow, folder, dataset, project).
- Only list actions the user asked for. Words that just name an object (item revision, assembly, dataset) are not actions.
- NEVER put names, types or other values inside action.
- quote: the exact words from the request that ask for this action, copied as written.
- object_type: the object type the user named, exactly as they wrote it. Empty string if none.
- properties: values to set, using Teamcenter property names: name -> object_name, description -> object_desc. Empty list if none.
- file: the file name or path if the user gave one, else empty string.
- Copy values EXACTLY as the user wrote them, complete (e.g. "Test part", not "Test"). Never invent values.
- Attaching a file needs two actions: attach dataset, then upload file.
- A workflow template name goes in properties as process_template. Text to search for goes in properties as search_value.
Reply with JSON only.

Example request: create a Design Document named Spec A, then check it out
Example reply: {"steps":[{"action":"create item","quote":"create a Design Document named Spec A","object_type":"Design Document","properties":[{"name":"object_name","value":"Spec A"}],"file":""},{"action":"check out","quote":"then check it out","object_type":"","properties":[],"file":""}]}`

interface RawAction {
  action?: string
  /** the user's own words for this action (as copied by the model) */
  quote?: string
  object_type?: string
  properties?: { name?: string; value?: string }[]
  file?: string
}

function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text)
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      return JSON.parse(m[0])
    } catch {
      return null
    }
  }
}

/** Ask the model for JSON; one retry if the reply isn't parseable. */
async function askJson<T>(chat: ChatFn, messages: ChatMessage[], schema: object): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await chat(messages, schema)
    const parsed = parseJson<T>(text)
    if (parsed) return parsed
    messages = messages.concat(
      { role: 'assistant', content: text },
      { role: 'user', content: 'That was not valid JSON. Reply with the JSON only.' }
    )
  }
  return null
}

/** Plain words the model sometimes uses instead of the Teamcenter property name. */
const PROPERTY_NAMES: Record<string, string> = {
  name: 'object_name',
  object_name: 'object_name',
  objectname: 'object_name',
  description: 'object_desc',
  desc: 'object_desc',
  object_description: 'object_desc',
  object_desc: 'object_desc'
}
const propertyName = (n: string): string => PROPERTY_NAMES[n.toLowerCase().replace(/\s+/g, '_')] ?? n

/** Keep only values the user actually wrote — small models like to invent
 *  placeholders ("object_name_value", "Revised Item"). */
function cleanValues(a: RawAction, query: string): StepValues {
  const q = query.toLowerCase().replace(/\s+/g, ' ')
  const said = (v: string): boolean => v.length > 0 && q.includes(v.toLowerCase().replace(/\s+/g, ' '))
  const objectType = (a.object_type ?? '').trim()
  const file = (a.file ?? '').trim()
  return {
    objectType: said(objectType) ? objectType : '',
    properties: (a.properties ?? [])
      .map((p) => ({ name: propertyName((p.name ?? '').trim()), value: (p.value ?? '').trim() }))
      .filter((p) => p.name && said(p.value)),
    file: said(file) ? file : ''
  }
}

// ---------- 3. Choose ----------

function describeOption(op: Operation): string {
  const desc = op.description.replace(/\s+/g, ' ').trim().slice(0, 160)
  return `   - ${op.url}: ${desc || '(no description)'}`
}

const CHOOSE_PROMPT = `For each step, choose the ONE option that performs that step's action.
Prefer general Core operations over specialised ones (vendor, test, classification, manufacturing...) unless the request is about that area.
Reply with JSON only.`

// ---------- 4. Wire ----------

/** Output->input ports between two steps: exact type match, or generic object match. */
function portPair(from: Operation, to: Operation, exactOnly: boolean): { fromPort: Port; toPort: Port } | null {
  const outs = operationPorts(from).outputs.filter((p) => p.name !== 'serviceData')
  const ins = operationPorts(to).inputs
  for (const o of outs) for (const i of ins) if (typesMatchExactly(o.type, i.type)) return { fromPort: o, toPort: i }
  if (exactOnly) return null
  for (const o of outs) for (const i of ins) if (typesCompatible(o.type, i.type)) return { fromPort: o, toPort: i }
  return null
}

/** Each step takes its input from the nearest earlier step that produces a
 *  matching type — exact matches first, then generic object references. */
function wire(steps: PlanStep[], byUrl: Map<string, Operation>): PlanConnection[] {
  const out: PlanConnection[] = []
  for (let i = 1; i < steps.length; i++) {
    const to = byUrl.get(steps[i].url)!
    let found: PlanConnection | null = null
    for (const exactOnly of [true, false]) {
      for (let j = i - 1; j >= 0 && !found; j--) {
        const pair = portPair(byUrl.get(steps[j].url)!, to, exactOnly)
        if (pair) found = { from: steps[j].id, fromPort: pair.fromPort.name, to: steps[i].id, toPort: pair.toPort.name }
      }
      if (found) break
    }
    if (found) out.push(found)
  }
  return out
}

function describeValues(v: StepValues): string {
  const parts: string[] = []
  if (v.objectType) parts.push(`type ${v.objectType}`)
  for (const p of v.properties) parts.push(`${p.name} = "${p.value}"`)
  if (v.file) parts.push(`file ${v.file}`)
  return parts.length ? ` (${parts.join(', ')})` : ''
}

// ---------- recipes: setup + cleanup ----------

interface Option {
  action: string
  values: StepValues
  ops: Operation[]
  recipe?: Recipe
  /** recipe: the words that matched it */
  matched?: string
  /** search matches with relevance (0–100), best first */
  ranked: RankedOption[]
}

/** Search matches for an action, with relevance relative to the best one (100). */
function rankedSearch(catalog: Catalog, action: string): { ops: Operation[]; ranked: RankedOption[] } {
  const hits = retrieveOperations(catalog, action, OPTIONS_PER_STEP)
  const top = hits[0]?.score || 1
  return { ops: hits.map((h) => h.op), ranked: hits.map((h) => ({ url: h.op.url, score: Math.round((100 * h.score) / top) })) }
}

const NO_VALUES: StepValues = { objectType: '', properties: [], file: '' }

/** Insert the setup calls a recipe needs before its first step (e.g. open a BOM
 *  window) and the cleanup calls it needs at the end (save, close) — unless the
 *  user's flow already has them in the right place. */
function addSetupAndCleanup(steps: PlanStep[], recipeOf: Map<PlanStep, Recipe>, catalog: Catalog, notes: string[]): void {
  const cleanup: Operation[] = []
  const cleanupFor = new Map<Operation, string>()
  for (const [step, recipe] of recipeOf) {
    for (const spec of recipe.before ?? []) {
      const op = resolveOp(catalog, spec)
      const at = steps.indexOf(step)
      if (!op || steps.slice(0, at).some((s) => s.url === op.url)) continue
      steps.splice(at, 0, {
        id: '',
        url: op.url,
        action: `${op.name} (needed first)`,
        values: NO_VALUES,
        source: 'recipe',
        choice: { by: 'setup', forAction: step.action, options: [{ url: op.url, score: 100 }] }
      })
      notes.push(`Added ${op.name} before "${step.action}" (required, from the recipe book).`)
    }
    for (const spec of recipe.after ?? []) {
      const op = resolveOp(catalog, spec)
      if (op && !cleanup.includes(op)) {
        cleanup.push(op)
        cleanupFor.set(op, step.action)
      }
    }
  }
  for (const op of cleanup) {
    // cleanup must follow the last step that NEEDS it (e.g. the add-child step),
    // and the user's own save/close after that point counts
    const needers = [...recipeOf].filter(([, r]) => r.after?.length).map(([s]) => steps.indexOf(s))
    const lastRecipeStep = Math.max(...needers)
    if (steps.slice(lastRecipeStep + 1).some((s) => s.url === op.url)) continue
    steps.push({
      id: '',
      url: op.url,
      action: `${op.name} (cleanup)`,
      values: NO_VALUES,
      source: 'recipe',
      choice: { by: 'cleanup', forAction: cleanupFor.get(op), options: [{ url: op.url, score: 100 }] }
    })
    notes.push(`Added ${op.name} at the end (required, from the recipe book).`)
  }
}

// ---------- off-topic guard ----------

const DOMAIN_WORDS = (
  'teamcenter item items part parts object objects dataset datasets file files document documents drawing ' +
  'bom structure assembly child line window workflow process release query search find property properties ' +
  'attribute revision revise folder relation relate project checkout checkin check change ecr ecn ' +
  'create delete upload download attach save copy expand used name description type owner status'
).split(' ')

/** Optimal-string-alignment distance <= 1 (one typo: insert, delete, swap, replace). */
function nearlyEqual(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  return d[a.length][b.length] <= 1
}

/** Cheap check before calling the model: does the request mention anything
 *  Teamcenter-like at all (typos allowed)? */
function looksLikeTeamcenter(query: string): boolean {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  return words.some((w) => DOMAIN_WORDS.some((d) => nearlyEqual(w, d)))
}

// ---------- the pipeline ----------

export interface PlanOptions {
  onProgress?: (message: string) => void
  /** Most actions allowed in one request (edition limit); unlimited if unset. */
  maxSteps?: number
}

export async function planFlow(
  catalog: Catalog,
  query: string,
  chat: ChatFn,
  opts: PlanOptions = {}
): Promise<AiPlanResult> {
  const progress = opts.onProgress ?? ((): void => {})
  const notes: string[] = []

  if (!looksLikeTeamcenter(query)) {
    return {
      ok: false,
      error: 'That does not look like a Teamcenter request. Describe what to do with items, datasets, files, structures, queries or workflows.',
      candidates: []
    }
  }

  // 1. Understand
  progress('Understanding your request…')
  const understood = await askJson<{ steps?: RawAction[] }>(
    chat,
    [
      { role: 'system', content: UNDERSTAND_PROMPT },
      { role: 'user', content: `Request: ${query}` }
    ],
    UNDERSTAND_SCHEMA
  )
  const actions = (understood?.steps ?? [])
    .filter((a) => (a.action ?? '').trim())
    .slice(0, MAX_STEPS)
  if (opts.maxSteps && actions.length > opts.maxSteps) {
    const list = actions.map((a) => a.action?.trim()).join(' → ')
    return {
      ok: false,
      error:
        `This request has ${actions.length} steps (${list}). The app handles up to ${opts.maxSteps} steps per request — ` +
        'please split it into smaller requests (for example, one request per part of the job).',
      candidates: []
    }
  }
  if (actions.length === 0) {
    return { ok: false, error: 'The AI could not work out the steps in that request. Try describing each step plainly.', candidates: [] }
  }

  // 2. Recipe book first, then search — per action, using the action words
  //    only (never the values).
  progress('Searching your catalog…')
  const options: Option[] = []
  for (const a of actions) {
    const action = a.action!.trim()
    const values = cleanValues(a, query)
    const found = recipeFor(query, a.quote ?? '', action)
    const recipe = found?.recipe
    const recipeOps = recipe ? recipe.steps.map((spec) => resolveOp(catalog, spec)).filter((o): o is Operation => !!o) : []
    const { ops, ranked } = rankedSearch(catalog, action)
    if (recipe && recipeOps.length) {
      recipeOps.forEach((op) => options.push({ action, values, ops: [op], recipe, matched: found!.matched, ranked }))
      continue
    }
    if (ops.length === 0) {
      notes.push(`No operation in your catalog matches "${action}" — step left out.`)
      continue
    }
    options.push({ action, values, ops, ranked })
  }
  // A "type" that equals a value the user gave (e.g. the name "Test part") is
  // the model mixing up fields, not a real object type — drop it.
  const givenValues = new Set(options.flatMap((o) => o.values.properties.map((p) => p.value.toLowerCase())))
  for (const o of options) if (givenValues.has(o.values.objectType.toLowerCase())) o.values.objectType = ''
  // A type belongs to the step that first names it (usually the create);
  // repeating it on later steps would e.g. set a dataset's type to "Accolade Part".
  const typed = new Set<string>()
  for (const o of options) {
    const t = o.values.objectType.toLowerCase()
    if (!t) continue
    if (typed.has(t)) o.values.objectType = ''
    else typed.add(t)
  }

  const candidates = [...new Set(options.flatMap((o) => o.ops.map((op) => op.url)))]
  if (options.length === 0) {
    return { ok: false, error: 'No operations in your catalog match that request.', candidates }
  }

  // 3. Choose one operation per action (skip the model when there's no choice)
  const chosen: string[] = options.map((o) => o.ops[0].url)
  const chosenBy: StepChoice['by'][] = options.map((o) => (o.recipe ? 'recipe' : o.ops.length > 1 ? 'top' : 'only'))
  if (options.some((o) => o.ops.length > 1)) {
    progress('Choosing operations…')
    const properties: Record<string, object> = {}
    options.forEach((o, i) => {
      if (o.ops.length > 1) properties[`step${i + 1}`] = { type: 'string', enum: o.ops.map((op) => op.url) }
    })
    const schema = { type: 'object', properties, required: Object.keys(properties) }
    const list = options
      .map((o, i) => (o.ops.length > 1 ? { o, i } : null))
      .filter((x): x is { o: Option; i: number } => x !== null)
      .map(({ o, i }) => `step${i + 1} — ${o.action}${describeValues(o.values)}. Options:\n${o.ops.map(describeOption).join('\n')}`)
      .join('\n\n')
    const picks = await askJson<Record<string, string>>(
      chat,
      [
        { role: 'system', content: CHOOSE_PROMPT },
        { role: 'user', content: `REQUEST: ${query}\n\n${list}` }
      ],
      schema
    )
    options.forEach((o, i) => {
      const pick = picks?.[`step${i + 1}`]
      if (pick && o.ops.some((op) => op.url === pick)) {
        chosen[i] = pick
        chosenBy[i] = 'ai'
      }
    })
  }

  // Build steps; merge an action into the previous step if it chose the same operation.
  const byUrl = new Map(catalog.operations.map((o) => [o.url, o]))
  const steps: PlanStep[] = []
  const recipeOf = new Map<PlanStep, Recipe>()
  options.forEach((o, i) => {
    const prev = steps[steps.length - 1]
    if (prev && prev.url === chosen[i]) {
      prev.action += ` + ${o.action}`
      prev.values = {
        objectType: prev.values.objectType || o.values.objectType,
        properties: prev.values.properties.concat(o.values.properties),
        file: prev.values.file || o.values.file
      }
      return
    }
    const step: PlanStep = {
      id: '',
      url: chosen[i],
      action: o.action,
      values: o.values,
      source: o.recipe ? 'recipe' : 'search',
      choice: { by: chosenBy[i], matched: o.matched, options: o.ranked }
    }
    if (o.recipe) recipeOf.set(step, o.recipe)
    steps.push(step)
  })
  addSetupAndCleanup(steps, recipeOf, catalog, notes)
  steps.forEach((st, i) => (st.id = `s${i + 1}`))

  // 4. Wire
  return { ok: true, plan: finishPlan(steps, byUrl), notes, candidates }
}

/** Wire the steps and write the one-line explanation. */
function finishPlan(steps: PlanStep[], byUrl: Map<string, Operation>): AiPlan {
  const explanation = steps
    .map((s) => `${s.action}${describeValues(s.values)}`)
    .join(' → ')
    .replace(/^./, (c) => c.toUpperCase())
  return { explanation, steps, connections: wire(steps, byUrl) }
}

/** "Change operation": use `url` for step `stepId`, then wire the flow again.
 *  Returns null if the step or the operation doesn't exist. */
export function changeOperation(catalog: Catalog, plan: AiPlan, stepId: string, url: string): AiPlan | null {
  const byUrl = new Map(catalog.operations.map((o) => [o.url, o]))
  if (!byUrl.has(url) || !plan.steps.some((s) => s.id === stepId)) return null
  if (plan.steps.some((s) => !byUrl.has(s.url))) return null
  const steps = plan.steps.map((s) =>
    s.id === stepId ? { ...s, url, source: 'search' as const, choice: { ...s.choice, by: 'user' as const } } : s
  )
  return finishPlan(steps, byUrl)
}
