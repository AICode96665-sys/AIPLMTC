export * from './types'
export * from './expand'
export * from './buildCatalog'

import type { RawData } from './types'

/** Parse the raw text of structure.js (`const data = {...}`) into the data tree. */
export function parseStructureJs(raw: string): RawData {
  const start = raw.indexOf('{')
  if (start === -1) throw new Error('structure.js: could not find data object')
  let json = raw.slice(start).trim()
  json = json.replace(/;\s*$/, '') // drop trailing semicolon if present
  return JSON.parse(json)
}
export * from './ports'
export * from './text'
