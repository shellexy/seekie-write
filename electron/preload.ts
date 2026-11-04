import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type {
  AppSettings,
  DocAsset,
  DraftState,
  MenuCommandPayload,
  OpenResult,
  SaveRequest,
  SaveResult,
  SessionState,
  WindowStatePayload,
} from '../shared/types'

/**
 * 只暴露白名单 API。渲染进程没有任何 fs / node 能力。
 */
const api = {
  window: {
    minimize: () => ipcRenderer.send(IPC.winMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.winToggleMaximize),
    close: () => ipcRenderer.send(IPC.winClose),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC.winIsMaximized),
    onStateChange: (cb: (payload: WindowStatePayload) => void) => {
      const listener = (_e: unknown, payload: WindowStatePayload) => cb(payload)
      ipcRenderer.on(IPC.winMaximizedChanged, listener)
      return () => ipcRenderer.off(IPC.winMaximizedChanged, listener)
    },
    setTitle: (title: string) => ipcRenderer.send(IPC.winSetTitle, title),
  },
  file: {
    pickOpen: (): Promise<string | null> => ipcRenderer.invoke(IPC.fileOpenDialog),
    openPath: (path: string): Promise<boolean> => ipcRenderer.invoke(IPC.fileOpenPath, path),
    read: (path: string, tabId: string): Promise<OpenResult> =>
      ipcRenderer.invoke(IPC.fileReadMarkdown, path, tabId),
    save: (req: SaveRequest): Promise<SaveResult> => ipcRenderer.invoke(IPC.fileSave, req),
    mtime: (path: string | null): Promise<number | null> => ipcRenderer.invoke('file:mtime', path),
    reveal: (path: string): Promise<void> => ipcRenderer.invoke(IPC.fileReveal, path),
  },
  asset: {
    register: (tabId: string, list: DocAsset[]) => ipcRenderer.invoke(IPC.assetRegister, tabId, list),
    put: (tabId: string, asset: DocAsset) => ipcRenderer.invoke(IPC.assetPut, tabId, asset),
    drop: (tabId: string) => ipcRenderer.invoke(IPC.assetDrop, tabId),
  },
  draft: {
    save: (draft: Omit<DraftState, 'draftPath'>): Promise<DraftState> =>
      ipcRenderer.invoke(IPC.draftSave, draft),
    drop: (tabId: string) => ipcRenderer.invoke(IPC.draftDrop, tabId),
    loadSession: (): Promise<SessionState> => ipcRenderer.invoke(IPC.draftLoadSession),
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.settingsSet, patch),
  },
  menu: {
    onCommand: (cb: (payload: MenuCommandPayload) => void) => {
      const listener = (_e: unknown, payload: MenuCommandPayload) => cb(payload)
      ipcRenderer.on(IPC.menuCommand, listener)
      return () => ipcRenderer.off(IPC.menuCommand, listener)
    },
  },
  app: {
    onOpenFile: (cb: (path: string) => void) => {
      const listener = (_e: unknown, path: string) => cb(path)
      ipcRenderer.on(IPC.openFileRequest, listener)
      return () => ipcRenderer.off(IPC.openFileRequest, listener)
    },
    toggleDevTools: () => ipcRenderer.invoke('app:toggle-dev-tools'),
    /** 主进程要关窗口时通知渲染层先落盘 */
    onBeforeClose: (cb: () => void | Promise<void>) => {
      const listener = async () => {
        await cb()
        ipcRenderer.send(IPC.closeReady)
      }
      ipcRenderer.on(IPC.beforeClose, listener)
      return () => ipcRenderer.off(IPC.beforeClose, listener)
    },
    /** 拖文件到窗口 */
    onDragDropFile: (cb: (paths: string[]) => void) => {
      const listener = (_e: unknown, paths: string[]) => cb(paths)
      ipcRenderer.on(IPC.dragDropFile, listener)
      return () => ipcRenderer.off(IPC.dragDropFile, listener)
    },
  },
  platform: process.platform,
}

export type SeekieApi = typeof api

contextBridge.exposeInMainWorld('seekie', api)
