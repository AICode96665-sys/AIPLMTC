import { app, BrowserWindow, Menu, clipboard, ipcMain, dialog, session, shell } from 'electron'
import { join, basename } from 'node:path'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { parseStructureJs, buildCatalog, type Catalog, type CatalogSummary, type LoadResult, type RawData } from '../shared'
import { planFlow, UNDERSTAND_PROMPT, type AiPlan } from '../shared/ai/planner'
import { planToJava } from '../shared/codegen/fromPlan'
import { LIMITS } from '../shared/edition'
import { STAGES } from '../shared/ai/progress'
import type { AiBuildResult, OperationNotes } from '../shared/ai/status'
import { getRecipes, resolveOp } from '../shared/ai/recipes'
import { ensureOllamaRunning, listModels, ollamaChat, pullModel, unloadModel, warmUp, type AiStatus } from './ollama'

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
    // Shown at once in the app's colour: on Windows the page can take seconds to start
    // (process start-up checks on unsigned apps), and an empty app colour beats nothing.
    show: true,
    backgroundColor: '#ffffff',
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
  flows.clear() // flows refer to the old catalog
  clearCache()
})

ipcMain.handle('catalog:get', (): Catalog | null => state.catalog)

// version shown in the Feedback & contact panel
ipcMain.handle('app:version', (): string => app.getVersion())

// Operation details panel: what the recipe book knows about one operation. Only facts from
// the recipe book, resolved in the user's catalog; nothing is generated.
ipcMain.handle('catalog:operationNotes', (_e, url: unknown): OperationNotes => {
  const notes: OperationNotes = { needsFirst: [], followWith: [], partOf: [] }
  const catalog = state.catalog
  if (!catalog || typeof url !== 'string') return notes
  const names = (specs: string[] = []): string[] =>
    specs.map((s) => resolveOp(catalog, s)?.name).filter((n): n is string => !!n)
  const add = (list: string[], items: string[]): void => items.forEach((x) => list.includes(x) || list.push(x))
  for (const recipe of getRecipes()) {
    const ops = recipe.steps.map((s) => resolveOp(catalog, s)).filter((o) => !!o)
    if (!ops.some((o) => o!.url === url)) continue
    add(notes.needsFirst, names(recipe.before))
    add(notes.followWith, names(recipe.after))
    if (ops.length > 1) add(notes.partOf, [ops.map((o) => o!.name).join(' → ')])
  }
  return notes
})
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

/** When the model was last loaded in the background (see warmUp). */
let warmedAt = 0

async function aiStatus(): Promise<AiStatus> {
  await ensureOllamaRunning() // installed but not running -> start it automatically
  const { running, models } = await listModels()
  const installed = models.some((x) => x.name === LIMITS.model)
  // Load the model in the background as soon as we know it's there, so the first request
  // doesn't wait for it (~7 s). Requests themselves keep it loaded afterwards.
  if (installed && Date.now() - warmedAt > 20 * 60 * 1000) {
    warmedAt = Date.now()
    void warmUp(LIMITS.model, UNDERSTAND_PROMPT)
  }
  return { running, selected: installed ? LIMITS.model : null, model: LIMITS.model }
}

let aiAbort: AbortController | null = null

/** How deep generated Java builds nested request objects (see shared/edition.ts). */
const CODEGEN_DEPTH = LIMITS.codegenDepth

ipcMain.handle('ai:status', () => aiStatus())

/** Flows made in this session, so a follow-up request can continue one. The window only
 *  sends an id back, never a plan, so what gets continued is always our own data. */
const flows = new Map<number, AiPlan>()
let nextFlowId = 1
const MAX_KEPT_FLOWS = 50

ipcMain.handle('ai:plan', async (e, query: string, continueFrom?: number): Promise<AiBuildResult> => {
  if (typeof query !== 'string') return { ok: false, error: 'Invalid request.', candidates: [] }
  if (!state.catalog || !state.rawData) return { ok: false, error: 'Load a catalog first.', candidates: [] }
  const { running, selected } = await aiStatus()
  if (!running) return { ok: false, error: 'Ollama is not running. Start Ollama and try again.', candidates: [] }
  if (!selected) return { ok: false, error: `No AI model installed. Run: ollama pull ${LIMITS.model}`, candidates: [] }
  aiAbort?.abort()
  aiAbort = new AbortController()
  try {
    const result = await planFlow(state.catalog, query, ollamaChat(selected, aiAbort.signal), {
      onProgress: (m) => e.sender.send('ai:progress', m),
      maxSteps: LIMITS.maxSteps,
      base: typeof continueFrom === 'number' ? flows.get(continueFrom) : undefined,
      maxTotalSteps: LIMITS.maxFlowSteps
    })
    if (!result.ok) return result
    e.sender.send('ai:progress', STAGES.java.doing)
    const planId = nextFlowId++
    flows.set(planId, result.plan)
    if (flows.size > MAX_KEPT_FLOWS) flows.delete(flows.keys().next().value!)
    const byUrl = new Map(state.catalog.operations.map((o) => [o.url, o]))
    return { ...result, planId, code: planToJava(result.plan, byUrl, state.rawData, CODEGEN_DEPTH) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), candidates: [] }
  } finally {
    aiAbort = null
  }
})

ipcMain.handle('ai:cancel', () => aiAbort?.abort())

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
  // Start Ollama and get the model ready now, while Windows is still starting the window
  // (several seconds): then the user's first request is as fast as later ones.
  void aiStatus().catch(() => {})
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // free the model's memory (it is kept loaded while the app is open), then quit
  if (process.platform !== 'darwin') void unloadModel(LIMITS.model).finally(() => app.quit())
})
