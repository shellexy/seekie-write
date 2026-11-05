import type { AppSettings } from './types'

/** main 与 renderer 共用的默认设置，避免两边各写一份 */
export const DEFAULT_SETTINGS: AppSettings = {
  imageMode: 'relative',
  autoSaveDelay: 800,
  theme: 'system',
  crepeTheme: 'app',
  contentWidth: 760,
  fontFamily: 'serif',
  fontSize: 16,
  sidebarVisible: true,
  sidebarWidth: 240,
  lastOpenDir: '',
  lastSaveDir: '',
  openInlineImages: false,
  restoreLastFiles: true,
  recentFiles: [],
}
