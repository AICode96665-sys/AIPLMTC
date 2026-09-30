import { app, BrowserWindow, Menu, clipboard, ipcMain, dialog, session, shell } from 'electron'
import { join, basename } from 'node:path'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { parseStructureJs, buildCatalog, type Catalog, type CatalogSummary, type LoadResult, type RawData } from '../shared'
import { changeOperation, planFlow, type AiPlan, type PlanStep } from '../shared/ai/planner'
import { planToJava } from '../shared/codegen/fromPlan'
import { LIMITS } from '../shared/edition'
import type { AiBuildResult, AiChangeResult } from '../shared/ai/status'
import { ensureOllamaRunning, listModels, ollamaChat, pullModel, type AiStatus } from './ollama'

// Note: this app does NOT bundle or redistribute any Teamcenter catalog data.
// Customers load their own structure.js (which they are licensed to possess).
// On first load we COPY that file into the app's private storage so the user
// supplies it only once — future launches open straight into the Studio.

interface LoadedState {
  rawData: RawData | null
  catalog: Catalog | null
  summary: CatalogSummary | null
}

const state: LoadedState = { rawData: null, catalog: null, summary: null }

// --- app-private cache (in userData) ---
const cacheJsPath = (): string => join(app.getPath('userData'), 'catalog.js')
const cacheMetaPath = (): string => join(app.getPath('userData'), 'catalog-meta.json')

function versionFromString(s: string): string {
  const m = s.match(/tc[\d._]+/i)
  return m ? m[0] : 'unknown'
}

/** Parse raw structure.js text into the in-memory catalog + summary. */
function applyData(rawText: string, sourceLabel: string, version: string): CatalogSummary {
  const rawData = parseStructureJs(rawText)
  const catalog = buildCatalog(rawData)
  const summary: CatalogSummary = {
    libraries: catalog.libs.length,
    services: catalog.services.length,
    operations: catalog.operations.length,
    version,
    sourceLabel
  }
  state.rawData = rawData
  state.catalog = catalog
  state.summary = summary
  return summary
}

/** Copy the loaded catalog into app storage so it persists across launches. */
function saveCache(rawText: string, sourceLabel: string, version: string): void {
  try {
    writeFileSync(cacheJsPath(), rawText, 'utf8')
    writeFileSync(cacheMetaPath(), JSON.stringify({ sourceLabel, version }), 'utf8')
  } catch {
    /* non-fatal: app still works this session, just won't auto-load next time */
  }
}

/** Load the previously cached catalog, if present. */
function tryLoadCache(): boolean {
  if (!existsSync(cacheJsPath())) return false
  let label = 'Saved catalog'
  let version = 'unknown'
  try {
    const meta = JSON.parse(readFileSync(cacheMetaPath(), 'utf8'))
    label = meta.sourceLabel ?? label
    version = meta.version ?? version
  } catch {
    /* meta optional */
  }
  applyData(readFileSync(cacheJsPath(), 'utf8'), label, version)
  return true
}

function clearCache(): void {
  for (const p of [cacheJsPath(), cacheMetaPath()]) {
    try {
      rmSync(p, { force: true })
    } catch {
      /* ignore */
    }
  }
}

/** Development run (electron-vite dev server) — DevTools and menus allowed. */
const isDev = Boolean(process.env['ELECTRON_RENDERER_URL'])

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    show: false,
    title: 'TC SOA Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true, // renderer has no Node.js access; only the window.tc bridge
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
      devTools: isDev // no DevTools in the released app
    }
  })
  win.on('ready-to-show', () => win.show())
  // links (e.g. https://ollama.com) open in the user's browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  // the app window may only ever show the app itself
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  if (isDev) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// --- IPC ---

ipcMain.handle('catalog:status', () => ({
  loaded: state.catalog !== null,
  summary: state.summary
}))

ipcMain.handle('catalog:loadPath', (_e, path: string): LoadResult => {
  try {
    if (!existsSync(path)) return { ok: false, error: 'File not found at that path' }
    const text = readFileSync(path, 'utf8')
    const label = basename(path)
    const version = versionFromString(path)
    const summary = applyData(text, label, version)
    saveCache(text, label, version)
    return { ok: true, summary }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('catalog:loadContent', (_e, name: string, text: string): LoadResult => {
  try {
    const version = versionFromString(name)
    const summary = applyData(text, name, version)
    saveCache(text, name, version)
    return { ok: true, summary }
  } catch (err) {
    return { ok: false, error: `Could not parse file: ${String(err)}` }
  }
})

ipcMain.handle('catalog:reset', () => {
  state.rawData = null
  state.catalog = null
  state.summary = null
  clearCache()
})

ipcMain.handle('catalog:get', (): Catalog | null => state.catalog)
ipcMain.handle('catalog:rawData', (): RawData | null => state.rawData)

ipcMain.handle('dialog:pickFile', async (): Promise<string | null> => {
  const r = await dialog.showOpenDialog({
    title: 'Select structure.js',
    properties: ['openFile'],
    filters: [
      { name: 'Teamcenter catalog', extensions: ['js'] },
      { name: 'All files', extensions: ['*'] }
    ]
  })
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
})

// --- AI assistant (local model via Ollama) ---

async function aiStatus(): Promise<AiStatus> {
  await ensureOllamaRunning() // installed but not running -> start it automatically
  const { running, models } = await listModels()
  const installed = models.some((x) => x.name === LIMITS.model)
  return { running, selected: installed ? LIMITS.model : null, model: LIMITS.model }
}

let aiAbort: AbortController | null = null

/** How deep generated Java builds nested request objects (see shared/edition.ts). */
const CODEGEN_DEPTH = LIMITS.codegenDepth

ipcMain.handle('ai:status', () => aiStatus())

ipcMain.handle('ai:plan', async (e, query: string): Promise<AiBuildResult> => {
  if (!state.catalog || !state.rawData) return { ok: false, error: 'Load a catalog first.', candidates: [] }
  const { running, selected } = await aiStatus()
  if (!running) return { ok: false, error: 'Ollama is not running. Start Ollama and try again.', candidates: [] }
  if (!selected) return { ok: false, error: `No AI model installed. Run: ollama pull ${LIMITS.model}`, candidates: [] }
  aiAbort?.abort()
  aiAbort = new AbortController()
  try {
    const result = await planFlow(state.catalog, query, ollamaChat(selected, aiAbort.signal), {
      onProgress: (m) => e.sender.send('ai:progress', m),
      maxSteps: LIMITS.maxSteps
    })
    if (!result.ok) return result
    e.sender.send('ai:progress', 'Writing Java code…')
    const byUrl = new Map(state.catalog.operations.map((o) => [o.url, o]))
    return { ...result, code: planToJava(result.plan, byUrl, state.rawData, CODEGEN_DEPTH) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), candidates: [] }
  } finally {
    aiAbort = null
  }
})

ipcMain.handle('ai:cancel', () => aiAbort?.abort())

/** Rebuild a plan sent back by the window from plain, checked values only. */
function sanitizePlan(p: unknown): AiPlan | null {
  const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.slice(0, max) : '')
  const plan = p as { steps?: unknown }
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0 || plan.steps.length > 20) return null
  const steps: PlanStep[] = plan.steps.map((raw): PlanStep => {
    const s = (raw ?? {}) as Record<string, any>
    const v = (s.values ?? {}) as Record<string, any>
    const c = (s.choice ?? {}) as Record<string, any>
    const by = ['recipe', 'setup', 'cleanup', 'only', 'ai', 'top', 'user'].includes(c.by) ? c.by : 'user'
    return {
      id: str(s.id, 20),
      url: str(s.url, 300),
      action: str(s.action, 300),
      source: s.source === 'recipe' ? 'recipe' : 'search',
      values: {
        objectType: str(v.objectType),
        file: str(v.file),
        properties: (Array.isArray(v.properties) ? v.properties : [])
          .slice(0, 50)
          .map((q: any) => ({ name: str(q?.name, 200), value: str(q?.value) }))
      },
      choice: {
        by,
        matched: c.matched === undefined ? undefined : str(c.matched, 300),
        forAction: c.forAction === undefined ? undefined : str(c.forAction, 300),
        options: (Array.isArray(c.options) ? c.options : [])
          .slice(0, 10)
          .map((o: any) => ({ url: str(o?.url, 300), score: Number(o?.score) || 0 }))
      }
    }
  })
  return { explanation: '', steps, connections: [] }
}

// "Change operation" in the chat: swap one step's operation, re-wire, regenerate the Java.
ipcMain.handle('ai:changeOperation', (_e, rawPlan: unknown, stepId: unknown, url: unknown): AiChangeResult => {
  if (!state.catalog || !state.rawData) return { ok: false, error: 'Load a catalog first.' }
  const plan = sanitizePlan(rawPlan)
  if (!plan || typeof stepId !== 'string' || typeof url !== 'string') return { ok: false, error: 'Invalid request.' }
  const next = changeOperation(state.catalog, plan, stepId, url)
  if (!next) return { ok: false, error: 'That operation is not in your catalog.' }
  const byUrl = new Map(state.catalog.operations.map((o) => [o.url, o]))
  return { ok: true, plan: next, code: planToJava(next, byUrl, state.rawData, CODEGEN_DEPTH) }
})

// --- Download the app's AI model through Ollama ("Download AI model" button) ---
// Only the app's own model can be downloaded; the UI cannot ask for another name.

let pullAbort: AbortController | null = null

ipcMain.handle('ai:pullModel', async (e): Promise<{ ok: true } | { ok: false; error: string }> => {
  if (pullAbort) return { ok: false, error: 'A download is already running.' }
  const model = LIMITS.model
  pullAbort = new AbortController()
  try {
    await pullModel(model, (p) => e.sender.send('ai:pullProgress', p), pullAbort.signal)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    pullAbort = null
  }
})

ipcMain.handle('ai:cancelPull', () => pullAbort?.abort())

/** Copy buttons: write text to the system clipboard (text only, size-capped). */
ipcMain.handle('clipboard:write', (_e, text: unknown) => {
  if (typeof text === 'string') clipboard.writeText(text.slice(0, 5_000_000))
})

// The released app refuses debugger/inspector switches (the Electron fuses also
// disable Node's own inspect flags in the packaged build).
if (app.isPackaged && process.argv.some((arg) => /^--(remote-debugging|inspect|js-flags)/.test(arg))) {
  app.exit(1)
}

app.whenReady().then(() => {
  if (!isDev) Menu.setApplicationMenu(null) // no reload / DevTools menu in the released app
  // Deny every browser permission (camera, location, notifications, clipboard, ...).
  // Copying goes through the 'clipboard:write' IPC below instead.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, done) => done(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  try {
    tryLoadCache()
  } catch {
    /* corrupt cache — renderer will show the loader */
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
