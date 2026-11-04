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
} from '@shared/types'

/** 浏览器里跑（vite dev 直接用 Chrome 打开）时的兜底实现，方便只调前端 */
const isElectron = typeof window !== 'undefined' && 'seekie' in window

const mockSettings: AppSettings = {
  imageMode: 'relative',
  autoSaveDelay: 800,
  theme: 'system',
  sidebarVisible: true,
  sidebarWidth: 240,
  fontScale: 1,
}

const noop = () => {}
const unsub = () => noop

const mock = {
  window: {
    minimize: noop,
    toggleMaximize: noop,
    close: noop,
    isMaximized: async () => false,
    onStateChange: (_cb: (p: WindowStatePayload) => void) => unsub(),
    setTitle: noop,
  },
  file: {
    pickOpen: async () => null,
    openPath: async () => false,
    read: async (path: string): Promise<OpenResult> => ({
      ok: false,
      error: `浏览器预览模式无法读取本地文件：${path}`,
      converted: false,
      sourcePath: null,
      sourceExt: null,
      suggestedSavePath: null,
      markdown: '',
      assets: [],
      title: path,
    }),
    save: async (): Promise<SaveResult> => ({ status: 'canceled' }),
    mtime: async () => null,
    reveal: async () => {},
  },
  asset: {
    register: async () => true,
    put: async () => true,
    drop: async () => true,
  },
  draft: {
    save: async (draft: Omit<DraftState, 'draftPath'>): Promise<DraftState> => ({
      ...draft,
      draftPath: `(预览模式) ${draft.tabId}.md`,
    }),
    drop: async () => true,
    loadSession: async (): Promise<SessionState> => ({ tabs: [], activeTabId: null }),
  },
  settings: {
    get: async (): Promise<AppSettings> => {
      try {
        const raw = localStorage.getItem('seekie.settings')
        return raw ? { ...mockSettings, ...JSON.parse(raw) } : mockSettings
      } catch {
        return mockSettings
      }
    },
    set: async (patch: Partial<AppSettings>): Promise<AppSettings> => {
      const next = { ...mockSettings, ...patch }
      localStorage.setItem('seekie.settings', JSON.stringify(next))
      return next
    },
  },
  menu: {
    onCommand: (_cb: (p: MenuCommandPayload) => void) => unsub(),
  },
  app: {
    onOpenFile: (_cb: (p: string) => void) => unsub(),
    toggleDevTools: async () => {},
    onBeforeClose: (_cb: () => void | Promise<void>) => unsub(),
    onDragDropFile: (_cb: (paths: string[]) => void) => unsub(),
  },
  platform: 'browser',
}

export interface SeekieApi {
  window: {
    minimize: () => void
    toggleMaximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    onStateChange: (cb: (payload: WindowStatePayload) => void) => () => void
    setTitle: (title: string) => void
  }
  file: {
    pickOpen: () => Promise<string | null>
    openPath: (path: string) => Promise<boolean>
    read: (path: string, tabId: string) => Promise<OpenResult>
    save: (req: SaveRequest) => Promise<SaveResult>
    mtime: (path: string | null) => Promise<number | null>
    reveal: (path: string) => Promise<void>
  }
  asset: {
    register: (tabId: string, list: DocAsset[]) => Promise<boolean>
    put: (tabId: string, asset: DocAsset) => Promise<boolean>
    drop: (tabId: string) => Promise<boolean>
  }
  draft: {
    save: (draft: Omit<DraftState, 'draftPath'>) => Promise<DraftState>
    drop: (tabId: string) => Promise<boolean>
    loadSession: () => Promise<SessionState>
  }
  settings: {
    get: () => Promise<AppSettings>
    set: (patch: Partial<AppSettings>) => Promise<AppSettings>
  }
  menu: {
    onCommand: (cb: (payload: MenuCommandPayload) => void) => () => void
  }
  app: {
    onOpenFile: (cb: (path: string) => void) => () => void
    toggleDevTools: () => Promise<void>
    onBeforeClose: (cb: () => void | Promise<void>) => () => void
    onDragDropFile: (cb: (paths: string[]) => void) => () => void
  }
  platform: string
}

type RealApi = SeekieApi

export const api: RealApi = (isElectron ? (window as any).seekie : (mock as unknown)) as RealApi

export const inElectron = isElectron

export type { DocAsset }
