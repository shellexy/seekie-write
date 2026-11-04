import type { Node as PMNode } from '@milkdown/kit/prose/model'

/** 文档纯文本（段落之间用换行分隔）—— 比序列化 markdown 快一个数量级 */
export function docText(doc: PMNode): string {
  return doc.textBetween(0, doc.content.size, '\n', '\n')
}

export function selectionText(doc: PMNode, from: number, to: number): string {
  if (from >= to) return ''
  return doc.textBetween(from, to, '\n', '\n')
}
