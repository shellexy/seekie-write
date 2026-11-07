import { Marked, type TokenizerAndRendererExtension } from 'marked'
import { assignTocSlugs, tocNavHtml } from './toc'
import katex from 'katex'
import type { DocAsset } from '@shared/types'
import { api } from './api'

const ASSET_RE = /seekie-asset:\/\/[^/\s)]+\/(\d+)/g

/** 把 markdown 里的 seekie-asset:// 占位换成 base64 data URI（用于单文件导出） */
export function inlineAssets(
  markdown: string,
  assets: DocAsset[],
): { markdown: string; missing: number } {
  let missing = 0
  const next = markdown.replace(ASSET_RE, (full, id: string) => {
    const asset = assets.find((item) => String(item.id) === id)
    if (!asset) {
      missing += 1
      return full
    }
    return `data:${asset.mediaType};base64,${asset.base64}`
  })
  return { markdown: next, missing }
}

const inlineMath: TokenizerAndRendererExtension = {
  name: 'inlineMath',
  level: 'inline',
  start(src) {
    return src.indexOf('$')
  },
  tokenizer(src) {
    const match = /^\$([^$\n]+?)\$/.exec(src)
    if (!match) return undefined
    return { type: 'inlineMath', raw: match[0], text: match[1] }
  },
  renderer(token) {
    return katex.renderToString((token as { text?: string }).text ?? '', {
      output: 'mathml',
      throwOnError: false,
    })
  },
}

const blockMath: TokenizerAndRendererExtension = {
  name: 'blockMath',
  level: 'block',
  start(src) {
    return src.indexOf('$$')
  },
  tokenizer(src) {
    const match = /^\$\$([\s\S]+?)\$\$/.exec(src)
    if (!match) return undefined
    return { type: 'blockMath', raw: match[0], text: match[1].trim() }
  },
  renderer(token) {
    return katex.renderToString((token as { text?: string }).text ?? '', {
      displayMode: true,
      output: 'mathml',
      throwOnError: false,
    })
  },
}

function htmlToPlainText(html: string): string {
  if (typeof document !== 'undefined') {
    const div = document.createElement('div')
    div.innerHTML = html
    return div.textContent ?? ''
  }
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/**
 * 单文件导出的 Marked 实例：图片已是 data URI，公式转成 MathML。
 * 同时收集标题，按 GitHub 规则给标题加 user-content-* id，并把 [TOC] 展开成目录。
 */
function markdownToHtml(markdown: string): string {
  const marked = new Marked({ gfm: true, breaks: false })
  marked.use({ extensions: [blockMath, inlineMath] })
  let html = marked.parse(markdown, { async: false }) as string

  const headings: Array<{ level: number; text: string }> = []
  html = html.replace(/<h([1-6])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/g, (_match, level: string, inner: string) => {
    headings.push({ level: Number(level), text: htmlToPlainText(inner) })
    return _match
  })
  const toc = assignTocSlugs(headings)
  let index = 0
  html = html.replace(/<h([1-6])(?:\s[^>]*)?>/g, (_match, level: string) => {
    const slug = toc[index]?.slug ?? 'section'
    index += 1
    return `<h${level} id="user-content-${slug}">`
  })
  return html.replace(/<p>\s*\[TOC\]\s*<\/p>/gi, tocNavHtml(toc))
}

const EXPORT_CSS = `
  body { margin: 0 auto; padding: 48px 32px 64px; max-width: 820px;
    font-family: 'Noto Serif SC', Georgia, Cambria, 'Songti SC', serif;
    font-size: 16px; line-height: 1.78; color: #1f1b16; background: #fffdfb; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.35; margin: 1.6em 0 0.6em; }
  h1:first-child { margin-top: 0; }
  a { color: #a2651b; }
  img { max-width: 100%; height: auto; }
  pre { background: #f7f2ec; border: 1px solid #e6ddd3; border-radius: 8px;
    padding: 12px 14px; overflow-x: auto; }
  pre, code { font-family: 'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace; font-size: 13.5px; }
  code { background: #f7f2ec; border-radius: 4px; padding: 1px 5px; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 1em 0; padding: 2px 18px; border-left: 3px solid #d6cabc; color: #6b625a; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #d6cabc; padding: 6px 10px; text-align: left; }
  th { background: #f7f2ec; }
  hr { border: none; border-top: 1px solid #d6cabc; margin: 2em 0; }
  blockquote, table { word-break: break-word; }
  .katex { font-size: 1.05em; }
  .katex math, math { font-size: 1.05em; }
  .katex math[display='block'], math[display='block'] { display: block; margin: 1em auto; }
`

/** Markdown → 独立 HTML 单文件（图片已内嵌，公式转 MathML，样式内联） */
export function buildStandaloneHtml(title: string, markdown: string): string {
  const markdownHtml = markdownToHtml(markdown)
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[ch] ?? ch)}</title>
<style>
${EXPORT_CSS}
  pre, code { white-space: pre-wrap; word-break: break-word; }
@media print {
  body { max-width: none; padding: 0; }
  pre, code { white-space: pre-wrap; word-break: break-word; }
}
</style>
</head>
<body>
${markdownHtml}
</body>
</html>`
}

/** 预览窗口里加个「打印」按钮，打印时隐藏 */
export function buildPrintPreviewHtml(title: string, markdown: string): string {
  const markdownHtml = markdownToHtml(markdown)
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>打印预览 — ${title.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[ch] ?? ch)}</title>
<style>
${EXPORT_CSS}
  pre, code { white-space: pre-wrap; word-break: break-word; }
  .preview-bar { position: fixed; top: 0; left: 0; right: 0; display: flex; gap: 10px;
    align-items: center; padding: 8px 14px; background: #262421; color: #ece5dc;
    font-family: -apple-system, 'Segoe UI', 'Noto Sans SC', sans-serif; font-size: 13px; }
  .preview-bar button { padding: 5px 14px; border: none; border-radius: 6px;
    background: #a2651b; color: #fff; cursor: pointer; font-size: 13px; }
  .preview-body { padding-top: 56px; }
@media print {
  .preview-bar { display: none; }
  .preview-body { padding-top: 0; }
  body { max-width: none; padding: 0; }
}
</style>
</head>
<body>
<div class="preview-bar"><span>打印预览：${title}</span><button onclick="window.print()">打印…</button></div>
<div class="preview-body">
${markdownHtml}
</div>
</body>
</html>`
}

export interface ExportRequestPayload {
  /** 另存对话框里的默认文件名 */
  fileName: string
  /** 文本内容（md / html） */
  content?: string
  /** 二进制内容（docx） */
  data?: Uint8Array
  /** 扩展名过滤（不含点），如 ['html'] */
  extensions: string[]
}

/** 弹出另存对话框并写入文件，返回实际路径（取消返回 null） */
export async function exportViaDialog(payload: ExportRequestPayload): Promise<string | null> {
  return api.file.export(payload)
}
