import type { Mark, Node as PMNode } from '@milkdown/kit/prose/model'
import stcasc from 'switch-chinese'

export type ChineseDirection = 's2t' | 't2s' | 's2tw' | 's2hk'

export const DIRECTION_LABELS: Record<ChineseDirection, string> = {
  s2t: '简转繁',
  t2s: '繁转简',
  s2tw: '转台湾正体',
  s2hk: '转香港繁体',
}

export interface TextReplacement {
  from: number
  to: number
  text: string
  marks: readonly Mark[]
}

// switch-chinese 的术语库默认偏台湾；香港按常用词做后处理。
// 先转成繁体，再换地区词，避免在简体原文上误替换。
const TW_TERMS: Array<[string, string]> = [
  ['電子郵件', '電子郵件'],
  ['意大利面', '義大利麵'],
  ['超級市場', '超級市場'],
  ['軟件', '軟體'],
  ['網絡', '網路'],
  ['信息', '資訊'],
  ['質量', '品質'],
  ['出租車', '計程車'],
  ['公交車', '公車'],
  ['地鐵', '捷運'],
  ['短信', '簡訊'],
  ['登錄', '登入'],
  ['文件夾', '資料夾'],
  ['文件', '檔案'],
  ['屏幕', '螢幕'],
  ['互聯網', '網際網路'],
  ['數據庫', '資料庫'],
  ['程序', '程式'],
  ['運行', '執行'],
  ['內存', '記憶體'],
  ['硬盤', '硬碟'],
  ['光盤', '光碟'],
  ['方便面', '泡麵'],
  ['土豆', '馬鈴薯'],
  ['獼猴桃', '奇異果'],
  ['奶酪', '起司'],
  ['酸奶', '優格'],
  ['摩托車', '機車'],
  ['自行車', '腳踏車'],
  ['幼兒園', '幼兒園'],
]

const HK_TERMS: Array<[string, string]> = [
  ['電子郵件', '電郵'],
  ['意大利面', '意粉'],
  ['超級市場', '超級市場'],
  ['信息', '資訊'],
  ['質量', '質素'],
  ['出租車', '的士'],
  ['公交車', '巴士'],
  ['地鐵', '港鐵'],
  ['短信', '短訊'],
  ['登錄', '登入'],
  ['文件夾', '資料夾'],
  ['文件', '檔案'],
  ['屏幕', '螢幕'],
  ['互聯網', '互聯網'],
  ['數據庫', '資料庫'],
  ['程序', '程式'],
  ['運行', '執行'],
  ['內存', '記憶體'],
  ['硬盤', '硬碟'],
  ['光盤', '光碟'],
  ['方便面', '即食麵'],
  ['土豆', '薯仔'],
  ['獼猴桃', '奇異果'],
  ['奶酪', '芝士'],
  ['酸奶', '乳酪'],
  ['巧克力', '朱古力'],
  ['沙發', '梳化'],
  ['摩托車', '電單車'],
  ['自行車', '單車'],
  ['幼兒園', '幼稚園'],
  ['超市', '超級市場'],
]

// 注意初始化顺序：先建无术语的通用转换器，再建带术语的台湾转换器；
// switch-chinese 会共享内部缓存，反过来会让“简转繁”也带上台湾词。
const generic = stcasc({}, {}, true)
let taiwan: ReturnType<typeof stcasc> | null = null

function getGeneric(): ReturnType<typeof stcasc> {
  return generic
}

function getTaiwan(): ReturnType<typeof stcasc> {
  if (!taiwan) taiwan = stcasc()
  return taiwan
}

function applyTerms(text: string, terms: Array<[string, string]>): string {
  let result = text
  for (const [from, to] of [...terms].sort((a, b) => b[0].length - a[0].length)) {
    result = result.split(from).join(to)
  }
  return result
}

export function convertChinese(text: string, direction: ChineseDirection): string {
  if (!text) return text
  switch (direction) {
    case 't2s':
      return getTaiwan().simplized(text)
    case 's2tw':
      return applyTerms(getTaiwan().traditionalized(text), TW_TERMS)
    case 's2hk':
      return applyTerms(getTaiwan().traditionalized(text), HK_TERMS)
    case 's2t':
    default:
      return getGeneric().traditionalized(text)
  }
}

export function guessDirection(text: string): ChineseDirection {
  return getGeneric().detect(text) === 1 ? 't2s' : 's2t'
}

function isCodeText(doc: PMNode, pos: number, marks: readonly Mark[]): boolean {
  if (marks.some((mark) => mark.type.name === 'code')) return true
  const $pos = doc.resolve(pos)
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'code_block') return true
  }
  return false
}

/** 收集范围内需要替换的 Text 节点；代码块 / 行内代码跳过，链接只改文字不改 URL */
export function collectChineseReplacements(
  doc: PMNode,
  from: number,
  to: number,
  direction: ChineseDirection,
): TextReplacement[] {
  const replacements: TextReplacement[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return true
    const start = Math.max(from, pos)
    const end = Math.min(to, pos + node.nodeSize)
    if (start >= end) return false
    if (isCodeText(doc, pos, node.marks)) return false
    const text = node.text ?? ''
    const original = text.slice(start - pos, end - pos)
    const converted = convertChinese(original, direction)
    if (converted !== original) {
      replacements.push({ from: start, to: end, text: converted, marks: node.marks })
    }
    return false
  })
  return replacements
}
