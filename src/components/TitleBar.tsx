import { useEffect, useState } from 'react'
import { useApp } from '../store/app'
import { api } from '../lib/api'
import { formatNumber } from '../lib/wordcount'
import {
  IconNew,
  IconOpen,
  IconSave,
  IconSidebar,
  IconMinimize,
  IconMaximize,
  IconRestore,
  IconClose,
} from './Icons'

export interface TitleBarActions {
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onActivateTab: (id: string) => void
  onCloseTab: (id: string) => void
}

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

export function TitleBar({ actions }: { actions: TitleBarActions }) {
  const tabs = useApp((s) => s.tabs)
  const activeId = useApp((s) => s.activeId)
  const wordCount = useApp((s) => s.wordCount)
  const selCount = useApp((s) => s.selCount)
  const charset = useApp((s) => s.charset)
  const sidebarVisible = useApp((s) => s.sidebarVisible)
  const toggleSidebar = useApp((s) => s.toggleSidebar)
  const [maximized, setMaximized] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  useEffect(() => {
    void api.window.isMaximized().then(setMaximized)
    return api.window.onStateChange((payload) => setMaximized(payload.maximized))
  }, [])

  const active = tabs.find((t) => t.id === activeId)

  useEffect(() => {
    const name = active ? active.title : 'seekie-write'
    api.window.setTitle(`${active?.dirty ? '● ' : ''}${name} — seekie-write`)
  }, [active?.title, active?.dirty])

  return (
    <header className={`titlebar${isMac ? ' titlebar--mac' : ''}`}>
      <div className="titlebar__left no-drag">
        <button
          className={`icon-btn${sidebarVisible ? ' is-on' : ''}`}
          onClick={toggleSidebar}
          title="显示/隐藏大纲栏（Ctrl+Shift+B）"
          aria-label="切换侧栏"
        >
          <IconSidebar />
        </button>
      </div>

      <div className="titlebar__files no-drag">
        <div className="file-group">
          <button className="icon-btn" onClick={actions.onNew} title="新建（Ctrl+N）" aria-label="新建">
            <IconNew />
          </button>
          <button className="icon-btn" onClick={actions.onOpen} title="打开（Ctrl+O）" aria-label="打开">
            <IconOpen />
          </button>
          <button className="icon-btn" onClick={actions.onSave} title="保存（Ctrl+S）" aria-label="保存">
            <IconSave />
          </button>
        </div>

        {tabs.length > 0 && (
          <>
            <span className="vr" />
            <div className="tabstrip" role="tablist">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  role="tab"
                  aria-selected={tab.id === activeId}
                  className={`tab${tab.id === activeId ? ' is-active' : ''}${
                    tab.conflict ? ' is-conflict' : ''
                  }`}
                  onMouseDown={(e) => {
                    if (e.button === 1) {
                      e.preventDefault()
                      actions.onCloseTab(tab.id)
                    } else {
                      actions.onActivateTab(tab.id)
                    }
                  }}
                  title={tabTitle(tab)}
                >
                  <span className="tab__label">{tab.title}</span>
                  <span className="tab__state">
                    {tab.saveStatus === 'saving' ? (
                      '⋯'
                    ) : tab.conflict ? (
                      '⚠'
                    ) : tab.dirty ? (
                      '●'
                    ) : null}
                  </span>
                  <button
                    className="tab__close"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      actions.onCloseTab(tab.id)
                    }}
                    title="关闭标签（Ctrl+W）"
                    aria-label="关闭标签"
                  >
                    <IconClose width={11} height={11} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 拖拽区：填充剩余空间 */}
      <div className="titlebar__drag" />

      {!sidebarVisible && (
        <div
          className="titlebar__count no-drag"
          onMouseEnter={() => setShowDetail(true)}
          onMouseLeave={() => setShowDetail(false)}
          title="全文 / 选中字数"
        >
          <span className="count-main">
            字数 {formatNumber(wordCount)}
            {selCount > 0 && <span className="count-sel"> · 选中 {formatNumber(selCount)}</span>}
          </span>
          {showDetail && (
            <div className="count-pop">
              <div>
                <span>字符数（不含换行）</span>
                <b>{formatNumber(charset.chars)}</b>
              </div>
              <div>
                <span>段落数</span>
                <b>{formatNumber(charset.paragraphs)}</b>
              </div>
            </div>
          )}
        </div>
      )}

      {!isMac && (
        <div className="window-controls no-drag">
          <button
            className="window-btn"
            onClick={() => api.window.minimize()}
            title="最小化"
            aria-label="最小化"
          >
            <IconMinimize />
          </button>
          <button
            className="window-btn"
            onClick={() => api.window.toggleMaximize()}
            title={maximized ? '还原' : '最大化'}
            aria-label={maximized ? '还原' : '最大化'}
          >
            {maximized ? <IconRestore /> : <IconMaximize />}
          </button>
          <button
            className="window-btn window-btn--close"
            onClick={() => api.window.close()}
            title="关闭"
            aria-label="关闭"
          >
            <IconClose />
          </button>
        </div>
      )}
    </header>
  )
}

function tabTitle(tab: ReturnType<typeof useApp.getState>['tabs'][number]): string {
  const lines = [tab.title]
  if (tab.savePath) lines.push(tab.savePath)
  if (tab.converted && tab.sourcePath) lines.push(`由 ${tab.sourcePath} 转换`)
  if (tab.conflict) lines.push('文件已在外部被修改，自动保存已暂停')
  return lines.join('\n')
}
