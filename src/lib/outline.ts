import type { Node as PMNode } from '@milkdown/kit/prose/model'

export interface OutlineItem {
  id: string
  level: number
  text: string
  /** 标题节点在 doc 中的起始位置 */
  pos: number
  /** 该标题所属章节的结束位置（下一个同级或更高级标题之前） */
  end: number
}

/**
 * 从 ProseMirror doc 推导大纲。
 * end 的计算：向后找到第一个 level <= 当前 level 的标题，其 pos - 1 即为本章末尾。
 */
export function buildOutline(doc: PMNode): OutlineItem[] {
  const raw: Array<{ level: number; text: string; pos: number }> = []

  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = Number(node.attrs.level ?? 1)
      raw.push({ level, text: node.textContent.trim(), pos })
      return false // 标题内不再深入
    }
    return true
  })

  const items: OutlineItem[] = raw.map((entry, index) => {
    let end = doc.content.size
    for (let i = index + 1; i < raw.length; i += 1) {
      if (raw[i].level <= entry.level) {
        end = raw[i].pos - 1
        break
      }
    }
    return {
      id: `${entry.pos}-${entry.level}-${index}`,
      level: entry.level,
      text: entry.text || '(空标题)',
      pos: entry.pos,
      end: Math.max(end, entry.pos),
    }
  })

  return items
}

/** 光标在哪一章：取最后一个 pos <= cursorPos 的标题 */
export function activeOutlineId(items: OutlineItem[], cursorPos: number): string | null {
  let active: string | null = null
  for (const item of items) {
    if (item.pos <= cursorPos) active = item.id
    else break
  }
  return active
}
