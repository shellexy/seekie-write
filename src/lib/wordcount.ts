/** 中西混排字数统计：CJK 按字计，拉丁按词计 */
const CJK_RE =
  /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af\u31f0-\u31ff]/g
const WORD_RE = /[A-Za-z0-9_'’\-]+/g

export interface CountResult {
  words: number
  chars: number
  paragraphs: number
}

export function countText(text: string): CountResult {
  if (!text) return { words: 0, chars: 0, paragraphs: 0 }
  const cjk = text.match(CJK_RE)
  const cjkCount = cjk ? cjk.length : 0
  const withoutCjk = text.replace(CJK_RE, ' ')
  const latin = withoutCjk.match(WORD_RE)
  const latinCount = latin ? latin.length : 0
  const paragraphs = text.split(/\n+/).filter((line) => line.trim().length > 0).length
  return {
    words: cjkCount + latinCount,
    chars: text.replace(/\n/g, '').length,
    paragraphs,
  }
}

export function formatNumber(n: number): string {
  return n.toLocaleString('zh-CN')
}

/** 中文阅读速度约 300 字/分钟 */
export function readingMinutes(words: number): string {
  if (words < 300) return '< 1 分钟'
  const minutes = Math.round(words / 300)
  if (minutes < 60) return `${minutes} 分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} 小时 ${m} 分钟` : `${h} 小时`
}
