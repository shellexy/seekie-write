import { create } from 'zustand'
import type { AppSettings, DocAsset, MenuCommandPayload, SaveUiStatus } from '@shared/types'
import { api } from '../lib/api'

export type SidebarMode = 'outline' | 'files' | 'backlinks'

export interface TabMeta {
  id: string
  title: string
  dirty: boolean
  sourcePath: string | null
  sourceExt: string | null
  savePath: string | null
  converted: boolean
  /** 是否有草稿（未落盘） */
  draft: boolean
  saveStatus: SaveUiStatus
  saveMessage?: string
  /** 外部修改冲突 */
  conflict: boolean
  assets: DocAsset[]
  /** 从上次保存时的 mtime 基线 */
  mtime: number | null
  scrollTop: number
}

export interface AppState {
  tabs: TabMeta[]
  activeId: string | null
  settings: AppSettings
  wordCount: number
  selCount: number
  charset: { chars: number; paragraphs: number }
  sidebarVisible: boolean
  zoom: number
  toast: { id: number; text: string; kind: 'info' | 'error' } | null
  converting: { active: boolean; label: string }

  init: (settings: AppSettings) => void
  setTabs: (tabs: TabMeta[]) => void
  upsertTab: (tab: TabMeta) => void
  patchTab: (id: string, patch: Partial<TabMeta>) => void
  removeTab: (id: string) => void
  setActive: (id: string | null) => void
  setWordCount: (n: number, sel: number, meta: { chars: number; paragraphs: number }) => void
  toggleSidebar: () => void
  setSidebar: (visible: boolean) => void
  setZoom: (z: number) => void
  notify: (text: string, kind?: 'info' | 'error') => void
  dismissToast: () => void
  setConverting: (active: boolean, label?: string) => void
  /** 用于冲突提示 */
  updateSettings: (patch: Partial<AppSettings>) => void
}

export const useApp = create<AppState>((set, get) => ({
  tabs: [],
  activeId: null,
  settings: {
    imageMode: 'relative',
    autoSaveDelay: 800,
    theme: 'system',
    sidebarVisible: true,
    sidebarWidth: 240,
    fontScale: 1,
  },
  wordCount: 0,
  selCount: 0,
  charset: { chars: 0, paragraphs: 0 },
  sidebarVisible: true,
  zoom: 1,
  toast: null,
  converting: { active: false, label: '' },

  init: (settings) =>
    set({ settings, sidebarVisible: settings.sidebarVisible }),

  setTabs: (tabs) => set({ tabs }),

  upsertTab: (tab) =>
    set((state) => {
      const index = state.tabs.findIndex((t) => t.id === tab.id)
      if (index === -1) return { tabs: [...state.tabs, tab] }
      const tabs = [...state.tabs]
      tabs[index] = { ...tabs[index], ...tab }
      return { tabs }
    }),

  patchTab: (id, patch) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
    })),

  removeTab: (id) => set((state) => ({ tabs: state.tabs.filter((t) => t.id !== id) })),

  setActive: (id) => set({ activeId: id }),

  setWordCount: (words, sel, meta) =>
    set({ wordCount: words, selCount: sel, charset: { chars: meta.chars, paragraphs: meta.paragraphs } }),

  toggleSidebar: () => {
    const next = !get().sidebarVisible
    set({ sidebarVisible: next })
    void api.settings.set({ sidebarVisible: next })
  },

  setSidebar: (visible) => {
    set({ sidebarVisible: visible })
    void api.settings.set({ sidebarVisible: visible })
  },

  setZoom: (zoom) => set({ zoom }),

  notify: (text, kind = 'info') => set({ toast: { id: Date.now(), text, kind } }),

  dismissToast: () => set({ toast: null }),

  setConverting: (active, label = '') => set({ converting: { active, label } }),

  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    void api.settings.set(patch)
  },
}))

export type MenuCommand = (payload: MenuCommandPayload) => void
