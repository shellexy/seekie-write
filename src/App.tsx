import { useCallback, useEffect, useRef, useState } from 'react'
import { Crepe } from '@milkdown/crepe'
import type { Ctx } from '@milkdown/kit/ctx'
import { editorViewCtx } from '@milkdown/kit/core'
import type { ImageSaveMode, SaveKind } from '@shared/types'

import { api } from './lib/api'
import { useApp, type TabMeta } from './store/app'
import { applyThemeClass, createEditor } from './editor/createEditor'
import { applyCrepeTheme, applyEditorTypography } from './editor/theme'
import { TabStore, scrollToPos, selectRange } from './editor/tabs'
import { EditorSession, type EditorSnapshot } from './editor/session'
import { runEditorCommand } from './editor/commandBus'
import { copySelection } from './editor/clipboard'
import { installTopBarTooltips, stopTopBarTooltips } from './editor/topBarConfig'
import { setAssetAddedHandler, setAssetTab } from './lib/assets'
import { saveTab } from './lib/files'
import { fileName, tabId as makeTabId } from './lib/titleFromPath'
import { activeOutlineId, type OutlineItem } from './lib/outline'

import { TitleBar } from './components/TitleBar'
import { Outline } from './components/Outline'
import { EditorPane } from './components/EditorPane'
import { SidebarFooter } from './components/SidebarFooter'
import { FindBar, type FindMode } from './components/FindBar'
import { SettingsDialog } from './components/SettingsDialog'
import { Toast, ConvertingOverlay, ConfirmDialog, ImageModeDialog } from './components/Overlays'

const BLANK_DOC = '# 未命名\n\n'

const SAVE_RANK: Record<SaveKind, number> = { auto: 0, manual: 1, saveAs: 2 }

export default function App() {
  const settings = useApp((s) => s.settings)
  const sidebarVisible = useApp((s) => s.sidebarVisible)
  const zoom = useApp((s) => s.zoom)
  const tabs = useApp((s) => s.tabs)
  const activeId = useApp((s) => s.activeId)
  const notify = useApp((s) => s.notify)
  const setConverting = useApp((s) => s.setConverting)
  const updateSettings = useApp((s) => s.updateSettings)
  const patchTab = useApp((s) => s.patchTab)
  const setWordCount = useApp((s) => s.setWordCount)

  const crepeRef = useRef<Crepe | null>(null)
  const tabStoreRef = useRef<TabStore | null>(null)
  const sessionRef = useRef<EditorSession | null>(null)
  const ctxRef = useRef<Ctx | null>(null)
  const bootedRef = useRef(false)
  const autosaveTimers = useRef<Map<string, number>>(new Map())
  /** 同一标签同时只允许一个保存请求，避免自己写的文件被下一次保存误判成外部修改 */
  const inFlightSaves = useRef<Set<string>>(new Set())
  const pendingSaves = useRef<Map<string, SaveKind>>(new Map())
  const untitledSeq = useRef(0)

  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [cursorPos, setCursorPos] = useState(0)
  const [imageDialog, setImageDialog] = useState({ open: false, pendingSave: false })
  const [findState, setFindState] = useState<{ open: boolean; mode: FindMode }>({
    open: false,
    mode: 'find',
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draggingSidebarWidth, setDraggingSidebarWidth] = useState<number | null>(null)
  const [confirmState, setConfirmState] = useState<{
    open: boolean
    title: string
    message: React.ReactNode
    confirmText?: string
    danger?: boolean
    onConfirm: () => void
  }>({ open: false, title: '', message: '', onConfirm: () => {} })

  const tabById = (id: string | null): TabMeta | undefined =>
    id ? useApp.getState().tabs.find((t) => t.id === id) : undefined

  /* ----------------------------- 自动保存调度 ----------------------------- */

  const flushTimer = useCallback((id: string) => {
    const timers = autosaveTimers.current
    const timer = timers.get(id)
    if (timer != null) {
      window.clearTimeout(timer)
      timers.delete(id)
    }
  }, [])

  /** 无路径的标签：写草稿区，保证退出不丢内容 */
  const saveDraftIfNeeded = useCallback(async (id: string) => {
    const store = tabStoreRef.current
    const tab = tabById(id)
    if (!store || !tab || tab.savePath) return
    const markdown = store.markdownOf(id)
    if (!markdown.trim()) return
    await api.draft.save({
      tabId: id,
      markdown,
      title: tab.title,
      sourcePath: tab.sourcePath,
      sourceExt: tab.sourceExt,
      savePath: tab.savePath,
      savedAt: Date.now(),
    })
  }, [])

  /* ----------------------------- 保存 ----------------------------- */

  const doSave = useCallback(
    async (
      id: string,
      kind: SaveKind,
      forceMode?: ImageSaveMode,
      overwrite = false,
    ) => {
      const store = tabStoreRef.current
      const tab = tabById(id)
      if (!store || !tab) return
      flushTimer(id)

      if (inFlightSaves.current.has(id)) {
        // 保存进行中：记下更高优先级的请求，结束后再补一次
        const queued = pendingSaves.current.get(id)
        if (!queued || SAVE_RANK[kind] > SAVE_RANK[queued]) pendingSaves.current.set(id, kind)
        return
      }
      inFlightSaves.current.add(id)

      try {
        // 没有落盘路径（新建 / 转换后未另存）时，自动保存只写草稿区，
        // 绝不弹“另存为”对话框打断输入。
        if (!tab.savePath && kind === 'auto') {
          await saveDraftIfNeeded(id)
          patchTab(id, {
            dirty: pendingSaves.current.has(id),
            saveStatus: 'idle',
            saveMessage: undefined,
          })
          return
        }

        const markdown = store.markdownOf(id)
        patchTab(id, { saveStatus: 'saving' })
        const result = await saveTab({
          tabId: id,
          savePath: kind === 'saveAs' ? null : tab.savePath,
          markdown,
          imageMode: forceMode ?? useApp.getState().settings.imageMode,
          assets: tab.assets,
          suggestedName:
            tab.converted && tab.sourcePath ? `${fileName(tab.sourcePath)}.md` : `${tab.title}.md`,
          kind,
          mtime: tab.mtime,
          overwrite,
        })

        if (result.status === 'saved' && result.path) {
          patchTab(id, {
            savePath: result.path,
            saveStatus: 'saved',
            saveMessage: undefined,
            // 保存期间又有编辑的话，保持 dirty，交给 pending 的那次保存
            dirty: pendingSaves.current.has(id),
            draft: false,
            conflict: false,
            title: fileName(result.path),
            mtime: result.mtime ?? (await api.file.mtime(result.path)),
          })
          void api.asset.drop(id)
          if (result.writtenImages) notify(`已保存，并写入 ${result.writtenImages} 张图片`)
        } else if (result.status === 'canceled') {
          patchTab(id, { saveStatus: 'idle' })
        } else if (result.status === 'conflict') {
          // 暂停该标签的自动保存，等用户决定
          flushTimer(id)
          pendingSaves.current.delete(id)
          patchTab(id, { saveStatus: 'conflict', conflict: true, saveMessage: result.message })
          notify('文件已在外部被修改，自动保存已暂停', 'error')
        } else {
          patchTab(id, { saveStatus: 'error', saveMessage: result.message })
          notify(result.message ?? '保存失败', 'error')
        }
      } finally {
        inFlightSaves.current.delete(id)
        const queued = pendingSaves.current.get(id)
        if (queued) {
          pendingSaves.current.delete(id)
          window.setTimeout(() => void doSave(id, queued), 150)
        }
      }
    },
    [flushTimer, notify, patchTab, saveDraftIfNeeded],
  )

  const scheduleAutosave = useCallback(
    (id: string) => {
      const timers = autosaveTimers.current
      const existing = timers.get(id)
      if (existing != null) window.clearTimeout(existing)
      const delay = useApp.getState().settings.autoSaveDelay || 800
      timers.set(
        id,
        window.setTimeout(() => {
          timers.delete(id)
          void doSave(id, 'auto')
        }, delay),
      )
    },
    [doSave],
  )

  const markDirty = useCallback(() => {
    const id = useApp.getState().activeId
    const tab = tabById(id)
    if (!id || !tab) return
    if (!tab.dirty) patchTab(id, { dirty: true })
    scheduleAutosave(id)
  }, [patchTab, scheduleAutosave])

  const saveActive = useCallback(
    (kind: 'manual' | 'saveAs' = 'manual') => {
      const id = useApp.getState().activeId
      if (!id) return
      void doSave(id, kind)
    },
    [doSave],
  )

  /* ----------------------------- 编辑器启动 ----------------------------- */

  const restoreSession = useCallback(async () => {
    const store = tabStoreRef.current
    if (!store) return
    const session = await api.draft.loadSession()

    if (session.tabs.length === 0) {
      // 取最新状态：等待 loadSession 期间可能已经通过启动参数打开了文件
      if (useApp.getState().tabs.length === 0) newTabRef.current?.()
      return
    }

    for (const draft of session.tabs) {
      if (store.has(draft.tabId)) continue
      const state = store.createStateFromMarkdown(draft.markdown)
      store.register(draft.tabId, state)
      useApp.getState().upsertTab({
        id: draft.tabId,
        title: draft.title,
        dirty: false,
        sourcePath: draft.sourcePath,
        sourceExt: draft.sourceExt,
        savePath: draft.savePath,
        converted: !!draft.sourceExt && draft.sourceExt !== '.md',
        draft: !draft.savePath,
        saveStatus: 'idle',
        conflict: false,
        assets: [],
        mtime: draft.savePath ? await api.file.mtime(draft.savePath) : null,
        scrollTop: 0,
      })
    }
    const target =
      session.activeTabId && store.has(session.activeTabId) ? session.activeTabId : session.tabs[0]?.tabId
    if (target) activateRef.current?.(target)
    notify('已恢复上次的编辑会话')
  }, [notify])

  const newTab = useCallback(() => {
    const store = tabStoreRef.current
    if (!store) return
    const id = makeTabId()
    untitledSeq.current += 1
    const state = store.createStateFromMarkdown(BLANK_DOC)
    store.register(id, state)
    useApp.getState().upsertTab({
      id,
      title: `未命名-${untitledSeq.current}`,
      dirty: false,
      sourcePath: null,
      sourceExt: null,
      savePath: null,
      converted: false,
      draft: true,
      saveStatus: 'idle',
      conflict: false,
      assets: [],
      mtime: null,
      scrollTop: 0,
    })
    setAssetTab(id)
    activateRef.current?.(id)
  }, [])

  const newTabRef = useRef<(() => void) | null>(null)
  const activateRef = useRef<((id: string) => void) | null>(null)
  const openPathRef = useRef<((path: string) => Promise<void>) | null>(null)

  const bootEditor = useCallback(
    (root: HTMLDivElement) => {
      if (bootedRef.current) return
      bootedRef.current = true

      const crepe = createEditor({
        root,
        tabId: '__boot__',
        defaultValue: BLANK_DOC,
      })
      crepeRef.current = crepe

      void crepe.create().then(async () => {
        const ctx = crepe.editor.ctx
        ctxRef.current = ctx
        const view = ctx.get(editorViewCtx)

        const store = new TabStore(crepe)
        store.attach()
        tabStoreRef.current = store

        const session = new EditorSession(
          ctx,
          (snapshot: EditorSnapshot) => {
            setOutline(snapshot.outline)
            setCursorPos(snapshot.cursorPos)
            setWordCount(snapshot.total.words, snapshot.selected.words, {
              chars: snapshot.total.chars,
              paragraphs: snapshot.total.paragraphs,
            })
          },
          () => markDirty(),
        )
        session.attach(view)
        sessionRef.current = session

        // 代理 view.dispatch，拿到文档变化 / 选区变化
        const originalDispatch = view.dispatch.bind(view)
        view.dispatch = ((tr: any, ...rest: any[]) => {
          ;(originalDispatch as any)(tr, ...rest)
          session.handleTransaction(tr)
        }) as typeof view.dispatch

        installTopBarTooltips(root)
        applyAppearance()

        // Crepe 粘贴/拖入图片 → 记到当前标签的 assets 上，保存时统一处理
        setAssetAddedHandler((tabIdForAsset, asset) => {
          const owner =
            useApp.getState().tabs.find((t) => t.id === tabIdForAsset) ??
            useApp.getState().tabs.find((t) => t.id === useApp.getState().activeId)
          const target = owner?.id ?? tabIdForAsset
          const current = useApp.getState().tabs.find((t) => t.id === target)
          patchTab(target, { assets: [...(current?.assets ?? []), asset] })
        })
        // 启动参数里的文件：渲染层就绪后再主动拉取，避免 did-finish-load 早于订阅
        const startupFile = await api.app.takeStartupFile()
        if (startupFile) await openPathRef.current?.(startupFile)
        await restoreSession()
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  /* ----------------------------- 切换 / 关闭标签 ----------------------------- */

  const activate = useCallback(
    (id: string) => {
      const store = tabStoreRef.current
      if (!store || !store.has(id)) return
      store.activate(id)
      useApp.getState().setActive(id)
      setAssetTab(id)
      sessionRef.current?.refresh(true)
    },
    [],
  )
  activateRef.current = activate
  newTabRef.current = newTab

  const closeTab = useCallback(
    (id: string) => {
      const tab = tabById(id)
      if (!tab) return
      const finish = () => {
        void saveDraftIfNeeded(id).then(() => {
          tabStoreRef.current?.drop(id)
          useApp.getState().removeTab(id)
          void api.asset.drop(id)
          // 关闭标签不应在会话里留下草稿，否则下次启动会把它“复活”
          void api.draft.drop(id)
          const rest = useApp.getState().tabs
          if (rest.length === 0) {
            newTab()
          } else if (useApp.getState().activeId === id) {
            activate(rest[rest.length - 1].id)
          }
        })
      }
      if (tab.dirty) {
        setConfirmState({
          open: true,
          title: '关闭这个标签？',
          message: (
            <>
              <b>{tab.title}</b> 有未保存的改动。
              <br />
              关闭后会丢弃这些改动。
            </>
          ),
          confirmText: '关闭并丢弃',
          danger: true,
          onConfirm: () => {
            setConfirmState((c) => ({ ...c, open: false }))
            flushTimer(id)
            tabStoreRef.current?.drop(id)
            useApp.getState().removeTab(id)
            void api.asset.drop(id)
            void api.draft.drop(id)
            const rest = useApp.getState().tabs
            if (rest.length === 0) newTab()
            else activate(rest[rest.length - 1].id)
          },
        })
        return
      }
      finish()
    },
    [activate, flushTimer, newTab, saveDraftIfNeeded],
  )

  /** 批量关闭（关闭其他 / 关闭右侧共用）：有未保存改动时统一确认一次 */
  const closeManyTabs = useCallback(
    (ids: string[]) => {
      const targets = useApp.getState().tabs.filter((tab) => ids.includes(tab.id))
      if (!targets.length) return
      const dirtyCount = targets.filter((tab) => tab.dirty).length

      const closeNow = () => {
        for (const tab of targets) {
          flushTimer(tab.id)
          pendingSaves.current.delete(tab.id)
          tabStoreRef.current?.drop(tab.id)
          useApp.getState().removeTab(tab.id)
          void api.asset.drop(tab.id)
          void api.draft.drop(tab.id)
        }
        const rest = useApp.getState().tabs
        if (rest.length === 0) {
          newTab()
        } else if (!rest.some((tab) => tab.id === useApp.getState().activeId)) {
          activate(rest[rest.length - 1].id)
        }
      }

      if (dirtyCount > 0) {
        setConfirmState({
          open: true,
          title: '关闭这些标签？',
          message: (
            <>
              其中 <b>{dirtyCount}</b> 个标签有未保存的改动，关闭后会丢弃。
            </>
          ),
          confirmText: '关闭并丢弃',
          danger: true,
          onConfirm: () => {
            setConfirmState((c) => ({ ...c, open: false }))
            closeNow()
          },
        })
        return
      }
      closeNow()
    },
    [activate, flushTimer, newTab],
  )

  const closeOtherTabs = useCallback(
    (id: string) => {
      activate(id)
      const ids = useApp
        .getState()
        .tabs.filter((tab) => tab.id !== id)
        .map((tab) => tab.id)
      closeManyTabs(ids)
    },
    [activate, closeManyTabs],
  )

  const closeRightTabs = useCallback(
    (id: string) => {
      const tabs = useApp.getState().tabs
      const index = tabs.findIndex((tab) => tab.id === id)
      if (index < 0) return
      closeManyTabs(tabs.slice(index + 1).map((tab) => tab.id))
    },
    [closeManyTabs],
  )

  /* ----------------------------- 打开文件 ----------------------------- */

  const openPath = useCallback(
    async (path: string) => {
      const store = tabStoreRef.current
      if (!store) return
      const id = makeTabId()
      setConverting(true, `正在打开 ${fileName(path)}…`)
      try {
        const result = await api.file.read(path, id)
        if (!result.ok) {
          notify(result.error ?? '打开失败', 'error')
          return
        }
        // 新建后没动过的空白标签：打开文件时直接替换掉，
        // 避免启动参数打开文件时 restoreSession 与 openPath 竞争多出一个空标签。
        const existing = useApp.getState().tabs
        if (
          existing.length === 1 &&
          !existing[0].savePath &&
          !existing[0].sourcePath &&
          !existing[0].dirty
        ) {
          const blankId = existing[0].id
          flushTimer(blankId)
          store.drop(blankId)
          useApp.getState().removeTab(blankId)
          void api.asset.drop(blankId)
          void api.draft.drop(blankId)
        }
        store.register(id, store.createStateFromMarkdown(result.markdown))
        useApp.getState().upsertTab({
          id,
          title: result.title,
          dirty: false,
          sourcePath: result.sourcePath,
          sourceExt: result.sourceExt,
          savePath: result.converted ? null : result.sourcePath,
          converted: result.converted,
          draft: result.converted,
          saveStatus: 'idle',
          conflict: false,
          assets: result.assets,
          mtime: result.sourcePath ? await api.file.mtime(result.sourcePath) : null,
          scrollTop: 0,
        })
        setAssetTab(id)
        activate(id)
        if (result.converted) {
          if (result.assets.length) await api.asset.register(id, result.assets)
          const inlined = result.inlinedImages ?? 0
          const imageCount = result.assets.length > 0 ? result.assets.length : inlined
          notify(
            imageCount
              ? `已转换为 Markdown（含 ${imageCount} 张图片${
                  inlined > 0 ? '，已内嵌 base64' : ''
                }），保存时会生成 ${fileName(path)}.md`
              : `已转换为 Markdown，保存时会生成 ${fileName(path)}.md`,
          )
        }
      } finally {
        setConverting(false)
      }
    },
    [activate, flushTimer, notify, setConverting],
  )
  openPathRef.current = openPath

  /* ----------------------------- 菜单命令 ----------------------------- */

  useEffect(() => {
    return api.menu.onCommand(({ command }) => {
      const ctx = ctxRef.current
      switch (command) {
        case 'file:new':
          newTabRef.current?.()
          break
        case 'file:open':
          void api.file.pickOpen().then((path) => {
            if (path) void openPath(path)
          })
          break
        case 'file:save':
          saveActive('manual')
          break
        case 'file:save-as':
          saveActive('saveAs')
          break
        case 'tab:close': {
          const id = useApp.getState().activeId
          if (id) closeTab(id)
          break
        }
        case 'view:toggle-sidebar':
          useApp.getState().toggleSidebar()
          break
        case 'view:zoom-in':
          useApp.getState().setZoom(Math.min(2, useApp.getState().zoom + 0.1))
          break
        case 'view:zoom-out':
          useApp.getState().setZoom(Math.max(0.7, useApp.getState().zoom - 0.1))
          break
        case 'view:zoom-reset':
          useApp.getState().setZoom(1)
          break
        case 'edit:find':
          setFindState({ open: true, mode: 'find' })
          break
        case 'edit:replace':
          setFindState({ open: true, mode: 'replace' })
          break
        case 'app:settings':
          setSettingsOpen(true)
          break
        case 'clipboard:copy-markdown':
          if (ctx) void copySelection(ctx, 'markdown')
          break
        case 'clipboard:copy-html':
          if (ctx) void copySelection(ctx, 'html')
          break
        case 'help:about':
          notify('seekie-write 0.1.0 · Electron + Milkdown Crepe')
          break
        default:
          if (ctx) runEditorCommand(ctx, command)
      }
    })
  }, [closeTab, notify, openPath, saveActive])

  useEffect(() => api.app.onOpenFile((path) => void openPath(path)), [openPath])

  // 拖文件进窗口
  useEffect(
    () =>
      api.app.onDragDropFile((paths) => {
        for (const path of paths) void openPath(path)
      }),
    [openPath],
  )

  // DOM 层拖拽：把文件丢进窗口即打开（Electron 的 File 对象带 path）
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        document.body.classList.add('is-dragging-file')
      }
    }
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) document.body.classList.remove('is-dragging-file')
    }
    const onDrop = (e: DragEvent) => {
      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return
      e.preventDefault()
      document.body.classList.remove('is-dragging-file')
      for (const file of Array.from(files)) {
        const path = (file as File & { path?: string }).path
        if (path) void openPath(path)
        else notify('无法获取文件路径', 'error')
      }
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [notify, openPath])

  // 主进程要关窗口：先把无路径标签写进草稿区
  useEffect(() => {
    return api.app.onBeforeClose(async () => {
      const state = useApp.getState()
      for (const tab of state.tabs) {
        if (!tab.savePath && tab.dirty) await saveDraftIfNeeded(tab.id)
      }
    })
  }, [saveDraftIfNeeded])

  // 有路径的标签：定时兜底自动保存 + 定期比对 mtime 检测外部修改
  useEffect(() => {
    const timer = window.setInterval(() => {
      const state = useApp.getState()
      for (const tab of state.tabs) {
        if (tab.dirty && tab.savePath && !tab.conflict) void doSave(tab.id, 'auto')
      }
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [doSave])

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const state = useApp.getState()
      for (const tab of state.tabs) {
        if (!tab.savePath || tab.conflict) continue
        // 保存进行中时磁盘 mtime 已经被我们自己的写入改掉，跳过这一轮
        if (inFlightSaves.current.has(tab.id)) continue
        const mtime = await api.file.mtime(tab.savePath)
        // 等待 IPC 期间可能刚好完成了一次我们自己的保存：取最新状态再比较
        const latest = useApp.getState().tabs.find((t) => t.id === tab.id)
        if (!latest || !latest.savePath || latest.conflict) continue
        if (inFlightSaves.current.has(latest.id)) continue
        if (mtime != null && latest.mtime != null && Math.abs(mtime - latest.mtime) > 1) {
          flushTimer(latest.id)
          pendingSaves.current.delete(latest.id)
          patchTab(latest.id, { conflict: true, saveStatus: 'conflict' })
        }
      }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [flushTimer, patchTab])

  /* ----------------------------- 退出前落草稿 ----------------------------- */

  useEffect(() => {
    const handler = () => {
      const state = useApp.getState()
      for (const tab of state.tabs) {
        if (!tab.savePath) void saveDraftIfNeeded(tab.id)
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [saveDraftIfNeeded])

  /* ----------------------------- 主题 / 排版 ----------------------------- */

  const applyAppearance = useCallback(() => {
    const current = useApp.getState().settings
    const dark =
      current.theme === 'dark' ||
      (current.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    applyCrepeTheme(current.crepeTheme, dark)
    applyEditorTypography(current.fontFamily, current.fontSize, current.contentWidth)
    applyThemeClass(document.getElementById('crepe-root'), dark)
  }, [])

  useEffect(() => {
    applyAppearance()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', applyAppearance)
    return () => mq.removeEventListener('change', applyAppearance)
  }, [settings, applyAppearance])

  /* ----------------------------- 侧栏宽度 ----------------------------- */

  const startSidebarResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = useApp.getState().settings.sidebarWidth || 240
      let latest = startWidth
      document.body.classList.add('is-resizing')
      setDraggingSidebarWidth(startWidth)

      const onMove = (e: MouseEvent) => {
        latest = Math.min(420, Math.max(170, startWidth + e.clientX - startX))
        setDraggingSidebarWidth(latest)
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.classList.remove('is-resizing')
        setDraggingSidebarWidth(null)
        updateSettings({ sidebarWidth: latest })
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [updateSettings],
  )

  const resetSidebarWidth = useCallback(() => {
    setDraggingSidebarWidth(null)
    updateSettings({ sidebarWidth: 240 })
  }, [updateSettings])

  /* ----------------------------- 设置 / 卸载 ----------------------------- */

  useEffect(() => {
    void api.settings.get().then((s) => useApp.getState().init(s))
    return () => {
      stopTopBarTooltips()
      void crepeRef.current?.destroy()
    }
  }, [])

  /* ----------------------------- 渲染 ----------------------------- */

  const active = tabById(activeId)
  const outlineActive = activeOutlineId(outline, cursorPos)

  return (
    <div
      className="app"
      style={{ ['--sidebar-w' as string]: `${draggingSidebarWidth ?? settings.sidebarWidth}px` }}
    >
      <TitleBar
        actions={{
          onNew: () => newTabRef.current?.(),
          onOpen: () =>
            void api.file.pickOpen().then((p) => {
              if (p) void openPath(p)
            }),
          onSave: () => saveActive('manual'),
          onSaveAs: () => saveActive('saveAs'),
          onUndo: () => {
            const ctx = ctxRef.current
            if (ctx) runEditorCommand(ctx, 'edit:undo')
          },
          onRedo: () => {
            const ctx = ctxRef.current
            if (ctx) runEditorCommand(ctx, 'edit:redo')
          },
          onFind: () => setFindState({ open: true, mode: 'find' }),
          onReplace: () => setFindState({ open: true, mode: 'replace' }),
          onSettings: () => setSettingsOpen(true),
          onActivateTab: activate,
          onCloseTab: closeTab,
          onCloseOtherTabs: closeOtherTabs,
          onCloseRightTabs: closeRightTabs,
        }}
      />

      <div className={`body${sidebarVisible ? ' with-sidebar' : ''}`}>
        {sidebarVisible && (
          <Outline
            items={outline}
            activeId={outlineActive}
            onScrollTo={(item) => {
              const ctx = ctxRef.current
              if (ctx) scrollToPos(ctx, item.pos)
            }}
            onSelectSection={(item) => {
              const ctx = ctxRef.current
              if (ctx) selectRange(ctx, item.pos, item.end)
            }}
            onResizeStart={startSidebarResize}
            onResizeReset={resetSidebarWidth}
            footer={
              <SidebarFooter
                onReload={() =>
                  active && void openPath(active.sourcePath ?? active.savePath ?? '')
                }
                onKeepMine={() => {
                  if (!active) return
                  patchTab(active.id, { conflict: false })
                  void doSave(active.id, 'manual', undefined, true)
                }}
                onChooseImageMode={() => setImageDialog({ open: true, pendingSave: false })}
              />
            }
          />
        )}

        <div className="main" style={{ zoom }}>
          <EditorPane onReady={bootEditor} />
          <FindBar
            open={findState.open}
            mode={findState.mode}
            getCtx={() => ctxRef.current}
            onClose={() => setFindState((state) => ({ ...state, open: false }))}
          />
        </div>
      </div>

      <ImageModeDialog
        open={imageDialog.open}
        onClose={() => setImageDialog({ open: false, pendingSave: false })}
        onConfirm={(mode) => {
          updateSettings({ imageMode: mode })
          const pending = imageDialog.pendingSave
          setImageDialog({ open: false, pendingSave: false })
          if (pending && activeId) void doSave(activeId, 'manual', mode)
        }}
      />

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        danger={confirmState.danger}
        onCancel={() => setConfirmState((c) => ({ ...c, open: false }))}
        onConfirm={confirmState.onConfirm}
      />

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <Toast />
      <ConvertingOverlay />
    </div>
  )
}
