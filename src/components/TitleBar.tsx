import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
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
  IconChevron,
} from './Icons'

export interface TitleBarActions {
  onNew: () => void
  onOpen: () => void
  onOpenPath: (path: string) => void
  onSave: () => void
  onSaveAs: () => void
  onExportMarkdown: () => void
  onExportHtml: () => void
  onExportDocx: () => void
  onExportPdf: () => void
  onPrint: () => void
  onPrintPreview: () => void
  onActivateTab: (id: string) => void
  onCloseTab: (id: string) => void
  onCloseOtherTabs: (id: string) => void
  onCloseRightTabs: (id: string) => void
  canReopenClosed: boolean
  onReopenClosed: () => void
}

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

export function TitleBar({ actions }: { actions: TitleBarActions }) {
  const tabs = useApp((s) => s.tabs)
  const activeId = useApp((s) => s.activeId)
  const wordCount = useApp((s) => s.wordCount)
  const selCount = useApp((s) => s.selCount)
  const charset = useApp((s) => s.charset)
  const sidebarVisible = useApp((s) => s.sidebarVisible)
  const recentFiles = useApp((s) => s.settings.recentFiles)
  const toggleSidebar = useApp((s) => s.toggleSidebar)
  const [maximized, setMaximized] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [recentOpen, setRecentOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [tabsOverflow, setTabsOverflow] = useState(false)
  const [tabMenuOpen, setTabMenuOpen] = useState(false)
  const [tabContext, setTabContext] = useState<{ tabId: string; x: number; y: number } | null>(null)
  const [hoverTabId, setHoverTabId] = useState<string | null>(null)
  const tabStripRef = useRef<HTMLDivElement>(null)

  // 标签条用满剩余宽度；放不下时在右侧显示“全部标签”下拉
  useEffect(() => {
    const el = tabStripRef.current
    if (!el) {
      setTabsOverflow(false)
      return
    }
    const update = () => setTabsOverflow(el.scrollWidth > el.clientWidth + 1)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [tabs.length])

  useEffect(() => {
    if (!tabMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.tab-overflow')) {
        setTabMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTabMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [tabMenuOpen])

  useEffect(() => {
    void api.window.isMaximized().then(setMaximized)
    return api.window.onStateChange((payload) => setMaximized(payload.maximized))
  }, [])

  const active = tabs.find((t) => t.id === activeId)
  const contextTab = tabContext ? (tabs.find((tab) => tab.id === tabContext.tabId) ?? null) : null
  const contextIndex = contextTab ? tabs.findIndex((tab) => tab.id === contextTab.id) : -1
  const contextPath = contextTab ? (contextTab.savePath ?? contextTab.sourcePath) : null

  useEffect(() => {
    if (!recentOpen) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.open-split')) {
        setRecentOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRecentOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [recentOpen])

  useEffect(() => {
    if (!exportOpen) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.saveas-split')) {
        setExportOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [exportOpen])

  // Linux 主选择粘贴由中键 mousedown 的默认动作触发；在标签上关闭标签时
  // 必须在 capture 阶段拦下默认行为，否则焦点仍在编辑区，可能先粘后关。
  useEffect(() => {
    const blockMiddlePaste = (event: MouseEvent) => {
      if (event.button !== 1) return
      const target = event.target as Element | null
      if (target?.closest('.tab')) event.preventDefault()
    }
    document.addEventListener('mousedown', blockMiddlePaste, true)
    document.addEventListener('mouseup', blockMiddlePaste, true)
    document.addEventListener('auxclick', blockMiddlePaste, true)
    return () => {
      document.removeEventListener('mousedown', blockMiddlePaste, true)
      document.removeEventListener('mouseup', blockMiddlePaste, true)
      document.removeEventListener('auxclick', blockMiddlePaste, true)
    }
  }, [])

  useEffect(() => {
    const strip = tabStripRef.current
    if (!strip || !activeId) return
    const reveal = () => {
      const el = strip.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeId)}"]`)
      if (!el) return
      const sr = strip.getBoundingClientRect()
      const er = el.getBoundingClientRect()
      const padding = 10
      if (er.left < sr.left) {
        strip.scrollTo({ left: Math.max(0, strip.scrollLeft - (sr.left - er.left) - padding), behavior: 'smooth' })
      } else if (er.right > sr.right) {
        strip.scrollTo({
          left: strip.scrollLeft + (er.right - sr.right) + padding,
          behavior: 'smooth',
        })
      }
    }
    const raf = window.requestAnimationFrame(reveal)
    // 新标签会让“全部标签”按钮出现/消失，标签条宽度会晚一帧才稳定
    const timer = window.setTimeout(reveal, 80)
    const onResize = () => reveal()
    window.addEventListener('resize', onResize)
    const observer = new ResizeObserver(reveal)
    observer.observe(strip)
    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(timer)
      window.removeEventListener('resize', onResize)
      observer.disconnect()
    }
  }, [activeId, tabs.length, tabsOverflow])

  useEffect(() => {
    if (!tabContext) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.tab-context')) {
        setTabContext(null)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTabContext(null)
    }
    const onBlur = () => setTabContext(null)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [tabContext])

  const openTabContext = (event: ReactMouseEvent, tabId: string) => {
    event.preventDefault()
    event.stopPropagation()
    actions.onActivateTab(tabId)
    const menuWidth = 200
    setTabContext({
      tabId,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: event.clientY,
    })
  }

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
          <div className="open-split">
            <button className="icon-btn" onClick={actions.onOpen} title="打开（Ctrl+O）" aria-label="打开">
              <IconOpen />
            </button>
            <button
              className="icon-btn open-split__arrow"
              onClick={() => setRecentOpen((open) => !open)}
              title="最近打开"
              aria-label="最近打开"
            >
              <IconChevron width={12} height={12} />
            </button>
            {recentOpen && (
              <div className="recent-menu">
                {recentFiles.length === 0 ? (
                  <div className="recent-menu__empty">暂无最近文件</div>
                ) : (
                  recentFiles.map((path) => {
                    const name = path.split(/[\\/]/).pop() || path
                    const dir = path.slice(0, Math.max(0, path.length - name.length)).replace(/[\\/]$/, '')
                    return (
                      <button
                        key={path}
                        className="recent-menu__item"
                        title={path}
                        onClick={() => {
                          actions.onOpenPath(path)
                          setRecentOpen(false)
                        }}
                      >
                        <span className="recent-menu__name">{name}</span>
                        <span className="recent-menu__dir">{dir}</span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
          <button className="icon-btn" onClick={actions.onSave} title="保存（Ctrl+S）" aria-label="保存">
            <IconSave />
          </button>
          <div className="saveas-split">
            <button
              className="icon-btn open-split__arrow saveas-split__arrow"
              onClick={() => setExportOpen((open) => !open)}
              title="另存为 / 导出"
              aria-label="另存为 / 导出"
            >
              <IconChevron width={12} height={12} />
            </button>
            {exportOpen && (
              <div className="export-menu">
                <button
                  className="export-menu__item"
                  onClick={() => {
                    setExportOpen(false)
                    actions.onSaveAs()
                  }}
                >
                  另存为…
                </button>
                <div className="export-menu__sep" />
                <button
                  className="export-menu__item"
                  onClick={() => {
                    setExportOpen(false)
                    actions.onExportMarkdown()
                  }}
                >
                  导出 Markdown（单文件）
                </button>
                <button
                  className="export-menu__item"
                  onClick={() => {
                    setExportOpen(false)
                    actions.onExportHtml()
                  }}
                >
                  导出 HTML（单文件）
                </button>
                <button
                  className="export-menu__item"
                  onClick={() => {
                    setExportOpen(false)
                    actions.onExportDocx()
                  }}
                >
                  导出 docx
                </button>
                <button
                  className="export-menu__item"
                  onClick={() => {
                    setExportOpen(false)
                    actions.onExportPdf()
                  }}
                >
                  导出 PDF
                </button>
                <div className="export-menu__sep" />
                <button
                  className="export-menu__item"
                  onClick={() => {
                    setExportOpen(false)
                    actions.onPrint()
                  }}
                >
                  打印
                </button>
                <button
                  className="export-menu__item"
                  onClick={() => {
                    setExportOpen(false)
                    actions.onPrintPreview()
                  }}
                >
                  打印预览
                </button>
              </div>
            )}
          </div>
        </div>

        {tabs.length > 0 && (
          <>
            <span className="vr" />
            <div
              className="tabstrip"
              role="tablist"
              ref={tabStripRef}
              onWheel={(e) => {
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                  e.currentTarget.scrollLeft += e.deltaY
                }
              }}
            >
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  data-tab-id={tab.id}
                  role="tab"
                  aria-selected={tab.id === activeId}
                  className={`tab${tab.id === activeId ? ' is-active' : ''}${
                    tab.conflict ? ' is-conflict' : ''
                  }${tab.id === hoverTabId ? ' is-hover' : ''}`}
                  onMouseEnter={(e) => {
                    if (tab.id === activeId) return
                    // 先记住未显示关闭按钮时的自然宽度，悬停期间锁住宽度
                    e.currentTarget.style.width = `${e.currentTarget.getBoundingClientRect().width}px`
                    setHoverTabId(tab.id)
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.width = ''
                    setHoverTabId((id) => (id === tab.id ? null : id))
                  }}
                  onMouseDown={(e) => {
                    if (e.button === 1) {
                      e.preventDefault()
                      actions.onCloseTab(tab.id)
                    } else {
                      actions.onActivateTab(tab.id)
                    }
                  }}
                  onAuxClick={(e) => {
                    if (e.button === 1) e.preventDefault()
                  }}
                  onContextMenu={(e) => openTabContext(e, tab.id)}
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

            {tabsOverflow && (
              <div className="tab-overflow">
                <button
                  className={`icon-btn${tabMenuOpen ? ' is-on' : ''}`}
                  onClick={() => setTabMenuOpen((open) => !open)}
                  title="全部标签"
                  aria-label="全部标签"
                >
                  <IconChevron width={14} height={14} />
                </button>
                {tabMenuOpen && (
                  <div className="tab-menu" role="menu">
                    {tabs.map((tab) => (
                      <div
                        key={tab.id}
                        role="menuitem"
                        className={`tab-menu__item${tab.id === activeId ? ' is-active' : ''}`}
                        onClick={() => {
                          actions.onActivateTab(tab.id)
                          setTabMenuOpen(false)
                        }}
                        title={tabTitle(tab)}
                      >
                        <span className="tab-menu__label">{tab.title}</span>
                        <span className={`tab-menu__state${tab.dirty ? ' is-dirty' : ''}`}>
                          {tab.saveStatus === 'saving' ? '⋯' : tab.conflict ? '⚠' : tab.dirty ? '●' : null}
                        </span>
                        <button
                          className="tab-menu__close"
                          onClick={(e) => {
                            e.stopPropagation()
                            actions.onCloseTab(tab.id)
                            setTabMenuOpen(false)
                          }}
                          title="关闭标签"
                          aria-label="关闭标签"
                        >
                          <IconClose width={10} height={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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

      {contextTab && tabContext && (
        <div
          className="tab-context no-drag"
          style={{ left: tabContext.x, top: tabContext.y }}
          role="menu"
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            className="tab-context__item"
            onClick={() => {
              actions.onCloseTab(contextTab.id)
              setTabContext(null)
            }}
          >
            关闭标签
          </button>
          <button
            className="tab-context__item"
            disabled={tabs.length <= 1}
            onClick={() => {
              actions.onCloseOtherTabs(contextTab.id)
              setTabContext(null)
            }}
          >
            关闭其他标签
          </button>
          <button
            className="tab-context__item"
            disabled={contextIndex >= tabs.length - 1}
            onClick={() => {
              actions.onCloseRightTabs(contextTab.id)
              setTabContext(null)
            }}
          >
            关闭右侧标签
          </button>
          <div className="tab-context__sep" />
          <button
            className="tab-context__item"
            disabled={!contextPath}
            onClick={() => {
              if (contextPath) void api.clipboard.write({ text: contextPath })
              setTabContext(null)
            }}
          >
            复制文件路径
          </button>
          <button
            className="tab-context__item"
            disabled={!contextPath}
            onClick={() => {
              if (contextPath) void api.file.reveal(contextPath)
              setTabContext(null)
            }}
          >
            在文件夹中显示
          </button>
          <div className="tab-context__sep" />
          <button
            className="tab-context__item"
            disabled={!actions.canReopenClosed}
            onClick={() => {
              actions.onReopenClosed()
              setTabContext(null)
            }}
          >
            重新打开关闭的标签
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
