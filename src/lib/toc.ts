import { EditorState } from '@milkdown/kit/prose/state'
import type { Node as PMNode, NodeType } from '@milkdown/kit/prose/model'

export const GITHUB_TOC_PLACEHOLDER = '<nav data-seekie-toc-placeholder="true"></nav>'
export const GITHUB_TOC_MARKER = '[[SEEKIE-GITHUB-TOC]]'
export const GITHUB_TOC_RE =
  /<nav\b[^>]*\brole=["']doc-toc["'][^>]*>[\s\S]*?<\/nav>/gi

/** 打开文件时先把 GitHub 目录块换成内部占位段落 */
export function replaceGithubTocBlocks(markdown: string): string {
  return markdown.replace(GITHUB_TOC_RE, GITHUB_TOC_MARKER)
}

/** docx 导出需要动态目录，而不是静态 nav */
export function replaceGithubTocWithMarker(markdown: string): string {
  return markdown.replace(GITHUB_TOC_RE, '[TOC]')
}


export interface TocHeading {
  level: number
  text: string
  slug: string
}

export function githubSlug(text: string): string {
  const slug = text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
  return slug || 'section'
}

/** GitHub 风格去重：第一个不加后缀，后续 -1、-2…… */
export function assignTocSlugs(
  headings: Array<{ level: number; text: string }>,
): TocHeading[] {
  const counts = new Map<string, number>()
  const used = new Set<string>()
  return headings.map((heading) => {
    const base = githubSlug(heading.text)
    let count = counts.get(base) ?? 0
    let slug = count === 0 ? base : `${base}-${count}`
    while (used.has(slug)) {
      count += 1
      slug = `${base}-${count}`
    }
    counts.set(base, count + 1)
    used.add(slug)
    return { ...heading, slug }
  })
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

export function tocNavHtml(headings: TocHeading[]): string {
  const items = headings
    .map(
      (heading) =>
        `  <li class="toc-level-${heading.level}"><a href="#user-content-${escapeHtml(heading.slug)}">${escapeHtml(heading.text)}</a></li>`,
    )
    .join('\n')
  return `<nav role="doc-toc" aria-label="目录">\n<ul>\n${items}\n</ul>\n</nav>`
}


/** 把解析后的 [TOC] / GitHub 占位段落换成自定义 TOC 节点 */
export function convertTocParagraphs(doc: PMNode, tocType: NodeType): PMNode {
  const replacements: Array<{ pos: number; node: PMNode; mode: 'marker' | 'github' }> = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return true
    const text = node.textContent.trim().toUpperCase()
    if (text !== '[TOC]' && node.textContent.trim() !== GITHUB_TOC_MARKER) return true
    replacements.push({
      pos,
      node,
      mode: node.textContent.trim() === GITHUB_TOC_MARKER ? 'github' : 'marker',
    })
    return false
  })
  if (!replacements.length) return doc
  // 用临时 state 的 transaction 生成新 doc，避免手写 Fragment
  const tr = EditorState.create({ schema: doc.type.schema, doc }).tr
  for (const item of replacements.reverse()) {
    tr.replaceWith(item.pos, item.pos + item.node.nodeSize, tocType.create({ mode: item.mode }))
  }
  return tr.doc
}
