import type { Node as PMNode } from '@milkdown/kit/prose/model'

/**
 * “智能识别标题”：从正文段落中猜出可能适合当标题的行。
 *
 * 只处理 paragraph；heading / code_block / 表格 / 图片 / 公式等自然排除。
 * 规则见 README 或提交说明；这里用 Markdown 文本做纯函数，便于测试。
 */
export interface HeadingCandidate {
  /** ProseMirror 文档中的位置 */
  pos: number
  /** 段落节点大小 */
  nodeSize: number
  /** 去首尾空白后的正文 */
  text: string
  /** 规则命中的基础权重（100/80/…/20） */
  baseWeight: number
  /** 加上下文加减后的置信度 */
  score: number
  /** 动态映射的默认级别 1..6 */
  level: number
  /** 默认是否勾选（score > 80） */
  checked: boolean
}

const FEATURES: Array<{ re: RegExp; weight: number }> = [
  { re: /^第\s*[0-9一二三四五六七八九十百千万零〇]+\s*[卷篇]/, weight: 100 },
  { re: /^第\s*[0-9一二三四五六七八九十百千万零〇]+\s*[章回部]/, weight: 80 },
  { re: /^第\s*[0-9一二三四五六七八九十百千万零〇]+\s*节/, weight: 60 },
  { re: /^[一二三四五六七八九十百]+\s*、/, weight: 50 },
  { re: /^\d+(\.\d+)+/, weight: 40 },
  { re: /^\d+[\.、]\s+/, weight: 30 },
  { re: /^[（(][0-9一二三四五六七八九十百]+[）)]/, weight: 20 },
]

const DATE_RE = /^\d{4}\s*[-./年]\s*\d{1,2}\s*[-./月]\s*\d{1,2}/
const TRAILING_PUNCT = /[。，！？；.!?,;]$/
const NUMBERED_LINE = /^\d+[\.、]/

function chars(text: string): number {
  return Array.from(text).length
}

function isBlankParagraph(node: PMNode | null): boolean {
  return !!node && node.type.name === 'paragraph' && node.textContent.trim() === ''
}

function numberedRunPenalty(parent: PMNode, index: number, text: string): boolean {
  if (!NUMBERED_LINE.test(text)) return false
  let start = index
  let end = index
  const isNumbered = (node: PMNode) =>
    node.type.name === 'paragraph' && NUMBERED_LINE.test(node.textContent.trim())
  while (start > 0 && isNumbered(parent.child(start - 1))) start -= 1
  while (end < parent.childCount - 1 && isNumbered(parent.child(end + 1))) end += 1
  if (end - start + 1 < 2) return false
  for (let i = start; i <= end; i += 1) {
    if (TRAILING_PUNCT.test(parent.child(i).textContent.trim())) return true
  }
  return false
}

/** 从当前文档提取候选标题；返回的 pos 可直接用于事务替换 */
export function detectHeadings(doc: PMNode): HeadingCandidate[] {
  const found: Omit<HeadingCandidate, 'level' | 'checked'>[] = []

  doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return true

    const $pos = doc.resolve(pos)
    // 跳过表格内的段落；代码块 / 图片 / 公式不是 paragraph，天然跳过
    for (let depth = 0; depth <= $pos.depth; depth += 1) {
      const name = $pos.node(depth).type.name
      if (name === 'table_cell' || name === 'table_header') return true
    }

    const text = node.textContent.trim()
    const length = chars(text)
    if (length < 2 || length > 40) return true
    if (!/\p{L}/u.test(text)) return true
    if (DATE_RE.test(text)) return true

    let baseWeight = 0
    for (const feature of FEATURES) {
      if (feature.re.test(text)) {
        baseWeight = feature.weight
        break
      }
    }
    if (!baseWeight) return true

    const parent = $pos.parent
    const index = $pos.index()
    const prev = index > 0 ? parent.child(index - 1) : null
    const next = index < parent.childCount - 1 ? parent.child(index + 1) : null

    let score = baseWeight
    if (!TRAILING_PUNCT.test(text)) score += 20
    if (length >= 2 && length <= 20) score += 20
    if (isBlankParagraph(prev) && isBlankParagraph(next)) score += 30
    if (numberedRunPenalty(parent, index, text)) score = Math.floor(score / 2)

    if (score <= 50) return true
    found.push({
      pos,
      nodeSize: node.nodeSize,
      text,
      baseWeight,
      score,
    })
    return true
  })

  const maxWeight = found.reduce((max, item) => Math.max(max, item.baseWeight), 0)
  return found.map((item) => {
    const level = Math.max(1, Math.min(6, 1 + Math.floor((maxWeight - item.baseWeight) / 20)))
    return {
      ...item,
      level,
      checked: item.score > 80,
    }
  })
}
