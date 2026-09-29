// Type resolution + recursive expansion.
// Faithful TypeScript port of the `getNamespaceProp` / `expandObject` logic
// from Siemens' original api.js, made cycle-safe and side-effect-isolated.

import { PRIMITIVES, type RawData, type TypeDef } from './types'

const stripArray = (t: string): string => t.replace('[]', '')

export interface Expander {
  /** Resolve a `A::B::C` namespace path to its (deep-cloned) definition. */
  getNamespaceProp(path: string): TypeDef | null
  /** Recursively expand all non-primitive types inside `obj`. Mutates `obj`.
   *  Returns a replacement value for map types (caller should reassign). */
  expandObject(obj: any, stack?: string[]): any
}

export function createExpander(data: RawData): Expander {
  function getNamespaceProp(path: string): TypeDef | null {
    let temp: any = data
    for (const part of path.split('::')) {
      temp = temp?.[part]
      if (temp === undefined || temp === null) return null
    }
    return JSON.parse(JSON.stringify(temp))
  }

  function expandObject(obj: any, stack: string[] = []): any {
    if (typeof obj === 'object' && !Array.isArray(obj)) {
      for (const i in obj) {
        const base = stripArray(obj[i].type)
        if (!PRIMITIVES[base]) {
          if (stack.includes(base)) {
            obj[i].recursive = true
          } else {
            obj[i].properties = getNamespaceProp(base)
            stack.push(base)
            const update = expandObject(obj[i].properties, stack)
            if (update) obj[i].properties = update
            stack.pop()
          }
        }
      }
    } else if (typeof obj === 'string' && obj.includes(';')) {
      // Map type: "keyType;valueType"
      const [k, v] = obj.split(';')
      const map: any = {
        $: true,
        key: { type: k, description: 'Key' },
        value: { type: v, description: 'Value' }
      }
      if (!PRIMITIVES[stripArray(k)]) {
        map.key.properties = getNamespaceProp(stripArray(k))
        expandObject(map.key.properties, stack)
      }
      if (!PRIMITIVES[stripArray(v)]) {
        map.value.properties = getNamespaceProp(stripArray(v))
        expandObject(map.value.properties, stack)
      }
      return map
    }
    return undefined
  }

  return { getNamespaceProp, expandObject }
}

/** Deep-clone then fully expand a request/response definition for display. */
export function expandForDisplay(data: RawData, def: TypeDef): TypeDef {
  const clone: TypeDef =
    typeof def === 'object' ? JSON.parse(JSON.stringify(def)) : def
  const { expandObject } = createExpander(data)
  const replacement = expandObject(clone)
  return replacement ?? clone
}
