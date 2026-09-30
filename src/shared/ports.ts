// Port + type-compatibility helpers, used by the AI planner (wiring) and the
// Java generator (fields of a type).

import { PRIMITIVES, type Operation, type RawData, type TypeDef } from './types'
import { createExpander } from './expand'

export interface Port {
  name: string
  type: string
}

/** Top-level ports for a node: the keys of a request/response object. */
export function portsOf(def: TypeDef): Port[] {
  if (def && typeof def === 'object' && !Array.isArray(def) && !(def as any).$) {
    return Object.entries(def as Record<string, { type: string }>).map(([name, f]) => ({
      name,
      type: f?.type ?? 'unknown'
    }))
  }
  return []
}

export function operationPorts(op: Operation): { inputs: Port[]; outputs: Port[] } {
  return { inputs: portsOf(op.input), outputs: portsOf(op.output) }
}

/** Simple (last) name of a `A::B::C[]` type, without the array suffix. */
export function simpleType(t: string): string {
  const base = t.replace('[]', '')
  return base.includes('::') ? base.split('::').pop()! : base
}

const GENERIC = new Set([
  'IModelObject',
  'ModelObject',
  'BusinessObject',
  'WorkspaceObject',
  'POM_object',
  'tag_t'
])

/** A business object type ("Teamcenter::ItemRevision"), as opposed to a request/response
 *  structure, map or ServiceData (those live under "…::Soa::…") or a plain value. */
export function isObjectType(type: string): boolean {
  const base = type.replace('[]', '')
  return !base.includes('::Soa::') && !base.startsWith('std::') && !PRIMITIVES[base]
}

/** Two ports are connectable if their simple type names match, or the target is a
 *  generic object reference (Teamcenter passes objects around loosely, so a generic
 *  object input accepts any object; the Java lists what to take from a structure).
 *  A generic object output only fits an object input — never a structure such as
 *  search criteria. */
export function typesCompatible(sourceType: string, targetType: string): boolean {
  const s = simpleType(sourceType)
  const t = simpleType(targetType)
  if (s === t) return true
  if (GENERIC.has(t)) return true
  return GENERIC.has(s) && isObjectType(targetType)
}

/** Exact (non-generic) type match — a stronger signal than typesCompatible. */
export function typesMatchExactly(sourceType: string, targetType: string): boolean {
  return simpleType(sourceType) === simpleType(targetType)
}

/** Build a resolver that maps a type string to its immediate (level-2) fields.
 *  Returns [] for primitives, maps, enums, or unresolvable types. */
export function makeFieldResolver(rawData: RawData): (type: string) => Port[] {
  const { getNamespaceProp } = createExpander(rawData)
  return (type: string): Port[] => {
    const base = type.replace('[]', '')
    if (PRIMITIVES[base]) return []
    const def = getNamespaceProp(base)
    if (def && typeof def === 'object' && !Array.isArray(def) && !(def as any).$) {
      return Object.entries(def as Record<string, { type: string }>).map(([name, f]) => ({
        name,
        type: f?.type ?? 'unknown'
      }))
    }
    return []
  }
}
