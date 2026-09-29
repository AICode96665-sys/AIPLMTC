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
  aiSetModel: (model: string): Promise<void> => ipcRenderer.invoke('ai:setModel', model),
  aiPlan: (query: string): Promise<AiBuildResult> => ipcRenderer.invoke('ai:plan', query),
  aiCancel: (): Promise<void> => ipcRenderer.invoke('ai:cancel'),
  copyText: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:write', text),

  /** Subscribe to progress messages; returns an unsubscribe function. */
  onAiProgress: (cb: (message: string) => void): (() => void) => {
    const handler = (_e: unknown, m: string): void => cb(m)
    ipcRenderer.on('ai:progress', handler)
    return () => ipcRenderer.removeListener('ai:progress', handler)
  }
}

contextBridge.exposeInMainWorld('tc', api)

export type TcApi = typeof api
