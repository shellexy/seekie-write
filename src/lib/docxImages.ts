import { api } from './api'

export interface DocxImageData {
  data: Uint8Array
  contentType: string
}

type ImageResolver = (source: string) => Promise<DocxImageData | null>

// @mohtasham/md-to-docx 默认 A4 内容区约 9746 twips × 13958 twips
// 按 96 DPI 折算成图片提示尺寸，留一点余量避免和段间距一起撑出页面。
const PAGE_WIDTH = 650
const PAGE_HEIGHT = 900

const IMAGE_LINE = /^(\s*)!\[([^\]]*)\]\((\S+?)(\s+["'][^"']*["'])?\)(\s*)$/

function decodeDataUrl(source: string): DocxImageData | null {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(source)
  if (!match) return null
  const contentType = match[1] || 'application/octet-stream'
  try {
    if (match[2]) {
      const binary = atob(match[3])
      const data = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) data[i] = binary.charCodeAt(i)
      return { data, contentType }
    }
    return null
  } catch {
    return null
  }
}

function dimensionsOf(image: DocxImageData): { width: number; height: number } | null {
  const bytes = image.data
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const read = (offset: number) =>
      ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>>
      0
    return { width: read(16), height: read(20) }
  }
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) break
      const marker = bytes[offset + 1]
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
      if (marker === 0xc0 || marker === 0xc2) {
        return {
          height: (bytes[offset + 5] << 8) | bytes[offset + 6],
          width: (bytes[offset + 7] << 8) | bytes[offset + 8],
        }
      }
      offset += 2 + length
    }
  }
  return null
}

function fitDimensions(width: number, height: number): { width: number; height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  let outWidth = PAGE_WIDTH
  let outHeight = Math.round((outWidth / width) * height)
  if (outHeight > PAGE_HEIGHT) {
    outHeight = PAGE_HEIGHT
    outWidth = Math.round((outHeight / height) * width)
  }
  return {
    width: Math.max(1, Math.min(PAGE_WIDTH, outWidth)),
    height: Math.max(1, Math.min(PAGE_HEIGHT, outHeight)),
  }
}

function withSizeHint(url: string, width: number, height: number): string {
  if (/[#&]w=/.test(url) && /[#&]h=/.test(url)) return url
  const sep = url.includes('#') ? '&' : '#'
  return `${url}${sep}w=${width}&h=${height}`
}

/**
 * 仅给“整行只有一张图”的 Markdown 图片加 w/h 提示：
 * 宽度按 A4 内容区，高度超过一页时反算宽度；行内图片保持库默认。
 */
export async function prepareDocxMarkdown(
  markdown: string,
  resolve: ImageResolver,
): Promise<string> {
  const lines = markdown.split('\n')
  let fence = ''
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const fenceHit = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (fenceHit && fenceHit[1][0] === fence[0] && fenceHit[1].length >= fence.length) {
        fence = ''
      }
      continue
    }
    if (fenceHit) {
      fence = fenceHit[1]
      continue
    }
    // 4 空格缩进是 Markdown 代码块，不改
    if (/^\s{4,}/.test(line)) continue
    const match = IMAGE_LINE.exec(line)
    if (!match) continue
    const [, indent, alt, source, title = '', tail] = match
    const image = source.startsWith('data:') ? decodeDataUrl(source) : await resolve(source)
    if (!image) continue
    const dimensions = dimensionsOf(image)
    if (!dimensions) continue
    const fitted = fitDimensions(dimensions.width, dimensions.height)
    if (!fitted) continue
    lines[i] = `${indent}![${alt}](${withSizeHint(source, fitted.width, fitted.height)}${title})${tail}`
  }
  return lines.join('\n')
}

/** 同一次导出里缓存图片字节，供尺寸探测和 docx 库共用 */
export function createDocxImageResolver(): ImageResolver {
  const cache = new Map<string, Promise<DocxImageData | null>>()
  return (source) => {
    if (source.startsWith('data:')) return Promise.resolve(null)
    let url: string
    try {
      url = new URL(source, document.baseURI).href
    } catch {
      return Promise.resolve(null)
    }
    const existing = cache.get(url)
    if (existing) return existing
    const pending = api.file.readImageData(url)
    cache.set(url, pending)
    return pending
  }
}
