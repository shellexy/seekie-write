import { api } from './api'
import type { DocAsset, ImageSaveMode, SaveResult } from '@shared/types'

export interface SavePayload {
  tabId: string
  savePath: string | null
  markdown: string
  imageMode: ImageSaveMode
  assets: DocAsset[]
  suggestedName?: string
  kind: 'auto' | 'manual' | 'saveAs'
  mtime?: number | null
  overwrite?: boolean
}

export async function saveTab(payload: SavePayload): Promise<SaveResult> {
  return api.file.save({
    tabId: payload.tabId,
    savePath: payload.savePath,
    markdown: payload.markdown,
    imageMode: payload.imageMode,
    assets: payload.assets,
    kind: payload.kind,
    suggestedName: payload.suggestedName,
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
