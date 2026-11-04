import { existsSync, readFileSync, rmSync, writeFileSync, renameSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { DraftState, SessionState } from '../../shared/types'
import { draftsDir, sessionPath } from './settings'

/**
 * 草稿区：没有落盘路径的文档（新建 / 转换后未另存）在这里存一份，
 * 保证"自动保存 + 退出不打扰"成立。启动时据此恢复上次会话。
 */

function draftPathFor(tabId: string): string {
  return join(draftsDir(), `${tabId}.md`)
}

export function saveDraft(draft: Omit<DraftState, 'draftPath'>): DraftState {
  const draftPath = draftPathFor(draft.tabId)
  const tmp = `${draftPath}.tmp`
  writeFileSync(tmp, draft.markdown, 'utf8')
  renameSync(tmp, draftPath)
  const full: DraftState = { ...draft, draftPath, title: draft.title || basename(draftPath) }
  mergeSession(full)
  return full
}

export function dropDraft(tabId: string): void {
  const draftPath = draftPathFor(tabId)
  try {
    if (existsSync(draftPath)) rmSync(draftPath)
  } catch (err) {
    console.error('[draft] 删除失败', err)
  }
  const session = readSession()
  const next = { ...session, tabs: session.tabs.filter((t) => t.tabId !== tabId) }
  writeSession(next)
}

function readSession(): SessionState {
  try {
    const raw = JSON.parse(readFileSync(sessionPath(), 'utf8')) as SessionState
    if (!raw || !Array.isArray(raw.tabs)) return { tabs: [], activeTabId: null }
    return raw
  } catch {
    return { tabs: [], activeTabId: null }
  }
}

function writeSession(session: SessionState): void {
  try {
    writeFileSync(sessionPath(), JSON.stringify(session, null, 2), 'utf8')
  } catch (err) {
    console.error('[session] 写入失败', err)
  }
}

function mergeSession(draft: DraftState): void {
  const session = readSession()
  const tabs = session.tabs.filter((t) => t.tabId !== draft.tabId)
  tabs.push(draft)
  writeSession({ tabs, activeTabId: session.activeTabId ?? draft.tabId })
}

export function setActiveDraft(tabId: string): void {
  const session = readSession()
  writeSession({ ...session, activeTabId: tabId })
}

/** 读取上次会话；md 内容从草稿文件里取，已丢失的条目跳过 */
export function loadSession(): SessionState {
  const session = readSession()
  const tabs: DraftState[] = []
  for (const tab of session.tabs) {
    try {
      if (!tab.draftPath || !existsSync(tab.draftPath)) continue
      const markdown = readFileSync(tab.draftPath, 'utf8')
      tabs.push({ ...tab, markdown })
    } catch {
      /* 跳过损坏草稿 */
    }
  }
  const activeTabId = tabs.some((t) => t.tabId === session.activeTabId)
    ? session.activeTabId
    : tabs[0]?.tabId ?? null
  return { tabs, activeTabId }
}
