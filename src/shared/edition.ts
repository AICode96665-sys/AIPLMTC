// Limits of the released app, enforced in the main process.

export interface EditionLimits {
  /** The AI model the app uses (Apache-2.0 licensed). */
  model: string
  /** Most actions one request may have (Basic + Medium requests are 1–3). */
  maxSteps: number
  /** How deep request objects are built in the generated Java. */
  codegenDepth: number
}

export const LIMITS: EditionLimits = {
  model: 'qwen2.5-coder:1.5b', // Apache-2.0; ~1 GB; 91% on Basic+Medium tests, ~2 s
  maxSteps: 3,
  codegenDepth: 1
}
