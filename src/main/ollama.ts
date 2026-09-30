// Local AI engine: talks to Ollama (https://ollama.com) on this machine.
// Nothing leaves the computer — requests go to localhost only.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ChatFn, ChatMessage } from '../shared/ai/planner'
import type { AiModel } from '../shared/ai/status'

export type { AiStatus } from '../shared/ai/status'

// start.bat runs its own portable Ollama (runtime/ollama, port 11435) and tells the app
// through these variables; otherwise the app uses a normally installed Ollama.
const OLLAMA_URL = process.env['TC_OLLAMA_URL'] || 'http://127.0.0.1:11434'
const PORTABLE_OLLAMA = process.env['TC_OLLAMA_EXE'] // runtimeollamaollama.exe, if any

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
      .map((m) => ({ name: m.name, sizeGB: Math.round((m.size / 1024 ** 3) * 10) / 10 }))
    return { running: true, models }
  } catch {
    return { running: false, models: [] }
  }
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


export interface PullProgress {
  /** Ollama's status text, e.g. "pulling manifest", "verifying sha256 digest", "success". */
  status: string
  /** Bytes done / total for the current layer (only while downloading). */
  completed?: number
  total?: number
}

/** Download a model through the local Ollama (it fetches from its own library).
 *  Streams progress to `onProgress`; resolves when Ollama reports success. */
export async function pullModel(
  model: string,
  onProgress: (p: PullProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  let r: Response
  try {
    r = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
      signal
    })
  } catch (err) {
    if (signal?.aborted) throw new Error('Download cancelled.')
    throw new Error(`Could not reach Ollama — is it running? (${String(err)})`)
  }
  if (!r.ok || !r.body) throw new Error(`Ollama error ${r.status}: ${(await r.text().catch(() => '')).slice(0, 300)}`)

  // newline-delimited JSON: one progress object per line
  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let done = false
  try {
    while (!done) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line) continue
        const msg = JSON.parse(line) as PullProgress & { error?: string }
        if (msg.error) throw new Error(`Download failed: ${msg.error}`)
        onProgress({ status: msg.status, completed: msg.completed, total: msg.total })
        if (msg.status === 'success') done = true
      }
    }
  } catch (err) {
    if (signal?.aborted) throw new Error('Download cancelled.')
    throw err
  }
  if (!done) throw new Error('Download ended before it finished. Please try again.')
}

// --- Start Ollama automatically -------------------------------------------------

/** Where Ollama is installed: its tray app (preferred) or the ollama CLI. */
function findOllama(): { app?: string; cli?: string } {
  const base = process.env['LOCALAPPDATA'] ? join(process.env['LOCALAPPDATA'], 'Programs', 'Ollama') : ''
  const app = base && existsSync(join(base, 'ollama app.exe')) ? join(base, 'ollama app.exe') : undefined
  let cli = base && existsSync(join(base, 'ollama.exe')) ? join(base, 'ollama.exe') : undefined
  if (!cli) {
    const w = spawnSync('where', ['ollama'], { encoding: 'utf8', windowsHide: true })
    cli = w.status === 0 ? w.stdout.split(/\r?\n/)[0].trim() || undefined : undefined
  }
  return { app, cli }
}

export type OllamaStart = 'running' | 'started' | 'not-installed' | 'failed'

/** Make sure the local Ollama server is up: if it's installed but not running,
 *  start it (its tray app, or "ollama serve") and wait up to ~20 s. Only the
 *  known Ollama executables are started — never anything from user input. */
export async function ensureOllamaRunning(): Promise<OllamaStart> {
  if ((await listModels()).running) return 'running'
  // portable Ollama from start.bat: its settings (OLLAMA_HOST, OLLAMA_MODELS) are in our environment
  const portable = PORTABLE_OLLAMA && existsSync(PORTABLE_OLLAMA) ? PORTABLE_OLLAMA : undefined
  const { app, cli } = portable ? { app: undefined, cli: portable } : findOllama()
  if (!app && !cli) return 'not-installed'
  try {
    const child = app
      ? spawn(app, [], { detached: true, stdio: 'ignore', windowsHide: true })
      : spawn(cli!, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true, env: process.env })
    child.on('error', () => {})
    child.unref()
  } catch {
    return 'failed'
  }
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500))
    if ((await listModels()).running) return 'started'
  }
  return 'failed'
}
