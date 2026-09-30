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

/** A successful AI plan plus the Java generated from it in the backend. */
export type AiBuildResult =
  | (Extract<AiPlanResult, { ok: true }> & { code: string })
  | Extract<AiPlanResult, { ok: false }>
