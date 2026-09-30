// Generates a Java Teamcenter SOA client program from a flow graph.
//
// Two modes, controlled by `maxDepth`:
//   - Shallow (maxDepth = 1): build the argument object + its immediate fields.
//                           Nested object fields are left null.
//   - Full    (maxDepth large): recursively build every nested object as deep as
//                           the schema goes, stopping at primitives, empty types,
//                           or recursive type cycles.
//
// Java class names are inferred from the catalog (e.g. CreateIn, DataManagementService);
// verify package and class names against your Teamcenter SDK.

import type { Port } from '../ports'
import type { StepValues } from '../ai/planner'

/** Resolves a type string to its immediate fields (one level). Returns [] for
 *  primitives, maps, enums, or unresolvable types. */
export type FieldResolver = (type: string) => Port[]

export interface GenNode {
  id: string
  name: string
  lib: string
  serviceStub: string
  year: string
  include: string
  inputs: Port[]
  outputs: Port[]
  /** Values from the user's request (AI flows), filled into matching fields. */
  values?: StepValues
}

export interface GenEdge {
  source: string
  sourceHandle: string | null | undefined
  target: string
  targetHandle: string | null | undefined
}

const PRIMITIVE_JAVA: Record<string, string> = {
  bool: 'boolean',
  boolean: 'boolean',
  char: 'char',
  double: 'double',
  float: 'float',
  int: 'int',
  void: 'void',
  string: 'String',
  String: 'String',
  date_t: 'Date',
  Date: 'Date',
  IModelObject: 'ModelObject',
  tag_t: 'ModelObject'
}

function simpleName(t: string): string {
  const base = t.replace('[]', '')
  return base.includes('::') ? base.split('::').pop()! : base
}
function javaBase(t: string): string {
  const s = simpleName(t)
  return PRIMITIVE_JAVA[s] ?? s
}
function javaType(t: string): string {
  return javaBase(t) + (t.includes('[]') ? '[]' : '')
}
function isPrimitive(t: string): boolean {
  return simpleName(t) in PRIMITIVE_JAVA
}
function defaultValue(jType: string): string {
  if (jType.endsWith('[]')) return 'null'
  switch (jType) {
    case 'String':
      return '""'
    case 'int':
    case 'long':
    case 'short':
    case 'byte':
    case 'double':
    case 'float':
      return '0'
    case 'boolean':
      return 'false'
    case 'char':
      return "'\\0'"
    default:
      return 'null'
  }
}

const lcfirst = (s: string): string => (s ? s[0].toLowerCase() + s.slice(1) : s)
const ucfirst = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** Tracks imports; a simple name is imported once, later clashes stay fully
 *  qualified (e.g. core vs cad DataManagementService, two releases of DataManagement). */
class Imports {
  private bySimple = new Map<string, string>()

  /** Java source reference for a fully-qualified type ("a.b.Outer$Inner[]"). */
  ref(fqn: string): string {
    const dims = fqn.match(/(\[\])+$/)?.[0] ?? ''
    const base = fqn.slice(0, fqn.length - dims.length)
    if (!base.includes('.')) return fqn // primitive
    if (/^java\.lang\.\w+$/.test(base)) return base.slice('java.lang.'.length) + dims
    const [outer, ...inner] = base.split('$')
    const simple = outer.split('.').pop()!
    const have = this.bySimple.get(simple)
    let head = outer
    if (!have || have === outer) {
      this.bySimple.set(simple, outer)
      head = simple
    }
    return [head, ...inner].join('.') + dims
  }

  lines(): string[] {
    return [...this.bySimple.values()].sort().map((f) => `import ${f};`)
  }
}

function topoSort(nodes: GenNode[], edges: GenEdge[]): GenNode[] {
  const indeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const n of nodes) {
    indeg.set(n.id, 0)
    adj.set(n.id, [])
  }
  for (const e of edges) {
    if (!indeg.has(e.source) || !indeg.has(e.target)) continue
    adj.get(e.source)!.push(e.target)
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
  }
  // Stable: among the steps that are ready, always take the earliest in the
  // given (planned) order — wires only move a step when they have to.
  const position = new Map(nodes.map((n, i) => [n.id, i]))
  const ready = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id)
  const ordered: string[] = []
  while (ready.length) {
    ready.sort((a, b) => position.get(a)! - position.get(b)!)
    const id = ready.shift()!
    ordered.push(id)
    for (const next of adj.get(id) ?? []) {
      indeg.set(next, (indeg.get(next) ?? 0) - 1)
      if (indeg.get(next) === 0) ready.push(next)
    }
  }
  const seen = new Set(ordered)
  for (const n of nodes) if (!seen.has(n.id)) ordered.push(n.id)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return ordered.map((id) => byId.get(id)!).filter(Boolean)
}

const noFields: FieldResolver = () => []

/** How many levels beyond `maxDepth` the generator may go to place a user value. */
const VALUE_DEPTH = 4

export function generateJava(
  nodes: GenNode[],
  edges: GenEdge[],
  resolveFields: FieldResolver = noFields,
  maxDepth = 1
): string {
  if (nodes.length === 0) {
    return '// Ask the AI for a flow to generate Java code.'
  }

  const imp = new Imports()
  // reserve the names every program uses
  const CONNECTION = imp.ref('com.teamcenter.soa.client.Connection')
  imp.ref('com.teamcenter.soa.client.model.ModelObject')
  const SERVICE_DATA = imp.ref('com.teamcenter.soa.client.model.ServiceData')
  const SESSION = imp.ref('com.teamcenter.services.strong.core.SessionService')

  let counter = 0
  const fresh = (b: string): string => `${lcfirst(b)}${++counter}`

  /** Java name for a request/response struct type from the catalog. */
  const structRef = (catalogType: string): string => simpleName(catalogType)
  /** Variable-name stem for a struct (always the plain type name). */
  const stem = (catalogType: string): string => simpleName(catalogType)

  // Values for the step currently being generated (set in the main loop).
  let vals: StepValues | undefined
  const javaString = (v: string): string => JSON.stringify(v)
  const prop = (name: string): string | undefined => vals?.properties.find((p) => p.name === name)?.value

  /** A user-given value for a single String field, matched by field name. */
  function givenValue(fieldName: string, typeStr: string): string | null {
    if (!vals || javaBase(typeStr) !== 'String') return null
    const f = fieldName.toLowerCase()
    if (typeStr.includes('[]')) {
      // saved-query criteria values: new String[] { "Bracket*" }
      const search = f === 'values' ? prop('search_value') : undefined
      return search ? `new String[] { ${javaString(search)} }` : null
    }
    let v: string | undefined
    if (['boname', 'type', 'itemtype', 'objecttype', 'typename'].includes(f)) v = vals.objectType || undefined
    else if (f === 'name') v = prop('object_name')
    else if (f === 'description') v = prop('object_desc')
    else if (f === 'filename') v = vals.file || undefined
    else
      v = vals.properties.find((p) => p.name.replace(/_/g, '').toLowerCase() === f)?.value // process_template -> processTemplate
    return v ? javaString(v) : null
  }

  /** "name + values[]" structs (e.g. NameValueStruct1) hold property settings. */
  const isNameValuePair = (fields: Port[]): boolean =>
    fields.some((f) => f.name === 'name' && javaBase(f.type) === 'String' && !f.type.includes('[]')) &&
    fields.some((f) => f.name === 'values' && javaType(f.type) === 'String[]')

  /** Below the normal depth only fields made for a specific value are filled: a file
   *  name or search values. Generic name/type/description fields that deep down belong
   *  to other objects (e.g. extended attributes), so they are left alone. */
  const deepGiven = (fieldName: string, typeStr: string): string | null =>
    ['filename', 'values'].includes(fieldName.toLowerCase()) ? givenValue(fieldName, typeStr) : null

  /** Would building `typeStr` place one of the user's values somewhere inside it?
   *  Lets the generator go deeper than `maxDepth` only along those paths, so a value
   *  such as a property to set is never lost in a nested structure. */
  const holdsCache = new Map<string, boolean>()
  function holdsValue(typeStr: string, stack: string[], extra: number): boolean {
    if (!vals || isPrimitive(typeStr) || extra > VALUE_DEPTH) return false
    if (!vals.objectType && !vals.file && vals.properties.length === 0) return false
    const base = stem(typeStr)
    if (stack.includes(base)) return false
    const key = `${typeStr}|${extra}`
    const cached = holdsCache.get(key)
    if (cached !== undefined) return cached
    holdsCache.set(key, false) // guards against cycles while computing
    const fields = resolveFields(typeStr)
    const hit =
      (typeStr.includes('[]') && vals.properties.length > 0 && isNameValuePair(fields)) ||
      fields.some(
        (f) =>
          deepGiven(f.name, f.type) !== null ||
          (simpleName(f.type) === 'StringMap' && vals!.properties.length > 0) ||
          holdsValue(f.type, [...stack, base], extra + 1)
      )
    holdsCache.set(key, hit)
    return hit
  }

  /** Build a value expression for `typeStr`, appending construction lines. */
  function buildValue(
    typeStr: string,
    lines: string[],
    ind: string,
    stack: string[],
    depth: number,
    preferred?: string
  ): string {
    const isArray = typeStr.includes('[]')
    if (isPrimitive(typeStr)) return isArray ? 'null' : defaultValue(javaBase(typeStr))

    const base = stem(typeStr)
    if (stack.includes(base)) return 'null /* recursive type — set manually */'
    if (depth >= maxDepth && !holdsValue(typeStr, stack, depth - maxDepth + 1)) return 'null'

    const fields = resolveFields(typeStr)
    if (fields.length === 0) return 'null'
    const cls = structRef(typeStr)

    if (isArray && vals?.properties.length && isNameValuePair(fields)) {
      // one element per property the user asked to set
      const elems = vals.properties.map((p) => {
        const v = fresh(base)
        lines.push(`${ind}${cls} ${v} = new ${cls}(); // from your request`)
        for (const f of fields) {
          const expr =
            f.name === 'name'
              ? javaString(p.name)
              : f.name === 'values'
                ? `new String[] { ${javaString(p.value)} }`
                : buildValue(f.type, lines, ind, stack, depth + 1)
          lines.push(`${ind}${v}.${f.name} = ${expr};`)
        }
        return v
      })
      const arrVar = preferred ?? fresh(base)
      lines.push(`${ind}${cls}[] ${arrVar} = new ${cls}[] { ${elems.join(', ')} };`)
      return arrVar
    }

    stack.push(base)
    const objVar = isArray
      ? (preferred ? `${preferred}Item` : fresh(base))
      : (preferred ?? fresh(base))
    lines.push(`${ind}${cls} ${objVar} = new ${cls}(); // ${isArray ? base + '[] element' : base}`)
    for (const f of fields) {
      const arr = f.type.includes('[]') ? '[]' : ''
      const given = depth >= maxDepth ? deepGiven(f.name, f.type) : givenValue(f.name, f.type)
      if (given) {
        lines.push(`${ind}${objVar}.${f.name} = ${given}; // from your request`)
        continue
      }
      if (simpleName(f.type) === 'StringMap' && vals?.properties.length) {
        const m = fresh(f.name)
        lines.push(`${ind}java.util.Map<String, String> ${m} = new java.util.HashMap<>(); // from your request`)
        for (const p of vals.properties) lines.push(`${ind}${m}.put(${javaString(p.name)}, ${javaString(p.value)});`)
        lines.push(`${ind}${objVar}.${f.name} = ${m};`)
        continue
      }
      const expr = buildValue(f.type, lines, ind, stack, depth + 1)
      lines.push(`${ind}${objVar}.${f.name} = ${expr}; // ${simpleName(f.type)}${arr}`)
    }
    stack.pop()

    if (isArray) {
      const arrVar = preferred ?? fresh(base)
      lines.push(`${ind}${cls}[] ${arrVar} = new ${cls}[] { ${objVar} };`)
      return arrVar
    }
    return objVar
  }

  const ordered = topoSort(nodes, edges)
  // A name per step: the operation name, plus the step number when the flow calls the
  // same operation twice (so no Java variable is declared twice).
  const timesUsed = new Map<string, number>()
  for (const n of ordered) timesUsed.set(n.name, (timesUsed.get(n.name) ?? 0) + 1)
  const stepName = new Map<string, string>()
  const varName = new Map<string, string>()
  const stepNo = new Map<string, number>()
  ordered.forEach((n, i) => {
    stepNo.set(n.id, i + 1)
    const name = timesUsed.get(n.name)! > 1 ? `${lcfirst(n.name)}${i + 1}` : lcfirst(n.name)
    stepName.set(n.id, name)
    varName.set(n.id, `${name}Response`)
  })

  /** An input wired from an earlier step's output, when that is simple and safe: the
   *  same type (T ← T, T[] ← T[]), the first of a list (T ← T[]) or a one-element list
   *  (T[] ← T). Anything else (a result structure, ServiceData, a map) returns null. */
  function mapWire(srcVar: string, out: Port, input: Port): { expr: string; note: string } | null {
    if (javaBase(out.type) !== javaBase(input.type)) return null
    const outArr = out.type.includes('[]')
    const inArr = input.type.includes('[]')
    const src = `${srcVar}.${out.name}`
    if (outArr === inArr) return { expr: src, note: '' }
    if (outArr) return { expr: `${src}[0]`, note: ' (the first one: check it is the one you need)' }
    return { expr: `new ${javaBase(input.type)}[] { ${src} }`, note: '' }
  }

  /** For a result structure: which object fields could feed the input
   *  (" — createItemsResponse.output[i] has .item (Item), .itemRev (ItemRevision)"). */
  function wireHint(srcVar: string, out: Port): string {
    const objects = resolveFields(out.type).filter(
      (f) => !isPrimitive(f.type) && !f.type.includes(';') && resolveFields(f.type).length === 0
    )
    if (objects.length === 0) return ''
    const each = `${srcVar}.${out.name}${out.type.includes('[]') ? '[i]' : ''}`
    // "inputObject" & co. echo what was passed in (e.g. where-used: the part, not its parents)
    const say = (f: Port): string =>
      `.${f.name} (${javaType(f.type)}${/^input/i.test(f.name) ? ', the object you passed in' : ''})`
    return ` — ${each} has ${objects.map(say).join(', ')}`
  }

  const incoming = new Map<string, GenEdge[]>()
  for (const e of edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, [])
    incoming.get(e.target)!.push(e)
  }

  // Service stubs: one per library+service (core and cad both have DataManagementService)
  const serviceKey = (n: GenNode): string => `${n.include.split('.')[0]}.${n.lib}.${n.serviceStub}`
  const services = new Map<string, { cls: string; v: string }>()
  const usedVars = new Set<string>()
  for (const n of ordered) {
    const key = serviceKey(n)
    if (services.has(key)) continue
    const cls = `${ucfirst(n.serviceStub)}Service`
    let v = `${lcfirst(n.serviceStub)}Service`
    if (usedVars.has(v)) v = `${lcfirst(n.lib)}${ucfirst(v)}`
    usedVars.add(v)
    services.set(key, { cls, v })
  }

  const ind = '            '
  const B: string[] = [] // body; imports are only known after it's generated

  for (const n of ordered) {
    const { v: svcVar } = services.get(serviceKey(n))!
    const resp = varName.get(n.id)!
    const inEdges = incoming.get(n.id) ?? []
    const argType = (_i: number, port: Port): string => javaType(port.type)

    vals = n.values
    holdsCache.clear()
    B.push(`${ind}// --- Step ${stepNo.get(n.id)}: ${n.name}  [${n.lib} ${n.year} / ${n.serviceStub}] ---`)
    B.push(`${ind}// SOA: ${n.include}`)

    const argExprs: string[] = []
    n.inputs.forEach((port, i) => {
      const argVar = `${stepName.get(n.id)}${ucfirst(port.name)}`
      const wired = inEdges.find((e) => e.targetHandle === port.name)

      if (wired) {
        const srcNode = nodes.find((nn) => nn.id === wired.source)
        const srcVar = varName.get(wired.source)!
        const out = srcNode?.outputs.find((o) => o.name === wired.sourceHandle)
        const from = `${srcNode?.name ?? '?'}.${wired.sourceHandle}`
        const mapped = out ? mapWire(srcVar, out, port) : null
        if (mapped) {
          B.push(`${ind}${argType(i, port)} ${argVar} = ${mapped.expr}; // from step ${stepNo.get(wired.source)} (${from})${mapped.note}`)
        } else {
          const hint = out ? wireHint(srcVar, out) : ''
          B.push(`${ind}${argType(i, port)} ${argVar} = null; // TODO: map from ${from}${hint || ` (${srcVar}.${wired.sourceHandle})`}`)
        }
        argExprs.push(argVar)
        return
      }

      const given = givenValue(port.name, port.type)
      if (given) {
        B.push(`${ind}${argType(i, port)} ${argVar} = ${given}; // from your request`)
        argExprs.push(argVar)
        return
      }

      if (isPrimitive(port.type)) {
        const t = argType(i, port)
        B.push(`${ind}${t} ${argVar} = ${defaultValue(t)}; // TODO: set "${port.name}"`)
        argExprs.push(argVar)
        return
      }

      const expr = buildValue(port.type, B, ind, [], 0, argVar)
      if (expr === 'null' || expr.startsWith('null ')) {
        // nothing to build (object reference, map, ...) — declare it typed for the user to fill
        B.push(`${ind}${argType(i, port)} ${argVar} = null; // TODO: set "${port.name}"`)
        argExprs.push(argVar)
      } else argExprs.push(expr)
    })

    const call = `${svcVar}.${n.name}(${argExprs.join(', ')})`
    const respType = n.outputs.length ? `${ucfirst(n.name)}Response` : SERVICE_DATA
    if (respType) {
      B.push(`${ind}${respType} ${resp} = ${call};`)
      B.push(`${ind}// outputs: ${n.outputs.map((o) => o.name).join(', ')}`)
    } else {
      B.push(`${ind}${call};`)
    }
    B.push('')
  }

  const full = maxDepth > 1
  const L: string[] = []
  L.push('// ============================================================')
  L.push('// Generated by TC SOA Studio')
  L.push(`// Flow: ${ordered.map((n) => n.name).join(' -> ')}`)
  L.push(
    full
      ? '// Request objects expanded fully (stops at primitives / recursive types).'
      : '// Request objects expanded 1 level.'
  )
  L.push('// Values from your request are filled in ("from your request"); the rest are TODO.')
  L.push('// Inputs taken from an earlier step say "from step N".')
  L.push('// Java names are inferred from the API catalog: verify package, class and')
  L.push('// internal type names (e.g. custom business object types) for your site.')
  L.push('// ============================================================')
  L.push('')
  L.push(...imp.lines())
  L.push('')
  L.push('public class GeneratedSoaFlow {')
  L.push('')
  L.push(`    public static void run(${CONNECTION} connection,`)
  L.push('                           String user, String password) throws Exception {')
  L.push('')
  L.push(`        ${SESSION} sessionService = ${SESSION}.getService(connection);`)
  L.push('        sessionService.login(user, password, "", "", "", "");')
  L.push('')
  L.push('        try {')
  L.push('            // --- Service stubs ---')
  for (const { cls, v } of services.values()) L.push(`${ind}${cls} ${v} = ${cls}.getService(connection);`)
  L.push('')
  L.push(...B)
  L.push('        } finally {')
  L.push('            sessionService.logout();')
  L.push('        }')
  L.push('    }')
  L.push('}')
  return L.join('\n')
}
