import { resizeImage } from '@aurouscia/image-compress'
import { api } from './api'
import type { DocAsset, ImageSaveMode, SaveResult } from '@shared/types'

export interface SavePayload {
  tabId: string
  savePath: string | null
  markdown: string
  imageMode: ImageSaveMode
  assets: DocAsset[]
  suggestedName?: string
  sourcePath?: string | null
  converted?: boolean
  kind: 'auto' | 'manual' | 'saveAs'
  mtime?: number | null
  overwrite?: boolean
}

/** webp / 矢量 SVG 不压缩；动图 GIF 跳过，静态 GIF 会转成 webp */
const SKIP_COMPRESS = new Set(['image/webp', 'image/svg+xml'])

/** 判断 GIF 是否为动图（存在多个 Image Descriptor） */
function isAnimatedGif(base64: string): boolean {
  let bytes: Uint8Array
  try {
    const binary = atob(base64)
    bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  } catch {
    return false
  }
  if (bytes.length < 13 || String.fromCharCode(bytes[0], bytes[1], bytes[2]) !== 'GIF') return false

  const screenPacked = bytes[10]
  let i = 13
  if (screenPacked & 0x80) i += 3 * 2 ** ((screenPacked & 0x07) + 1)

  let frames = 0
  while (i < bytes.length) {
    const block = bytes[i]
    i += 1
    if (block === 0x3b) break // trailer
    if (block === 0x21) {
      // extension: label + data sub-blocks
      i += 1
      while (i < bytes.length) {
        const size = bytes[i]
        i += 1
        if (size === 0) break
        i += size
      }
      continue
    }
    if (block === 0x2c) {
      frames += 1
      if (frames > 1) return true
      if (i + 9 > bytes.length) return false
      const imagePacked = bytes[i + 8]
      i += 9
      if (imagePacked & 0x80) i += 3 * 2 ** ((imagePacked & 0x07) + 1)
      i += 1 // LZW minimum code size
      while (i < bytes.length) {
        const size = bytes[i]
        i += 1
        if (size === 0) break
        i += size
      }
      continue
    }
    break
  }
  return false
}

const DATA_URI_RE = /data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)/gi

function base64ToBlob(base64: string, mediaType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mediaType })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('读取压缩结果失败'))
    reader.readAsDataURL(blob)
  })
}

async function compressOne(
  base64: string,
  mediaType: string,
): Promise<{ base64: string; mediaType: string }> {
  if (SKIP_COMPRESS.has(mediaType)) return { base64, mediaType }
  if (mediaType === 'image/gif' && isAnimatedGif(base64)) return { base64, mediaType }
  const blob = base64ToBlob(base64, mediaType)
  const { blob: out } = await resizeImage(blob, {
    maxWidth: 1280,
    type: 'image/webp',
    quality: 0.82,
  })
  return { base64: await blobToBase64(out), mediaType: 'image/webp' }
}

async function compressAssets(assets: DocAsset[]): Promise<DocAsset[]> {
  return Promise.all(
    assets.map(async (asset) => {
      if (SKIP_COMPRESS.has(asset.mediaType)) return asset
      try {
        const compressed = await compressOne(asset.base64, asset.mediaType)
        return {
          ...asset,
          mediaType: compressed.mediaType,
          base64: compressed.base64,
          fileName: `${asset.fileName.replace(/\.[^.]+$/, '')}.webp`,
        }
      } catch (err) {
        console.warn('[image-compress] 压缩失败，保留原图', err)
        return asset
      }
    }),
  )
}

/** 已内嵌在 markdown 里的 data URI 也压缩（换行等占位符不受影响） */
async function compressInlineImages(markdown: string): Promise<string> {
  const matches = Array.from(markdown.matchAll(DATA_URI_RE))
  if (matches.length === 0) return markdown
  let result = markdown
  for (const match of matches) {
    const [full, mediaType, base64] = match
    if (SKIP_COMPRESS.has(mediaType.toLowerCase())) continue
    try {
      const compressed = await compressOne(base64, mediaType)
      result = result.split(full).join(`data:${compressed.mediaType};base64,${compressed.base64}`)
    } catch (err) {
      console.warn('[image-compress] 内嵌图片压缩失败，保留原图', err)
    }
  }
  return result
}

/**
 * 保存：base64 模式先把图片压成宽度 ≤1280px 的 webp（GIF/webp/SVG 跳过），
 * 再交给主进程把 seekie-asset:// 换成 data URI。
 */
export async function saveTab(payload: SavePayload): Promise<SaveResult> {
  let markdown = payload.markdown
  let assets = payload.assets
  if (payload.imageMode === 'base64') {
    try {
      assets = await compressAssets(payload.assets)
      markdown = await compressInlineImages(payload.markdown)
    } catch (err) {
      console.warn('[image-compress] 整体压缩失败，按原图保存', err)
    }
  }
  return api.file.save({
    tabId: payload.tabId,
    savePath: payload.savePath,
    markdown,
    imageMode: payload.imageMode,
    assets,
    kind: payload.kind,
    suggestedName: payload.suggestedName,
    sourcePath: payload.sourcePath,
    converted: payload.converted,
    expectedMtime: payload.mtime ?? null,
    overwrite: payload.overwrite,
  })
}

/** 从绝对路径抽文件名 */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

/** 季度报告.docx → 季度报告.docx.md */
export function suggestedNameFromSource(sourcePath: string | null, fallback: string): string {
  if (!sourcePath) return `${fallback}.md`
  return `${baseName(sourcePath)}.md`
}
