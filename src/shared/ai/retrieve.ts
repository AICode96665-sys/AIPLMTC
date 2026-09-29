// Retriever: finds the handful of catalog operations relevant to a plain-English
// request. Keyword search (BM25) over operation name, service and description —
// runs instantly, fully offline, and needs no extra embedding model.

import type { Catalog, Operation } from '../types'

/** Split camelCase / PascalCase / snake_case text into lowercase words. */
function words(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2)
}

/** Very light stemmer so "revise"/"revision"/"revisions" meet in the middle. */
function stem(w: string): string {
  if (w.length <= 4) return w
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y'
  for (const suf of ['ations', 'ation', 'ings', 'ing', 'ions', 'ion', 'es', 'ed', 's', 'e']) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) return w.slice(0, -suf.length)
  }
  return w
}

const STOP = new Set(
  'the a an and or of to for in on with from by is are be it its this that as at into then all my me i want need please using use can'.split(
    ' '
  )
)

function tokens(text: string): string[] {
  return words(text)
    .filter((w) => !STOP.has(w))
    .map(stem)
}

/** Everyday words → the Teamcenter vocabulary used in operation names. */
const SYNONYMS: Record<string, string[]> = {
  part: ['item'],
  parts: ['item'],
  document: ['dataset'],
  file: ['dataset', 'file'],
  files: ['dataset', 'file'],
  find: ['find', 'search', 'query'],
  search: ['find', 'search', 'query'],
  lookup: ['find', 'query'],
  fetch: ['get'],
  read: ['get', 'load'],
  load: ['load', 'get'],
  remove: ['delete'],
  modify: ['set', 'update'],
  edit: ['set', 'update'],
  change: ['set', 'update'],
  update: ['set', 'update'],
  attach: ['relation', 'create'],
  link: ['relation'],
  relate: ['relation'],
  make: ['create'],
  new: ['create'],
  add: ['create', 'add'],
  bom: ['bom', 'structure'],
  workflow: ['workflow', 'process'],
  approve: ['workflow', 'signoff'],
  login: ['session', 'login'],
  logout: ['session', 'logout'],
  check: ['checkin', 'checkout'],
  properties: ['property'],
  attribute: ['property'],
  attributes: ['property'],
  description: ['property'],
  name: ['property'],
  revise: ['revise', 'revision'],
  upload: ['write', 'ticket', 'commit', 'dataset'],
  download: ['read', 'ticket', 'dataset'],
  item: ['item', 'object'],
  object: ['object'],
  checkin: ['checkin'],
  checkout: ['checkout']
}

function queryTokens(query: string): Map<string, number> {
  // term -> weight (original words count fully, synonyms count half)
  const out = new Map<string, number>()
  const add = (t: string, w: number): void => {
    out.set(t, Math.max(out.get(t) ?? 0, w))
  }
  for (const raw of words(query)) {
    if (STOP.has(raw)) continue
    add(stem(raw), 1)
    for (const syn of SYNONYMS[raw] ?? []) add(stem(syn), 0.5)
  }
  return out
}

interface IndexedOp {
  op: Operation
  tf: Map<string, number>
  len: number
  /** Stemmed words of the operation name, e.g. setProperties -> set, property */
  nameTerms: Set<string>
}

interface Index {
  docs: IndexedOp[]
  idf: Map<string, number>
  avgLen: number
}

const FIELD_WEIGHTS = { name: 3, service: 2, description: 1 }
const indexCache = new WeakMap<Catalog, Index>()

/** Keep only the newest version of each operation (same lib/service/name). */
function latestVersions(ops: Operation[]): Operation[] {
  const byKey = new Map<string, Operation>()
  for (const op of ops) {
    const key = `${op.internal}/${op.lib}/${op.serviceStub}/${op.name}`
    const prev = byKey.get(key)
    if (!prev || op.year > prev.year) byKey.set(key, op)
  }
  return [...byKey.values()]
}

function buildIndex(catalog: Catalog): Index {
  const docs: IndexedOp[] = latestVersions(catalog.operations).map((op) => {
    const tf = new Map<string, number>()
    const addField = (text: string, weight: number): void => {
      for (const t of tokens(text)) tf.set(t, (tf.get(t) ?? 0) + weight)
    }
    addField(op.name, FIELD_WEIGHTS.name)
    addField(op.serviceStub, FIELD_WEIGHTS.service)
    addField(op.description.slice(0, 300), FIELD_WEIGHTS.description)
    let len = 0
    for (const v of tf.values()) len += v
    return { op, tf, len, nameTerms: new Set(tokens(op.name)) }
  })
  const df = new Map<string, number>()
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1)
  const n = docs.length
  const idf = new Map<string, number>()
  for (const [t, f] of df) idf.set(t, Math.log(1 + (n - f + 0.5) / (f + 0.5)))
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, n)
  return { docs, idf, avgLen }
}

export interface ScoredOperation {
  op: Operation
  score: number
}

/** Score every operation against one query (one clause of the request). */
function scoreAll(index: Index, query: string): ScoredOperation[] {
  const q = queryTokens(query)
  const k1 = 1.2
  const b = 0.75
  const scored: ScoredOperation[] = []
  for (const d of index.docs) {
    let score = 0
    for (const [t, qw] of q) {
      const f = d.tf.get(t)
      if (!f) continue
      const idf = index.idf.get(t) ?? 0
      score += qw * idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / index.avgLen)))
    }
    if (score <= 0) continue
    // Name coverage: "change a property" should strongly favour setProperties,
    // whose name is made entirely of words from the request.
    let covered = 0
    for (const t of d.nameTerms) covered += q.get(t) ?? 0
    score *= 1 + (1.5 * covered) / Math.max(1, d.nameTerms.size)
    if (d.op.lib === 'Core') score *= 1.25 // the everyday, general-purpose APIs
    if (d.op.internal) score *= 0.5 // internal APIs are a last resort
    scored.push({ op: d.op, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored
}

/** Split "check out X, change a property, then check it in" into steps. */
function clauses(query: string): string[] {
  return query
    .split(/[,;.\n]|\bthen\b|\band\b|\bafter that\b/i)
    .map((c) => c.trim())
    .filter((c) => tokens(c).length > 0)
}

/** Top-K operations for a request, best first. Each clause of a multi-step
 *  request gets its own best matches, so no step is crowded out. */
export function retrieveOperations(catalog: Catalog, query: string, k = 10): ScoredOperation[] {
  let index = indexCache.get(catalog)
  if (!index) {
    index = buildIndex(catalog)
    indexCache.set(catalog, index)
  }
  const parts = clauses(query)
  const perClause = parts.length > 1 ? Math.max(2, Math.floor(k / parts.length)) : 0
  const picked = new Map<string, ScoredOperation>()
  for (const part of parts) {
    for (const s of scoreAll(index, part).slice(0, perClause)) {
      if (picked.size >= k) break
      if (!picked.has(s.op.url)) picked.set(s.op.url, s)
    }
  }
  for (const s of scoreAll(index, query)) {
    if (picked.size >= k) break
    if (!picked.has(s.op.url)) picked.set(s.op.url, s)
  }
  return [...picked.values()]
}
