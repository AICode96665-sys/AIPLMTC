// Turns the raw `data` tree (from structure.js) into a flat, sorted catalog of
// libraries, services, and operations. Port of the iteration logic in api.js.

import type { Catalog, LibEntry, Operation, RawData, ServiceEntry } from './types'
import { htmlToText } from './text'

function normalizeYear(yearKey: string): string {
  // "_2013_05" -> "2013-05"
  return yearKey.slice(1).replace('_', '-')
}

export function buildCatalog(data: RawData): Catalog {
  const libsMap = new Map<string, LibEntry>()
  const servicesMap = new Map<string, ServiceEntry>()
  const operations: Operation[] = []

  const addOperation = (
    template: string,
    lib: string,
    service: string,
    yearKey: string,
    op: string,
    opObj: any,
    internal: boolean
  ): void => {
    const year = normalizeYear(yearKey)
    const serviceName = `${service} - ${year}`

    const libEntry = libsMap.get(lib) ?? { name: lib, operations: [] }
    libEntry.operations.push(op)
    libsMap.set(lib, libEntry)

    const svcEntry = servicesMap.get(serviceName) ?? { name: serviceName, lib, operations: [] }
    svcEntry.operations.push(op)
    servicesMap.set(serviceName, svcEntry)

    const url = `${internal ? 'Internal-' : ''}${lib}-${year}-${service}/${op}`
    const include = `${template}.Soa.${lib}._${year.replace('-', '_')}.${service}.${op}`

    const operation: Operation = {
      lib,
      service: serviceName,
      serviceStub: service,
      year,
      name: op,
      url,
      include,
      internal,
      description: htmlToText(opObj?.description ?? ''),
      input: Array.isArray(opObj) ? opObj : opObj?.input ?? {},
      output: Array.isArray(opObj) ? '' : opObj?.output ?? {}
    }
    operations.push(operation)
  }

  const walkLibs = (template: string, root: RawData, internal: boolean): void => {
    for (const lib in root) {
      if (!internal && lib === 'Internal') continue
      for (const yearKey in root[lib]) {
        for (const service in root[lib][yearKey]) {
          for (const op in root[lib][yearKey][service]) {
            // real operations start lowercase and aren't numeric indices
            if (op[0] === op[0].toLowerCase() && isNaN(Number(op))) {
              addOperation(template, lib, service, yearKey, op, root[lib][yearKey][service][op], internal)
            }
          }
        }
      }
    }
  }

  for (const template in data) {
    const soa = data[template]?.Soa
    if (!soa) continue
    walkLibs(template, soa, false)
    if (soa.Internal) walkLibs(template, soa.Internal, true)
  }

  const byName = <T extends { name: string }>(a: T, b: T): number =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0

  const libs = [...libsMap.values()].sort(byName)
  const services = [...servicesMap.values()].sort(byName)
  operations.sort((a, b) => {
    const n = byName(a, b)
    if (n !== 0) return n
    return a.year < b.year ? -1 : a.year > b.year ? 1 : 0
  })

  return { libs, services, operations }
}
