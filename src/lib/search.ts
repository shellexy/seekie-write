import type { Node as PMNode } from '@milkdown/kit/prose/model'

export interface SearchMatch {
  from: number
  to: number
}

/**
 * 在 ProseMirror 文档里查找纯文本。
 * 只匹配同一个文本节点内部，跨格式边界（如 **粗**体）的查询不会命中；
 * 对 Markdown 编辑器来说这是可接受且可预期的行为。
 */
export function findMatches(doc: PMNode, query: string, caseSensitive: boolean): SearchMatch[] {
  if (!query) return []
  const needle = caseSensitive ? query : query.toLowerCase()
  const matches: SearchMatch[] = []

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const haystack = caseSensitive ? node.text : node.text.toLowerCase()
    let index = haystack.indexOf(needle)
    while (index !== -1) {
      matches.push({ from: pos + index, to: pos + index + needle.length })
      index = haystack.indexOf(needle, index + Math.max(needle.length, 1))
    }
    return false
  })

  return matches
}
