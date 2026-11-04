import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { DocAsset } from '../../shared/types'

/**
 * 内存资源仓库：文档里的图片在内嵌/粘贴时先进这里，
 * 通过 seekie-asset://<tabId>/<assetId> 供渲染进程显示，
 * 保存文档时再按用户选择的策略落盘。
 */
const store = new Map<string, Map<string, DocAsset>>()

function key(tabId: string, assetId: number | string): string {
  return `${tabId}/${assetId}`
}

export function put(tabId: string, asset: DocAsset): void {
  if (!store.has(tabId)) store.set(tabId, new Map())
  store.get(tabId)!.set(String(asset.id), asset)
}

export function putMany(tabId: string, assets: DocAsset[]): void {
  assets.forEach((a) => put(tabId, a))
}

export function get(tabId: string, assetId: string): DocAsset | undefined {
  return store.get(tabId)?.get(assetId)
}

export function drop(tabId: string): void {
  store.delete(tabId)
}

export function count(tabId: string): number {
  return store.get(tabId)?.size ?? 0
}

/** 把一组资源写进目录，返回 id → 相对路径的映射 */
export function materialize(
  assets: DocAsset[],
  dir: string,
): Map<number, string> {
  const written = new Map<number, string>()
  if (!assets.length) return written
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  for (const asset of assets) {
    const file = join(dir, asset.fileName)
    if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, Buffer.from(asset.base64, 'base64'))
    written.set(asset.id, file)
  }
  return written
}

export function extFor(mediaType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'image/x-emf': 'emf',
    'image/x-wmf': 'wmf',
  }
  return map[mediaType] ?? 'png'
}
