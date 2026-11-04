import { api } from './api'
import type { DocAsset } from '@shared/types'

/**
 * 渲染进程侧的资源登记：
 * File → base64 → main 进程内存仓库，返回可直接放进 <img src> 的 seekie-asset:// URL。
 *
 * assets 同时挂在标签元信息上（TabMeta.assets），保存时一起交给 main 决定
 * 写成 base64 还是相对路径 —— 因此切标签也不会丢。
 */
let seq = 100000

/** 当前活动标签，Crepe 的 onUpload 回调不接收 tabId，靠这里兜底 */
let currentTabId = 'default'

export function setAssetTab(tabId: string): void {
  currentTabId = tabId
}

export function getAssetTab(): string {
  return currentTabId
}

function extOf(type: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
  }
  return map[type] ?? 'png'
}

export async function fileToAsset(file: File, tabId: string): Promise<DocAsset> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  const id = seq++
  const mediaType = file.type || 'image/png'
  return {
    id,
    mediaType,
    fileName: `${tabId}-image-${id}.${extOf(mediaType)}`,
    base64: btoa(binary),
  }
}

/** 供 Crepe 的 onUpload 钩子使用：返回 seekie-asset:// 地址 */
export async function putAsset(tabId: string, file: File): Promise<string> {
  const asset = await fileToAsset(file, tabId)
  await api.asset.put(tabId, asset)
  // 交给上层登记到 TabMeta.assets
  onAssetAdded?.(tabId, asset)
  return `seekie-asset://${tabId}/${asset.id}`
}

type AssetAddedHandler = (tabId: string, asset: DocAsset) => void
let onAssetAdded: AssetAddedHandler | null = null

export function setAssetAddedHandler(handler: AssetAddedHandler): void {
  onAssetAdded = handler
}

/** 保存后清理：md 里已不再引用的资源可以丢掉 */
export function pruneAssets(assets: DocAsset[], markdown: string): DocAsset[] {
  return assets.filter((asset) => markdown.includes(`seekie-asset://${asset.id}`) ||
    markdown.includes(`seekie-asset://${getAssetTab()}/${asset.id}`))
}
