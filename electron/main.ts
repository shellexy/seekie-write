import {
  app,
  BrowserWindow,
  clipboard,
  ClipboardItem,
  ipcMain,
  Menu,
  nativeTheme,
  protocol,
  shell,
  type MenuItemConstructorOptions,
} from 'electron'
import { extname, join, resolve } from 'node:path'
import { statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type {
  AppInfo,
  AppSettings,
  ClipboardPayload,
  DraftState,
  ExportRequest,
  OpenTabSnapshot,
  SaveRequest,
  WindowStatePayload,
  DocAsset,
} from '../shared/types'
import { IPC } from '../shared/types'
import * as assetStore from './lib/assetStore'
import { getSettings, setSettings } from './lib/settings'
import * as drafts from './lib/drafts'
import { mtimeOf, openDocument, pickOpenFile, revealInFolder, saveDocument } from './lib/files'
import { closePrintPreview, exportFile, exportPdf, openPrintPreview, printWindow } from './lib/export'
import { plainTextToMarkdown } from './lib/textConvert'

const __dirname_ = fileURLToPath(new URL('.', import.meta.url))
const isDev = !!process.env['ELECTRON_RENDERER_URL']

// 必须在 app ready 之前注册：把 seekie-asset 声明成标准、安全、可流式访问的方案
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'seekie-asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
  {
    // 打开的 .md 里的相对图片：按文件目录解析后走这个本地协议
    scheme: 'seekie-local',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

let mainWindow: BrowserWindow | null = null
/** 启动参数里带的待打开文件（Linux 双击 / 命令行） */
let pendingOpenFile: string | null = null

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    const file = pickFileFromArgv(argv)
    if (file) mainWindow?.webContents.send(IPC.openFileRequest, file)
  })

  app.whenReady().then(init)
}

function pickFileFromArgv(argv: string[]): string | null {
  const candidates = argv.slice(1).filter((arg) => !arg.startsWith('-') && !arg.includes('electron'))
  for (const candidate of candidates.reverse()) {
    try {
      // 只接受普通文件：开发模式 electron-vite 会用 `.` 作为入口参数，
      // 目录不能当成待打开文档，否则会弹“暂不支持该格式（无扩展名）”。
      if (statSync(candidate).isFile() && !candidate.endsWith('.asar')) return candidate
    } catch {
      /* 参数不是有效路径，跳过 */
    }
  }
  return null
}

function encodeAssetBody(base64: string): Buffer {
  return Buffer.from(base64, 'base64')
}

function registerAssetProtocol(): void {
  protocol.handle('seekie-asset', (request) => {
    // seekie-asset://<tabId>/<assetId>
    const url = new URL(request.url)
    const tabId = url.hostname
    const assetId = url.pathname.replace(/^\//, '')
    const asset = assetStore.get(tabId, assetId)
    if (!asset) return new Response('Not Found', { status: 404 })
    return new Response(encodeAssetBody(asset.base64), {
      headers: {
        'Content-Type': asset.mediaType,
        'Cache-Control': 'no-store',
      },
    })
  })
}

const LOCAL_IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
}

/** seekie-local://local/<绝对路径>：只允许图片扩展名，避免把任意本地文件暴露给页面 */
function registerLocalImageProtocol(): void {
  protocol.handle('seekie-local', async (request) => {
    try {
      const url = new URL(request.url)
      const filePath = decodeURIComponent(url.pathname)
      if (!filePath.startsWith('/')) return new Response('Forbidden', { status: 403 })
      const mime = LOCAL_IMAGE_MIME[extname(filePath).toLowerCase()]
      if (!mime) return new Response('Forbidden', { status: 403 })
      const data = await readFile(filePath)
      return new Response(data, {
        headers: { 'Content-Type': mime, 'Cache-Control': 'no-store' },
      })
    } catch {
      return new Response('Not Found', { status: 404 })
    }
  })
}

function createWindow(): void {
  const settings = getSettings()

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 720,
    minHeight: 480,
    show: false,
    frame: false, // Linux / Windows：完全自绘标题栏
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 14, y: 13 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1b19' : '#fffdfb',
    icon: join(__dirname_, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname_, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload 需要 require('electron')，但不暴露任何 fs
      spellcheck: true,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  const emitWindowState = () => {
    if (!mainWindow) return
    const payload: WindowStatePayload = {
      maximized: mainWindow.isMaximized(),
      focused: mainWindow.isFocused(),
    }
    mainWindow.webContents.send(IPC.winMaximizedChanged, payload)
  }
  mainWindow.on('maximize', emitWindowState)
  mainWindow.on('unmaximize', emitWindowState)
  mainWindow.on('focus', emitWindowState)
  mainWindow.on('blur', emitWindowState)

  // 关闭前先让渲染层把无路径的标签写进草稿区（最多等 1.5s）
  let closeReady = false
  mainWindow.on('close', (event) => {
    if (closeReady) return
    event.preventDefault()
    closeReady = true
    mainWindow?.webContents.send(IPC.beforeClose)
    setTimeout(() => mainWindow?.destroy(), 1500)
  })
  ipcMain.on(IPC.closeReady, () => {
    mainWindow?.destroy()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    // 打印预览是独立窗口；主窗口关闭后一并关掉，否则 app 不会退出
    closePrintPreview()
  })

  // 拖文件进窗口：把路径交给渲染层打开
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  // 正文区右键菜单（只在可编辑区域弹出）
  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return
    const send = (command: string) => () =>
      mainWindow?.webContents.send(IPC.menuCommand, { command })
    const template: MenuItemConstructorOptions[] = []
    const hasSelection = !!params.selectionText

    // 拼写建议
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        template.push({
          label: suggestion,
          click: () => mainWindow?.webContents.replaceMisspelling(suggestion),
        })
      }
      if (template.length) template.push({ type: 'separator' })
    }

    template.push(
      // ProseMirror 的撤销栈不在 Chromium 里，editFlags.canUndo 不可信，保持可点
      { label: '撤销', click: send('edit:undo') },
      { label: '重做', click: send('edit:redo') },
      { type: 'separator' },
      { label: '剪切', role: 'cut', enabled: params.editFlags.canCut },
      { label: '复制（纯文本）', enabled: hasSelection, click: () => void clipboard.writeText(params.selectionText) },
      { label: '复制（Markdown）', enabled: hasSelection, click: send('clipboard:copy-markdown') },
      { label: '复制（富文本）', enabled: hasSelection, click: send('clipboard:copy-html') },
      { label: '粘贴', role: 'paste', enabled: params.editFlags.canPaste },
      {
        label: '粘贴为纯文本',
        enabled: params.editFlags.canPaste,
        click: () => {
          void (async () => {
            try {
              // Electron 45 的 readText() 返回 Promise<string>
              const text = await clipboard.readText()
              if (text) mainWindow?.webContents.send(IPC.clipboardPastePlain, text)
            } catch (err) {
              console.error('[clipboard] 读取纯文本失败', err)
            }
          })()
        },
      },
      { label: '全选', role: 'selectAll', enabled: params.editFlags.canSelectAll },
      { type: 'separator' },
      {
        label: '插入',
        submenu: [
          { label: '图片…', click: send('insert:image') },
          { label: '表格', click: send('insert:table') },
          { label: '分割线', click: send('insert:hr') },
        ],
      },
      { label: '清除格式', click: send('format:clear') },
      { type: 'separator' },
      { label: '查找…', click: send('edit:find') },
      { label: '替换…', click: send('edit:replace') },
    )

    Menu.buildFromTemplate(template).popup({ window: mainWindow ?? undefined })
  })

  // 外链用系统浏览器打开，绝不接管主窗口
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] as string)
  } else {
    mainWindow.loadFile(join(__dirname_, '../renderer/index.html'))
  }

  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow?.webContents.send(IPC.winMaximizedChanged, {
      maximized: mainWindow.isMaximized(),
      focused: true,
    } satisfies WindowStatePayload)
  })

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const ctrl = input.control || input.meta
    // Ctrl+Shift+I / F12 开发者工具（仅开发环境）
    if (isDev && (input.key === 'F12' || (ctrl && input.shift && input.key.toLowerCase() === 'i'))) {
      mainWindow?.webContents.toggleDevTools()
      event.preventDefault()
    }
  })
}

function buildMenu(): void {
  const send = (command: string) => () => mainWindow?.webContents.send(IPC.menuCommand, { command })

  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: 'CmdOrCtrl+N', click: send('file:new') },
        { label: '打开…', accelerator: 'CmdOrCtrl+O', click: send('file:open') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: send('file:save') },
        { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: send('file:save-as') },
        { type: 'separator' },
        { label: '关闭标签', accelerator: 'CmdOrCtrl+W', click: send('tab:close') },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', click: send('edit:undo') },
        { label: '重做', accelerator: 'CmdOrCtrl+Shift+Z', click: send('edit:redo') },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
        { type: 'separator' },
        { label: '查找…', accelerator: 'CmdOrCtrl+F', click: send('edit:find') },
        { label: '替换…', accelerator: 'CmdOrCtrl+H', click: send('edit:replace') },
        { type: 'separator' },
        { label: '设置…', accelerator: 'CmdOrCtrl+,', click: send('app:settings') },
      ],
    },
    {
      label: '段落',
      submenu: [
        { label: '段落', accelerator: 'CmdOrCtrl+0', click: send('format:paragraph') },
        { label: '标题一', accelerator: 'CmdOrCtrl+1', click: send('format:h1') },
        { label: '标题二', accelerator: 'CmdOrCtrl+2', click: send('format:h2') },
        { label: '标题三', accelerator: 'CmdOrCtrl+3', click: send('format:h3') },
        { type: 'separator' },
        { label: '清除格式', accelerator: 'CmdOrCtrl+\\', click: send('format:clear') },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '切换侧栏', accelerator: 'CmdOrCtrl+Shift+B', click: send('view:toggle-sidebar') },
        { type: 'separator' },
        { label: '重新载入', accelerator: 'CmdOrCtrl+R', click: send('view:reload-tab') },
        { label: '放大', accelerator: 'CmdOrCtrl+=', click: send('view:zoom-in') },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', click: send('view:zoom-out') },
        { label: '重置缩放', accelerator: 'CmdOrCtrl+Shift+0', click: send('view:zoom-reset') },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于 seekie-write', click: send('help:about') },
        ...(isDev
          ? ([{ label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' }] as MenuItemConstructorOptions[])
          : []),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerIpc(): void {
  const withWindow = (fn: (win: BrowserWindow) => void) => () => {
    if (mainWindow) fn(mainWindow)
  }

  ipcMain.on(IPC.winMinimize, withWindow((win) => win.minimize()))
  ipcMain.on(IPC.winToggleMaximize, withWindow((win) => (win.isMaximized() ? win.unmaximize() : win.maximize())))
  ipcMain.on(IPC.winClose, withWindow((win) => win.close()))
  ipcMain.handle(IPC.winIsMaximized, () => mainWindow?.isMaximized() ?? false)
  ipcMain.on(IPC.winSetTitle, (_e, title: string) => {
    mainWindow?.setTitle(title)
  })
  ipcMain.handle(
    IPC.appInfo,
    (): AppInfo => ({
      version: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      homepage: 'https://github.com/shellexy/seekie-write',
    }),
  )

  ipcMain.handle(IPC.fileOpenDialog, async () => pickOpenFile(mainWindow))
  ipcMain.handle(IPC.clipboardWrite, async (_e, payload: ClipboardPayload) => {
    if (!payload?.text) return false
    if (payload.html) {
      await clipboard.write([
        new ClipboardItem({
          'text/plain': payload.text,
          'text/html': payload.html,
        }),
      ])
    } else {
      await clipboard.writeText(payload.text)
    }
    return true
  })
  ipcMain.handle(IPC.takeStartupFile, async () => {
    const file = pendingOpenFile
    pendingOpenFile = null
    return file
  })
  ipcMain.handle(IPC.fileOpenPath, async (_e, path: string) => {
    if (mainWindow) mainWindow.webContents.send(IPC.openFileRequest, path)
    return true
  })
  ipcMain.handle(IPC.fileResolve, async (_e, path: string) => resolve(path))
  ipcMain.handle(IPC.fileReadMarkdown, async (_e, path: string, tabId: string) => {
    // 统一成绝对路径：标签的 savePath 会用于冲突检测、复制路径、在文件夹中显示
    const result = await openDocument(resolve(path), tabId)
    // 转换出来的内嵌图片先进内存仓库（按标签隔离），渲染进程随后即可通过 seekie-asset:// 显示
    if (result.ok && result.assets.length) assetStore.putMany(tabId, result.assets)
    return result
  })
  ipcMain.handle(IPC.fileSave, async (_e, req: SaveRequest) => saveDocument(mainWindow, req))
  ipcMain.handle(IPC.textToMarkdown, async (_e, text: string) => plainTextToMarkdown(text))
  ipcMain.handle(IPC.fileReveal, async (_e, path: string) => revealInFolder(path))
  ipcMain.handle(IPC.fileExport, async (_e, req: ExportRequest) => exportFile(mainWindow, req))
  ipcMain.handle(IPC.printToPdf, async (_e, fileName: string) => exportPdf(mainWindow, fileName))
  ipcMain.handle(IPC.printNow, async () => printWindow(mainWindow))
  ipcMain.handle(IPC.printPreview, async (_e, title: string, html: string) =>
    openPrintPreview(title, html),
  )
  ipcMain.handle('file:mtime', async (_e, path: string | null) => mtimeOf(path))

  ipcMain.handle(IPC.assetRegister, async (_e, tabId: string, list: DocAsset[]) => {
    assetStore.putMany(tabId, list)
    return true
  })
  ipcMain.handle(IPC.assetPut, async (_e, tabId: string, asset: DocAsset) => {
    assetStore.put(tabId, asset)
    return true
  })
  ipcMain.handle(IPC.assetDrop, async (_e, tabId: string) => {
    assetStore.drop(tabId)
    return true
  })

  ipcMain.handle(IPC.draftSave, async (_e, draft: Omit<DraftState, 'draftPath'>) => drafts.saveDraft(draft))
  ipcMain.handle(IPC.draftDrop, async (_e, tabId: string) => drafts.dropDraft(tabId))
  ipcMain.handle(IPC.draftLoadSession, async () => drafts.loadSession())
  ipcMain.handle(
    IPC.sessionSaveOpenTabs,
    async (_e, openTabs: OpenTabSnapshot[], activeSavePath: string | null) => {
      drafts.saveOpenTabs(openTabs, activeSavePath)
      return true
    },
  )
  ipcMain.handle(IPC.settingsGet, async () => getSettings())
  ipcMain.handle(IPC.settingsSet, async (_e, patch: Partial<AppSettings>) => setSettings(patch))
  ipcMain.handle('app:toggle-dev-tools', async () => mainWindow?.webContents.toggleDevTools())
}

async function init(): Promise<void> {
  pendingOpenFile = pickFileFromArgv(process.argv)
  registerAssetProtocol()
  registerLocalImageProtocol()
  registerIpc()
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
})

export { pendingOpenFile }
