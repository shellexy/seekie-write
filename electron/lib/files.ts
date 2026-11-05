import { dialog, BrowserWindow, shell } from 'electron'
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative } from 'node:path'
import type { DocAsset, OpenResult, SaveRequest, SaveResult } from '../../shared/types'
import { convertToMarkdown, isConvertible, isMarkdownLike, suggestedSavePath } from './anydoc'
import { convertHtmlFile, convertPlainTextFile } from './textConvert'
import * as assets from './assetStore'
import { getSettings, setSettings } from './settings'

const ASSET_RE = /seekie-asset:\/\/[^/\s)]+\/(\d+)/g

const HTML_EXT = new Set(['.html', '.htm', '.xhtml', '.html4', '.html5', '.mhtml', '.mht'])

/** 打开文件：markdown 直接读，其它走 anydoc 转换 */
export async function openDocument(filePath: string, tabId: string): Promise<OpenResult> {
  if (!existsSync(filePath)) {
    return {
      ok: false,
      error: `文件不存在：${filePath}`,
      converted: false,
      sourcePath: null,
      sourceExt: null,
      suggestedSavePath: null,
      markdown: '',
      assets: [],
      title: basename(filePath),
    }
  }

  const ext = extname(filePath).toLowerCase()

  if (isMarkdownLike(filePath)) {
    const markdown = readFileSync(filePath, 'utf8')
    return {
      ok: true,
      converted: false,
      sourcePath: filePath,
      sourceExt: ext,
      suggestedSavePath: filePath,
      markdown,
      assets: [],
      title: basename(filePath),
    }
  }

  if (HTML_EXT.has(ext)) {
    try {
      const markdown = await convertHtmlFile(filePath)
      return {
        ok: true,
        converted: true,
        sourcePath: filePath,
        sourceExt: ext,
        suggestedSavePath: suggestedSavePath(filePath),
        markdown,
        assets: [],
        inlinedImages: 0,
        title: `${basename(filePath)}.md`,
      }
    } catch (err) {
      return {
        ok: false,
        error: `HTML 转换失败：${(err as Error).message}`,
        converted: true,
        sourcePath: filePath,
        sourceExt: ext,
        suggestedSavePath: null,
        markdown: '',
        assets: [],
        title: basename(filePath),
      }
    }
  }

  if (isConvertible(filePath)) {
    try {
      const { markdown, assets: docAssets, inlinedImages } = await convertToMarkdown(filePath, tabId, {
        inlineImages: getSettings().openInlineImages,
      })
      return {
        ok: true,
        converted: true,
        sourcePath: filePath,
        sourceExt: ext,
        suggestedSavePath: suggestedSavePath(filePath),
        markdown,
        assets: docAssets,
        inlinedImages,
        title: `${basename(filePath)}.md`,
      }
    } catch (err) {
      return {
        ok: false,
        error: (err as Error).message,
        converted: true,
        sourcePath: filePath,
        sourceExt: ext,
        suggestedSavePath: null,
        markdown: '',
        assets: [],
        title: basename(filePath),
      }
    }
  }

  // 其它格式：纯文本 / 源码 → Markdown（@mdgate/text）
  try {
    const markdown = await convertPlainTextFile(filePath)
    return {
      ok: true,
      converted: true,
      sourcePath: filePath,
      sourceExt: ext,
      suggestedSavePath: suggestedSavePath(filePath),
      markdown,
      assets: [],
      inlinedImages: 0,
      title: `${basename(filePath)}.md`,
    }
  } catch (err) {
    return {
      ok: false,
      error: `暂不支持该格式（${ext || '无扩展名'}），作为文本转换也失败了：${(err as Error).message}`,
      converted: false,
      sourcePath: filePath,
      sourceExt: ext,
      suggestedSavePath: null,
      markdown: '',
      assets: [],
      title: basename(filePath),
    }
  }
}

/** 原子写：先写 .tmp 再 rename */
function atomicWrite(path: string, content: string): void {
  const tmp = `${path}.tmp-${process.pid}`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, path)
}

function imageDirFor(savePath: string): string {
  const dir = dirname(savePath)
  const name = basename(savePath, extname(savePath))
  return join(dir, `${name}.assets`)
}

/** 相对路径策略下的图片文件名：稳定编号，避免中文/特殊字符 */
function assetFileName(asset: DocAsset, index: number): string {
  const ext = asset.fileName.split('.').pop() || 'png'
  return `image-${index + 1}.${ext}`
}

/** 把 markdown 里的 seekie-asset:// 换成 base64 或相对路径 */
function rewriteAssets(
  markdown: string,
  savePath: string,
  req: SaveRequest,
): { markdown: string; writtenImages: number; writtenDir?: string } {
  const ids = new Set<string>()
  for (const match of markdown.matchAll(ASSET_RE)) ids.add(match[1])
  if (ids.size === 0) return { markdown, writtenImages: 0 }

  const wanted = req.assets.filter((a) => ids.has(String(a.id)))
  if (req.imageMode === 'base64') {
    const byId = new Map(wanted.map((a) => [String(a.id), a]))
    const next = markdown.replace(ASSET_RE, (full, id: string) => {
      const asset = byId.get(id)
      return asset ? `data:${asset.mediaType};base64,${asset.base64}` : full
    })
    return { markdown: next, writtenImages: 0 }
  }

  const dir = imageDirFor(savePath)
  // 用稳定编号覆盖临时文件名，保证 .assets 目录里干净可读
  const renamed = wanted.map((asset, i) => ({ ...asset, fileName: assetFileName(asset, i) }))
  const written = assets.materialize(renamed, dir)
  let writtenImages = 0
  const next = markdown.replace(ASSET_RE, (full, id: string) => {
    const asset = renamed.find((a) => String(a.id) === id)
    const filePath = asset ? written.get(asset.id) : undefined
    if (!asset || !filePath) return full
    writtenImages += 1
    const rel = relative(dirname(savePath), filePath).split('\\').join('/')
    return rel.startsWith('.') ? rel : `./${rel}`
  })
  return { markdown: next, writtenImages, writtenDir: dir }
}

export async function saveDocument(
  win: BrowserWindow | null,
  req: SaveRequest,
): Promise<SaveResult> {
  let target = req.savePath

  // 自动保存 / 普通保存前：如果磁盘文件在我们上次读取之后被改过，拒写并交回 UI 决定
  if (target && !req.overwrite && req.expectedMtime != null) {
    const current = mtimeOf(target)
    if (current != null && Math.abs(current - req.expectedMtime) > 1) {
      return {
        status: 'conflict',
        path: target,
        message: '文件已在外部被修改，为避免覆盖你的内容，本次保存已暂停。',
      }
    }
  }

  if (!target) {
    // 还没有落盘位置：另存为
    // 默认目录优先级：上次保存对话框 → 当前文件所在目录 → 上次打开对话框 → cwd
    const settings = getSettings()
    const baseDir =
      settings.lastSaveDir ||
      (req.savePath ? dirname(req.savePath) : '') ||
      settings.lastOpenDir
    const suggested = req.suggestedName ? basename(req.suggestedName) : ''
    const defaultPath = baseDir
      ? suggested
        ? join(baseDir, suggested)
        : baseDir
      : suggested
        ? join(process.cwd(), suggested)
        : undefined
    const result = await dialog.showSaveDialog(win ?? undefined!, {
      title: '保存为 Markdown',
      defaultPath,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })
    if (result.canceled || !result.filePath) return { status: 'canceled' }
    target = result.filePath
    setSettings({ lastSaveDir: dirname(target) })
  }

  const { markdown, writtenImages } = rewriteAssets(req.markdown, target, req)

  try {
    atomicWrite(target, markdown)
  } catch (err) {
    return { status: 'error', message: `写入失败：${(err as Error).message}` }
  }

  return { status: 'saved', path: target, writtenImages, mtime: mtimeOf(target) }
}

/** 保存前检查磁盘文件是否被外部改过 */
export function mtimeOf(path: string | null): number | null {
  if (!path || !existsSync(path)) return null
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}

export function revealInFolder(path: string | null): void {
  if (!path) return
  shell.showItemInFolder(path)
}

export async function pickOpenFile(win: BrowserWindow | null): Promise<string | null> {
  const result = await dialog.showOpenDialog(win ?? undefined!, {
    title: '打开文档',
    defaultPath: getSettings().lastOpenDir || undefined,
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx', 'txt'] },
      {
        name: 'Office / PDF（转换为 Markdown）',
        extensions: [
          'doc', 'docx', 'docm', 'ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'ppsx',
          'xls', 'xlsx', 'xlsm', 'xlsb', 'odt', 'ods', 'odp', 'rtf', 'epub', 'csv', 'pdf',
        ],
      },
      { name: '所有文件', extensions: ['*'] },
    ],
  })
  if (result.canceled || !result.filePaths.length) return null
  const file = result.filePaths[0]
  setSettings({ lastOpenDir: dirname(file) })
  return file
}

export function settingsImageMode() {
  return getSettings().imageMode
}

export type { DocAsset }
