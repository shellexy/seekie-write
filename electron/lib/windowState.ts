import { app, type BrowserWindow, type Rectangle } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface PersistedWindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

function statePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function loadWindowState(): PersistedWindowState | null {
  try {
    const path = statePath()
    if (!existsSync(path)) return null
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<PersistedWindowState>
    if (!isFiniteNumber(raw.width) || !isFiniteNumber(raw.height)) return null
    return {
      x: isFiniteNumber(raw.x) ? raw.x : undefined,
      y: isFiniteNumber(raw.y) ? raw.y : undefined,
      width: Math.max(720, Math.round(raw.width)),
      height: Math.max(480, Math.round(raw.height)),
      maximized: raw.maximized === true,
    }
  } catch {
    return null
  }
}

function normalBounds(win: BrowserWindow): Rectangle {
  return win.isMaximized() ? win.getNormalBounds() : win.getBounds()
}

export function saveWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const bounds = normalBounds(win)
  const state: PersistedWindowState = {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(720, bounds.width),
    height: Math.max(480, bounds.height),
    maximized: win.isMaximized(),
  }
  try {
    const path = statePath()
    const tmp = `${path}.tmp`
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8')
    renameSync(tmp, path)
  } catch (err) {
    console.error('[window-state] 写入失败', err)
  }
}
