// Local AI engine: talks to Ollama (https://ollama.com) on this machine.
// Nothing leaves the computer — requests go to localhost only.

import { totalmem } from 'node:os'
import type { ChatFn, ChatMessage } from '../shared/ai/planner'
import type { AiModel } from '../shared/ai/status'

export type { AiStatus } from '../shared/ai/status'

const OLLAMA_URL = 'http://127.0.0.1:11434'

/** Models whose license does NOT allow commercial use. This app is sold, so it
 *  never recommends or auto-picks these (users are warned if they choose one).
 *  Qwen2.5 3B (and its Coder/VL/Omni variants) is under the Qwen Research
 *  License — unlike the 0.5B/1.5B/7B/14B/32B sizes, which are Apache-2.0. */
const NON_COMMERCIAL = [/^qwen2\.5(-coder|-vl|-omni)?:3b/i]

export function isNonCommercial(model: string): boolean {
  return NON_COMMERCIAL.some((re) => re.test(model))
}

/** Best commercially-licensed model for this machine's memory. */
export function recommendedModel(): string {
  const gb = totalmem() / 1024 ** 3
  if (gb >= 30) return 'qwen2.5-coder:14b' // Apache-2.0
  if (gb >= 12) return 'qwen2.5-coder:7b' // Apache-2.0
  return 'qwen2.5-coder:1.5b' // Apache-2.0 (small-machine choice; see eval results)
}

/** Preference order when the user hasn't picked a model yet (commercial licenses only). */
const PREFERRED = ['qwen2.5-coder:14b', 'qwen2.5-coder:7b', 'qwen2.5-coder', 'qwen3', 'phi4-mini', 'llama3', 'gemma3', 'mistral']

async function fetchWithTimeout(url: string, init: RequestInit, ms: number, signal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), ms)
  const onAbort = (): void => ctrl.abort(new Error('cancelled'))
  signal?.addEventListener('abort', onAbort)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

export async function listModels(): Promise<{ running: boolean; models: AiModel[] }> {
  try {
    const r = await fetchWithTimeout(`${OLLAMA_URL}/api/tags`, {}, 2500)
    if (!r.ok) return { running: false, models: [] }
    const j = (await r.json()) as { models?: { name: string; size: number }[] }
    const models = (j.models ?? [])
      .filter((m) => !/embed/i.test(m.name)) // embedding models can't chat
      .map((m) => ({
        name: m.name,
        sizeGB: Math.round((m.size / 1024 ** 3) * 10) / 10,
        nonCommercial: isNonCommercial(m.name)
      }))
    return { running: true, models }
  } catch {
    return { running: false, models: [] }
  }
}

export function pickDefaultModel(models: AiModel[]): string | null {
  const allowed = models.filter((m) => !m.nonCommercial)
  for (const pref of PREFERRED) {
    const m = allowed.find((x) => x.name === pref || x.name.startsWith(pref))
    if (m) return m.name
  }
  return allowed[0]?.name ?? null
}

/** A ChatFn bound to one model. Uses Ollama structured outputs so the reply
 *  always matches the JSON schema (op names limited to real catalog ops). */
export function ollamaChat(model: string, signal?: AbortSignal): ChatFn {
  return async (messages: ChatMessage[], schema: object): Promise<string> => {
    let r: Response
    try {
      r = await fetchWithTimeout(
        `${OLLAMA_URL}/api/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            format: schema,
            stream: false,
            options: { temperature: 0, num_ctx: 8192 }
          })
        },
        5 * 60 * 1000, // CPU-only machines can be slow on the first (model-loading) call
        signal
      )
    } catch (err) {
      if (signal?.aborted) throw new Error('Cancelled.')
      throw new Error(`Could not reach Ollama — is it running? (${String(err)})`)
    }
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      if (r.status === 404) throw new Error(`Model "${model}" is not installed. Run: ollama pull ${model}`)
      throw new Error(`Ollama error ${r.status}: ${body.slice(0, 300)}`)
    }
    const j = (await r.json()) as { message?: { content?: string } }
    return j.message?.content ?? ''
  }
}

export function ramGB(): number {
  return Math.round(totalmem() / 1024 ** 3)
}
