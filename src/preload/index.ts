import { contextBridge, ipcRenderer } from 'electron'
import type { Catalog, RawData, CatalogSummary, LoadResult } from '../shared'
import type { AiBuildResult, AiStatus } from '../shared/ai/status'

const api = {
  status: (): Promise<{ loaded: boolean; summary: CatalogSummary | null }> =>
    ipcRenderer.invoke('catalog:status'),
  loadPath: (path: string): Promise<LoadResult> => ipcRenderer.invoke('catalog:loadPath', path),
  loadContent: (name: string, text: string): Promise<LoadResult> =>
    ipcRenderer.invoke('catalog:loadContent', name, text),
  reset: (): Promise<void> => ipcRenderer.invoke('catalog:reset'),
  pickFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFile'),
  getCatalog: (): Promise<Catalog> => ipcRenderer.invoke('catalog:get'),
  getRawData: (): Promise<RawData> => ipcRenderer.invoke('catalog:rawData'),

  // AI assistant
  aiStatus: (): Promise<AiStatus> => ipcRenderer.invoke('ai:status'),
  /** Plan a request; a follow-up ("check out this object") continues flow `continueFrom`. */
  aiPlan: (query: string, continueFrom?: number): Promise<AiBuildResult> =>
    ipcRenderer.invoke('ai:plan', query, continueFrom),
  aiCancel: (): Promise<void> => ipcRenderer.invoke('ai:cancel'),
  copyText: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:write', text),
  /** Download the app's AI model through Ollama. */
  aiPullModel: (): Promise<{ ok: true } | { ok: false; error: string }> => ipcRenderer.invoke('ai:pullModel'),
  aiCancelPull: (): Promise<void> => ipcRenderer.invoke('ai:cancelPull'),
  /** Subscribe to download progress; returns an unsubscribe function. */
  onAiPullProgress: (cb: (p: { status: string; completed?: number; total?: number }) => void): (() => void) => {
    const handler = (_e: unknown, p: { status: string; completed?: number; total?: number }): void => cb(p)
    ipcRenderer.on('ai:pullProgress', handler)
    return () => ipcRenderer.removeListener('ai:pullProgress', handler)
  },

  /** Subscribe to progress messages; returns an unsubscribe function. */
  onAiProgress: (cb: (message: string) => void): (() => void) => {
    const handler = (_e: unknown, m: string): void => cb(m)
    ipcRenderer.on('ai:progress', handler)
    return () => ipcRenderer.removeListener('ai:progress', handler)
  }
}

contextBridge.exposeInMainWorld('tc', api)

export type TcApi = typeof api
