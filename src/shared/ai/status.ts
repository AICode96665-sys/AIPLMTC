import type { AiPlanResult } from './planner'

/** An installed local model. */
export interface AiModel {
  name: string
  sizeGB: number
  /** License forbids commercial use — never auto-picked; the UI warns. */
  nonCommercial: boolean
}

/** What the AI panel needs to know about the local AI engine. */
export interface AiStatus {
  running: boolean
  models: AiModel[]
  selected: string | null
  ramGB: number
  recommended: string
}

/** A successful AI plan plus the Java generated from it in the backend. */
export type AiBuildResult =
  | (Extract<AiPlanResult, { ok: true }> & { code: string })
  | Extract<AiPlanResult, { ok: false }>
