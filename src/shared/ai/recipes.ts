// Recipe book: built-in Teamcenter know-how the AI can rely on.
//
// Each recipe says which operation(s) perform an everyday action, in order, and
// which setup/cleanup calls the action needs around it (e.g. adding a BOM line
// needs an open BOM window, which must be saved and closed afterwards).
//
// Provenance: written from general Teamcenter SOA knowledge, in our own words.
// Recipes contain only operation NAMES and their order — no Siemens sample
// code or documentation text. Every name is looked up in the customer's own
// uploaded catalog at run time; if an operation isn't there, that recipe step is
// skipped and normal search takes over. Nothing from Siemens ships in the app.

import type { Catalog, Operation } from '../types'

export interface Recipe {
  id: string
  /** Phrases that identify the action (all words of a phrase must appear). */
  triggers: string[]
  /** The operation(s) that perform the action, in order.
   *  An entry may list alternatives ("a|b"); the first found in the catalog wins.
   *  Optionally qualify a name as "Library/Service/name". */
  steps: string[]
  /** Setup calls that must come earlier in the flow (added if missing). */
  before?: string[]
  /** Cleanup calls that must come at the end of the flow (added if missing). */
  after?: string[]
}

export const RECIPES: Recipe[] = [] // recipe book removed from history; it is kept encrypted (recipeData.ts)

// ---------- matching ----------

/** Singular form: queries -> query, boxes -> box, templates -> template, process stays. */
const norm = (w: string): string =>
  w
    .toLowerCase()
    .replace(/ies$/, 'y')
    .replace(/(s|x|z|ch|sh)es$/, '$1')
    .replace(/([^s])s$/, '$1')
const wordsOf = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(norm)

/** Recipe for an action like "add child line", or null. The recipe whose
 *  matching triggers cover the most words of the action wins, so the verb
 *  decides ("remove child line" -> remove, not add); then the longer phrase
 *  ("expand all" > "expand"); then the one mentioned first ("check out the new
 *  revision" -> check out). */
export function matchRecipe(action: string): Recipe | null {
  const words = wordsOf(action)
  const have = new Set(words)
  let best: { recipe: Recipe; covered: number; len: number; first: number } | null = null
  for (const recipe of RECIPES) {
    const covered = new Set<string>()
    let len = 0
    for (const phrase of recipe.triggers) {
      const need = wordsOf(phrase)
      if (!need.every((w) => have.has(w))) continue
      need.forEach((w) => covered.add(w))
      len = Math.max(len, need.length)
    }
    if (len === 0) continue
    const first = Math.min(...[...covered].map((w) => words.indexOf(w)))
    const better =
      !best ||
      covered.size > best.covered ||
      (covered.size === best.covered && (len > best.len || (len === best.len && first < best.first)))
    if (better) best = { recipe, covered: covered.size, len, first }
  }
  return best?.recipe ?? null
}

// ---------- resolving names against the customer's catalog ----------

const resolveCache = new WeakMap<Catalog, Map<string, Operation | null>>()

/** "a|b" or "Lib/Service/name" -> the newest public operation in this catalog. */
export function resolveOp(catalog: Catalog, spec: string): Operation | null {
  let cache = resolveCache.get(catalog)
  if (!cache) {
    cache = new Map()
    resolveCache.set(catalog, cache)
  }
  if (cache.has(spec)) return cache.get(spec)!
  let found: Operation | null = null
  for (const alt of spec.split('|')) {
    const parts = alt.split('/')
    const name = parts.pop()!
    const [lib, service] = parts
    const matches = catalog.operations.filter(
      (o) => !o.internal && o.name === name && (!lib || o.lib === lib) && (!service || o.serviceStub === service)
    )
    if (matches.length) {
      // prefer Core, then the newest version
      matches.sort((a, b) => Number(b.lib === 'Core') - Number(a.lib === 'Core') || b.year.localeCompare(a.year))
      found = matches[0]
      break
    }
  }
  cache.set(spec, found)
  return found
}
