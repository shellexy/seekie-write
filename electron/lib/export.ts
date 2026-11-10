import { app, BrowserWindow, dialog } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ExportRequest } from '../../shared/types'
import { getSettings, setSettings } from './settings'

const FILTER_NAMES: Record<string, string> = {
  md: 'Markdown',
  markdown: 'Markdown',
  html: 'HTML 网页',
  docx: 'Word 文档',
  pdf: 'PDF 文档',
}

function defaultDir(): string {
  const settings = getSettings()
  return settings.lastSaveDir || settings.lastOpenDir || ''
}

function rememberDir(filePath: string): void {
  setSettings({ lastSaveDir: dirname(filePath) })
}

/** 单文件导出：弹另存对话框，写文本或二进制内容 */
export async function exportFile(
  win: BrowserWindow | null,
  req: ExportRequest,
): Promise<string | null> {
  if (!req || (!req.content && !req.data)) return null
  const filters = req.extensions.map((ext) => ({
    name: FILTER_NAMES[ext] ?? ext.toUpperCase(),
    extensions: [ext],
  }))
  const defaultPath = join(defaultDir(), req.fileName)
  const result = win
    ? await dialog.showSaveDialog(win, { defaultPath, filters })
    : await dialog.showSaveDialog({ defaultPath, filters })
  if (result.canceled || !result.filePath) return null
  const filePath = result.filePath
  mkdirSync(dirname(filePath), { recursive: true })
  if (req.data) writeFileSync(filePath, Buffer.from(req.data))
  else writeFileSync(filePath, req.content ?? '', 'utf8')
  rememberDir(filePath)
  return filePath
}

/** 导出 PDF：对主窗口 printToPDF，保留背景色以保留代码高亮 */
export async function exportPdf(
  win: BrowserWindow | null,
  fileName: string,
): Promise<string | null> {
  if (!win) return null
  const defaultPath = join(defaultDir(), fileName)
  const result = await dialog.showSaveDialog(win, {
    defaultPath,
    filters: [{ name: FILTER_NAMES.pdf, extensions: ['pdf'] }],
  })
  if (result.canceled || !result.filePath) return null
  const buffer = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    generateTaggedPDF: true,
    generateDocumentOutline: true,
  })
  writeFileSync(result.filePath, buffer)
  rememberDir(result.filePath)
  return result.filePath
}

/** 打印：系统打印对话框（printBackground 保留高亮底色） */
export function printWindow(win: BrowserWindow | null): boolean {
  if (!win) return false
  win.webContents.print({ printBackground: true })
  return true
}

let previewWindow: BrowserWindow | null = null

export function closePrintPreview(): void {
  if (previewWindow && !previewWindow.isDestroyed()) previewWindow.close()
  previewWindow = null
}

/** 打印预览：独立的预览窗口，带「打印…」按钮，打印时自身隐藏 */
export function openPrintPreview(title: string, html: string): boolean {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.close()
    previewWindow = null
  }
  const filePath = join(app.getPath('temp'), `seekie-print-preview-${Date.now()}.html`)
  writeFileSync(filePath, html, 'utf8')
  const win = new BrowserWindow({
    width: 920,
    height: 820,
    title: `打印预览 — ${title}`,
    autoHideMenuBar: true,
    webPreferences: { sandbox: true, contextIsolation: true },
  })
  previewWindow = win
  win.on('closed', () => {
    if (previewWindow === win) previewWindow = null
  })
  void win.loadFile(filePath)
  return true
}
