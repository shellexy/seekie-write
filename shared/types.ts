/** main 与 renderer 共享的类型定义（不依赖 electron / DOM） */

export type ImageSaveMode = 'relative' | 'base64'

/** 外观：跟随系统 / 浅色 / 深色 */
export type ThemeMode = 'light' | 'dark' | 'system'

/** 编辑器主题：跟随应用配色，或 Crepe 自带主题 */
export type CrepeTheme = 'app' | 'frame' | 'classic' | 'nord'

/** 正文字体族 */
export type EditorFontFamily = 'serif' | 'sans' | 'mono'

/** 转换后的内嵌资源（图片），保存在内存里，等保存文档时再落盘 */
export interface DocAsset {
  /** 在本文档内的编号，用于 seekie-asset://<tabId>/<assetId> */
  id: number
  mediaType: string
  /** 建议的文件名，如 image-1.png */
  fileName: string
  /** base64 编码的字节（走 IPC 时不传 Buffer） */
  base64: string
}

/** 打开文档的结果 */
export interface OpenResult {
  ok: boolean
  /** 失败原因（面向用户的中文提示） */
  error?: string
  /** 是否走了 anydoc 转换 */
  converted: boolean
  /** 原始文件绝对路径 */
  sourcePath: string | null
  /** 原始扩展名，含点，如 .docx */
  sourceExt: string | null
  /** 首次保存建议的完整路径（季度报告.docx → 季度报告.docx.md） */
  suggestedSavePath: string | null
  markdown: string
  assets: DocAsset[]
  /** 文档标题（文件名） */
  title: string
}

export type SaveKind = 'auto' | 'manual' | 'saveAs'

export interface SaveRequest {
  tabId: string
  /** 当前目标路径，null 表示还没有落盘位置（需要另存为） */
  savePath: string | null
  markdown: string
  /** 保存图片的策略 */
  imageMode: ImageSaveMode
  /** 仅当 markdown 里还残留 seekie-asset:// 时才需要，用于落盘图片 */
  assets: DocAsset[]
  kind: SaveKind
  /** 另存为对话框的默认文件名 */
  suggestedName?: string
  /** 保存前磁盘文件的 mtime 基线，用于检测外部修改 */
  expectedMtime?: number | null
  /** 用户明确选择「保留我的版本」时忽略冲突 */
  overwrite?: boolean
}

export type SaveStatus = 'saved' | 'canceled' | 'conflict' | 'error'

/** UI 侧状态（多一个 saving / idle） */
export type SaveUiStatus = SaveStatus | 'saving' | 'idle'

export interface SaveResult {
  status: SaveStatus
  /** 实际写入的路径 */
  path?: string
  /** 冲突：磁盘上的文件比我们的基线新 */
  message?: string
  /** 已写入的图片文件数 */
  writtenImages?: number
  /** 写入完成后的 mtime，渲染层直接用作下一次冲突检测基线 */
  mtime?: number | null
}

export interface DraftState {
  tabId: string
  markdown: string
  title: string
  sourcePath: string | null
  sourceExt: string | null
  savePath: string | null
  savedAt: number
  /** 草稿 md 文件位置 */
  draftPath: string
}

export interface SessionState {
  tabs: DraftState[]
  activeTabId: string | null
}

export interface AppSettings {
  imageMode: ImageSaveMode
  autoSaveDelay: number
  theme: ThemeMode
  crepeTheme: CrepeTheme
  /** 正文最大宽度（px）；0 表示全宽 */
  contentWidth: number
  fontFamily: EditorFontFamily
  /** 正文字号（px） */
  fontSize: number
  sidebarVisible: boolean
  sidebarWidth: number
  /** 上次「打开」对话框所在目录 */
  lastOpenDir: string
  /** 上次「保存」对话框所在目录 */
  lastSaveDir: string
}

export interface WindowStatePayload {
  maximized: boolean
  focused: boolean
}

export interface MenuCommandPayload {
  command: string
}

export interface ClipboardPayload {
  text: string
  /** 有 HTML 时同时写入富文本剪贴板 */
  html?: string
}

export const IPC = {
  // 窗口
  winMinimize: 'win:minimize',
  winToggleMaximize: 'win:toggle-maximize',
  winClose: 'win:close',
  winIsMaximized: 'win:is-maximized',
  winMaximizedChanged: 'win:maximized-changed',
  winSetTitle: 'win:set-title',
  // 菜单
  menuCommand: 'menu:command',
  // 剪贴板
  clipboardWrite: 'clipboard:write',
  // 文件
  fileOpenDialog: 'file:open-dialog',
  fileOpenPath: 'file:open-path',
  fileReadMarkdown: 'file:read-markdown',
  fileSave: 'file:save',
  fileReveal: 'file:reveal',
  // 资源
  assetRegister: 'asset:register',
  assetPut: 'asset:put',
  assetDrop: 'asset:drop',
  // 草稿 / 会话 / 设置
  draftSave: 'draft:save',
  draftDrop: 'draft:drop',
  draftLoadSession: 'draft:load-session',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  // 打开文件（从菜单 / 第二实例 / 拖拽）
  openFileRequest: 'app:open-file-request',
  /** 渲染层就绪后主动拉取启动参数里的文件（避免 did-finish-load 时事件丢失） */
  takeStartupFile: 'app:take-startup-file',
  // 关闭前的落盘握手
  beforeClose: 'app:before-close',
  closeReady: 'app:close-ready',
  dragDropFile: 'app:drag-drop-file',
} as const
