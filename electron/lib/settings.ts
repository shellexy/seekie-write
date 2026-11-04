import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings } from '../../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  imageMode: 'relative',
  autoSaveDelay: 800,
  theme: 'system',
  sidebarVisible: true,
  sidebarWidth: 240,
  fontScale: 1,
}

let cached: AppSettings | null = null

function userDir(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function draftsDir(): string {
  const dir = join(userDir(), 'drafts')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function assetsDir(): string {
  const dir = join(userDir(), 'assets')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function settingsPath(): string {
  return join(userDir(), 'settings.json')
}

export function sessionPath(): string {
  return join(userDir(), 'session.json')
}

export function getSettings(): AppSettings {
  if (cached) return cached
  try {
    const raw = JSON.parse(readFileSync(settingsPath(), 'utf8')) as Partial<AppSettings>
    cached = { ...DEFAULT_SETTINGS, ...raw }
  } catch {
    cached = { ...DEFAULT_SETTINGS }
  }
  return cached
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  cached = next
  try {
    writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  } catch (err) {
    console.error('[settings] 写入失败', err)
  }
  return next
}
