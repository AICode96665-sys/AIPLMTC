// Shared type definitions for the Teamcenter SOA catalog.
// These mirror the shape of the data found in structure.js.

/** Raw, untyped namespace tree loaded from structure.js (`const data = {...}`). */
export type RawData = Record<string, any>

/** A single field within a request/response object. */
export interface Field {
  type: string
  description?: string
  /** Filled in lazily by the expander: resolved definition of `type`. */
  properties?: TypeDef
  /** Set when a cyclic type reference is detected (stops infinite recursion). */
  recursive?: boolean
}

/** A map type, e.g. `String;BusinessObject[]`. `$` marks it as a map. */
export interface MapDef {
  $: true
  key: Field
  value: Field
}

export type FieldMap = Record<string, Field>

/** The resolved definition of a type: an object of fields, a map, a base-type
 *  alias (string), or an enum (string[]). */
export type TypeDef = FieldMap | MapDef | string | string[]

/** A callable SOA operation. */
export interface Operation {
  lib: string
  /** "DataManagement - 2013-05" */
  service: string
  /** "DataManagement" */
  serviceStub: string
  /** "2013-05" */
  year: string
  name: string
  /** "Core-2013-05-DataManagement/createObjects" */
  url: string
  /** "Teamcenter.Soa.Core._2013_05.DataManagement.createObjects" */
  include: string
  internal: boolean
  description: string
  input: TypeDef
  output: TypeDef
}

export interface LibEntry {
  name: string
  operations: string[]
}

export interface ServiceEntry {
  name: string
  lib: string
  operations: string[]
}

export interface Catalog {
  libs: LibEntry[]
  services: ServiceEntry[]
  operations: Operation[]
}

export interface CatalogSummary {
  libraries: number
  services: number
  operations: number
  version: string
  sourceLabel: string
}

export type LoadResult = { ok: true; summary: CatalogSummary } | { ok: false; error: string }

export const PRIMITIVES: Record<string, string> = {
  bool: 'boolean',
  char: 'char',
  double: 'double',
  float: 'float',
  int: 'int',
  void: 'null',
  String: 'String',
  boolean: 'boolean',
  Date: 'Date',
  IModelObject: 'IModelObject',
  tag_t: 'tag_t'
}
