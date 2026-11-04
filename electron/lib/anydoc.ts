import { readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { DocAsset } from '../../shared/types'
import { extFor } from './assetStore'

const MARKDOWN_EXT = new Set(['.md', '.markdown', '.mdown', '.mkd', '.mdx', '.txt'])
const SUPPORTED_EXT = new Set([
  '.doc', '.docx', '.docm',
  '.ppt', '.pptx', '.pptm', '.pps', '.ppsx', '.ppsm', '.pot',
  '.xls', '.xlsx', '.xlsm', '.xlsb',
  '.odt', '.ods', '.odp',
  '.rtf', '.epub', '.csv', '.pdf',
])

export function isMarkdownLike(path: string): boolean {
  return MARKDOWN_EXT.has(extname(path).toLowerCase())
}

export function isConvertible(path: string): boolean {
  return SUPPORTED_EXT.has(extname(path).toLowerCase())
}

/** 季度报告.docx → 季度报告.docx.md （保留原扩展名，不覆盖源文件） */
export function suggestedSavePath(sourcePath: string): string {
  return join(dirname(sourcePath), `${basename(sourcePath)}.md`)
}

export interface ConvertResult {
  markdown: string
  assets: DocAsset[]
  /** anydoc 无法处理的告警 */
  warning?: string
}

type AnyDocModule = typeof import('@firecrawl/anydoc')

let anydocPromise: Promise<AnyDocModule> | null = null

/** 懒加载 anydoc（NAPI 原生模块，避免拖慢启动） */
export async function loadAnyDoc(): Promise<AnyDocModule> {
  if (!anydocPromise) {
    anydocPromise = import('@firecrawl/anydoc').catch((err) => {
      anydocPromise = null
      throw new Error(
        `文档转换组件加载失败：${(err as Error).message}\n` +
          `如果是源码运行，请确认已执行 npm install（需要 @firecrawl/anydoc 的平台二进制）。`,
      )
    })
  }
  return anydocPromise
}

function describeError(err: any): string {
  const code = err?.code as string | undefined
  switch (code) {
    case 'unsupported':
      return '不支持的文件格式。可转换：Word、PowerPoint、Excel、OpenDocument、RTF、EPUB、CSV、PDF（文本型）。'
    case 'needsOcr': {
      const pages = Array.isArray(err?.pages) ? `（第 ${err.pages.join('、')} 页）` : ''
      return `该 PDF 含扫描页${pages}，本机不做 OCR，无法转换。`
    }
    case 'encrypted':
      return '文档已加密或受密码保护，无法转换。'
    case 'malformed':
      return '文档结构损坏，无法提取内容。'
    case 'resourceLimit':
      return '文档超出安全处理上限（解压体积 / 嵌套深度 / 节点数）。'
    case 'missingPart':
      return '文档缺少必需的部分，无法转换。'
    case 'io':
      return '文件读取失败，请检查权限或文件是否已被移动。'
    default:
      return err?.message ?? '转换失败。'
  }
}

/**
 * 把 anydoc 的 Document 模型用 mdast 拼回 Markdown。
 * 相比 toMarkdown()，唯一目的就是能在图片位置插入 seekie-asset:// 占位，
 * 否则内嵌图片会整个丢失（实测：toMarkdown 只输出 alt 文本）。
 * 因此这里只实现 anydoc 会产出的块/行内种类，其余降级为文本。
 */
type AnyBlock = any
type AnyInline = any

function escapeText(text: string): string {
  return text.replace(/([\\`*_[\]<>])/g, '\\$1')
}

function inlineToMd(inline: AnyInline, assets: DocAsset[], tabId: string): string {
  switch (inline.kind) {
    case 'text': {
      let out = escapeText(inline.text ?? '')
      const s = inline.style
      if (s?.code) out = `\`${out}\``
      if (s?.bold) out = `**${out}**`
      if (s?.italic) out = `*${out}*`
      if (s?.strike) out = `~~${out}~~`
      return out
    }
    case 'link': {
      const body = (inline.content ?? []).map((i: AnyInline) => inlineToMd(i, assets, tabId)).join('')
      const target = inline.target?.value ?? ''
      return `[${body}](${target})`
    }
    case 'image': {
      const alt = escapeText(inline.alt ?? '')
      const src = inline.source
      if (src?.kind === 'external' && src.url) return `![${alt}](${src.url})`
      if (src?.kind === 'asset' && typeof src.assetId === 'number') {
        const asset = assets.find((a) => a.id === src.assetId)
        if (asset) return `![${alt}](seekie-asset://${tabId}/${asset.id})`
        return alt
      }
      return alt
    }
    case 'lineBreak':
      return '  \n'
    case 'math':
      return `$${inline.text ?? ''}$`
    case 'checkbox':
      return inline.checked ? '[x] ' : '[ ] '
    case 'anchor':
    case 'noteRef':
      return ''
    default:
      return inline.text ?? ''
  }
}

function inlinesToMd(inlines: AnyInline[] | undefined, assets: DocAsset[], tabId: string): string {
  return (inlines ?? []).map((i) => inlineToMd(i, assets, tabId)).join('')
}

function blockToMd(block: AnyBlock, assets: DocAsset[], tabId: string, depth = 0): string {
  switch (block.kind) {
    case 'heading': {
      const level = Math.min(Math.max(block.level ?? 1, 1), 6)
      return `${'#'.repeat(level)} ${inlinesToMd(block.content, assets, tabId)}`
    }
    case 'paragraph': {
      const body = inlinesToMd(block.content, assets, tabId)
      return body
    }
    case 'list': {
      const items: string[] = []
      let index = block.list?.start ?? 1
      for (const item of block.list?.items ?? []) {
        const marker = block.list?.marker === 'bullet' ? '-' : `${index}.`
        const body = (item.blocks ?? [])
          .map((b: AnyBlock) => blockToMd(b, assets, tabId, depth + 1))
          .join('\n\n')
        const indented = body
          .split('\n')
          .map((line: string, i: number) => (i === 0 ? line : `  ${line}`))
          .join('\n')
        items.push(`${marker} ${indented}`)
        index += 1
      }
      return items.join('\n')
    }
    case 'blockQuote': {
      const body = (block.blocks ?? []).map((b: AnyBlock) => blockToMd(b, assets, tabId, depth + 1)).join('\n\n')
      return body
        .split('\n')
        .map((line: string) => `> ${line}`)
        .join('\n')
    }
    case 'codeBlock': {
      const lang = block.lang ?? ''
      return `\`\`\`${lang}\n${block.text ?? ''}\n\`\`\``
    }
    case 'math':
      return `$$\n${block.text ?? ''}\n$$`
    case 'rule':
      return '---'
    case 'table': {
      const grid: any[][] = block.table?.grid ?? []
      if (!grid.length) return ''
      const headerRows = block.table?.headerRows ?? 0
      const rows = grid.map((row) =>
        row.map((slot) => {
          if (slot.kind !== 'origin' || !slot.cell) return ''
          const text = (slot.cell.blocks ?? [])
            .map((b: AnyBlock) => blockToMd(b, assets, tabId, depth + 1))
            .join(' ')
            .replace(/\n+/g, ' ')
            .replace(/\|/g, '\\|')
          return text
        }),
      )
      const colCount = Math.max(...rows.map((r) => r.length))
      const pad = (r: string[]) => [...r, ...Array(colCount - r.length).fill('')]
      const head = pad(rows[0] ?? Array(colCount).fill(''))
      const body = rows.slice(Math.max(headerRows, 1)).map(pad)
      const lines = [
        `| ${head.join(' | ')} |`,
        `| ${Array(colCount).fill('---').join(' | ')} |`,
        ...body.map((r) => `| ${r.join(' | ')} |`),
      ]
      return lines.join('\n')
    }
    default:
      return ''
  }
}

export async function convertToMarkdown(
  filePath: string,
  tabId: string,
): Promise<ConvertResult> {
  const ext = extname(filePath).toLowerCase()
  const anydoc = await loadAnyDoc()

  // PDF：anydoc 只能直接产出 markdown，没有 document 模型（也就拿不到内嵌图片）
  if (ext === '.pdf') {
    try {
      const markdown = await anydoc.toMarkdown(filePath)
      return { markdown, assets: [], warning: 'PDF 中的内嵌图片无法提取，可能与原文排版有差异。' }
    } catch (err) {
      throw new Error(describeError(err))
    }
  }

  const size = statSync(filePath).size
  const bytes = readFileSync(filePath)

  try {
    const doc = await anydoc.toDocument(new Uint8Array(bytes))
    const assets: DocAsset[] = (doc.assets ?? []).map((asset: any, i: number) => ({
      id: Number(asset.id ?? i),
      mediaType: asset.mediaType ?? 'image/png',
      fileName: `image-${Number(asset.id ?? i) + 1}.${extFor(asset.mediaType ?? 'image/png')}`,
      base64: Buffer.from(asset.data ?? []).toString('base64'),
    }))

    const markdown = (doc.blocks ?? [])
      .map((b: AnyBlock) => blockToMd(b, assets, tabId))
      .filter((s: string) => s.trim().length > 0)
      .join('\n\n')
      .concat('\n')

    let warning: string | undefined
    if (assets.length > 0) {
      warning = `文档内嵌 ${assets.length} 个图片资源，保存时会按当前图片策略处理。`
    }
    if (size > 20 * 1024 * 1024) {
      warning = `${warning ?? ''}文件较大（${(size / 1024 / 1024).toFixed(1)} MB），已尽力转换。`
    }
    return { markdown, assets, warning }
  } catch (err) {
    throw new Error(describeError(err))
  }
}
