import type { AiPlanResult } from './planner'

/** An installed local model. */
export interface AiModel {
  name: string
  sizeGB: number
}

/** What the AI panel needs to know about the local AI engine. */
export interface AiStatus {
  /** Ollama is answering on this PC. */
  running: boolean
  /** The app's model if it is installed, else null. */
  selected: string | null
  /** The model this app uses (see shared/edition.ts). */
  model: string
}

/** What the recipe book knows about one operation (operation details panel). Operation
 *  names only, resolved in the user's catalog; empty when no recipe uses the operation. */
export interface OperationNotes {
  /** operations that must come earlier (e.g. createBOMWindows before adding a BOM line) */
  needsFirst: string[]
  /** operations that must follow at the end (e.g. saveBOMWindows, closeBOMWindows) */
  followWith: string[]
  /** multi-step jobs it is part of, e.g. "createDatasets → getDatasetWriteTickets → commitDatasetFiles" */
  partOf: string[]
}

/** A successful AI plan plus the Java generated from it in the backend. `planId` lets a
 *  follow-up request ("check out this object") continue this flow. */
export type AiBuildResult =
  | (Extract<AiPlanResult, { ok: true }> & { code: string; planId: number })
  | Extract<AiPlanResult, { ok: false }>
