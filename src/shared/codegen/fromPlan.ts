// Turns a validated AI plan into Java (see java.ts).

import type { AiPlan } from '../ai/planner'
import type { Operation, RawData } from '../types'
import { makeFieldResolver, operationPorts } from '../ports'
import { generateJava, type GenEdge, type GenNode } from './java'

export function planToJava(
  plan: AiPlan,
  byUrl: Map<string, Operation>,
  rawData: RawData,
  maxDepth: number
): string {
  const nodes: GenNode[] = []
  for (const step of plan.steps) {
    const op = byUrl.get(step.url)
    if (!op) continue
    nodes.push({
      id: step.id,
      name: op.name,
      lib: op.lib,
      serviceStub: op.serviceStub,
      year: op.year,
      include: op.include,
      ...operationPorts(op),
      values: step.values
    })
  }
  const edges: GenEdge[] = plan.connections.map((c) => ({
    source: c.from,
    sourceHandle: c.fromPort,
    target: c.to,
    targetHandle: c.toPort
  }))
  return generateJava(nodes, edges, makeFieldResolver(rawData), maxDepth)
}
