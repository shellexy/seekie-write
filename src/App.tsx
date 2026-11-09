import { useCallback, useEffect, useRef, useState } from 'react'
import { Crepe } from '@milkdown/crepe'
import type { Ctx } from '@milkdown/kit/ctx'
import { editorViewCtx } from '@milkdown/kit/core'
import type { ImageSaveMode, SaveKind } from '@shared/types'

import { api } from './lib/api'
import { useApp, type TabMeta } from './store/app'
import { applyThemeClass, createEditor } from './editor/createEditor'
import { applyCrepeTheme, applyEditorTypography } from './editor/theme'
import { TabStore, focusPos, scrollToPos, selectRange } from './editor/tabs'
import { EditorSession, type EditorSnapshot } from './editor/session'
import { runEditorCommand } from './editor/commandBus'
import { copySelection } from './editor/clipboard'
import { insertClipboardPlainText } from './editor/plainPaste'
import { createDocxImageResolver, prepareDocxMarkdown } from './lib/docxImages'
import { replaceGithubTocWithMarker } from './lib/toc'

interface ClosedTab {
  savePath: string | null
  sourcePath: string | null
  sourceExt: string | null
  title: string
  markdown: string
}
import { installTopBarTooltips, stopTopBarTooltips } from './editor/topBarConfig'
import { setAssetAddedHandler, setAssetTab } from './lib/assets'
import { saveTab } from './lib/files'
import { applyImageBase } from './lib/imageBase'
import { fileName, tabId as makeTabId } from './lib/titleFromPath'
import { activeOutlineId, type OutlineItem } from './lib/outline'
import { detectHeadings, type HeadingCandidate } from './lib/headingDetect'
import {
  buildPrintPreviewHtml,
  buildStandaloneHtml,
  exportViaDialog,
  inlineAssets,
} from './lib/exporters'

import { TitleBar } from './components/TitleBar'
import { Outline } from './components/Outline'
import { EditorPane } from './components/EditorPane'
import { SidebarFooter } from './components/SidebarFooter'
import { FindBar, type FindBarHandle, type FindMode } from './components/FindBar'
import { SettingsDialog } from './components/SettingsDialog'
import { TopBarMenu } from './components/TopBarMenu'
import { SourceCodeDialog } from './components/SourceCodeDialog'
import { AboutDialog } from './components/AboutDialog'
import { ChineseConvertDialog } from './components/ChineseConvertDialog'
import { TocInsertDialog, type TocMode } from './components/TocInsertDialog'
import { IconMore } from './components/Icons'
import { SmartHeadingsDialog } from './components/SmartHeadingsDialog'
import { Toast, ConvertingOverlay, CloseTabsDialog, ImageModeDialog } from './components/Overlays'

const BLANK_DOC = ''

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
  const wordCount = useApp((s) => s.wordCount)

  const crepeRef = useRef<Crepe | null>(null)
  const tabStoreRef = useRef<TabStore | null>(null)
  const sessionRef = useRef<EditorSession | null>(null)
  const ctxRef = useRef<Ctx | null>(null)
  const bootedRef = useRef(false)
  const autosaveTimers = useRef<Map<string, number>>(new Map())
  /** 同一标签同时只允许一个保存请求，避免自己写的文件被下一次保存误判成外部修改 */
  const inFlightSaves = useRef<Set<string>>(new Set())
  const pendingSaves = useRef<Map<string, SaveKind>>(new Map())
  /** 每个标签最近一次打开/保存时的 Markdown；内容回到基线就不算 dirty */
  const savedMarkdown = useRef<Map<string, string>>(new Map())
  /** 转换文档刚打开时的 Markdown；用来区分“未编辑”和“已编辑但草稿已自动保存” */
  const convertedBaseline = useRef<Map<string, string>>(new Map())
  /** 停止输入后延迟比对一次 Markdown，撤销回原内容时能及时清掉 dirty */
  const contentCheckTimers = useRef<Map<string, number>>(new Map())
  /** 正在打开的绝对路径，避免双击 / 二次实例并发打开出两个标签 */
  const openingPaths = useRef<Set<string>>(new Set())
  /** 切换 view state 期间插件可能 dispatch，不能把这种事务当成用户编辑 */
  const switchingTab = useRef(false)
  const untitledSeq = useRef(0)

  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [cursorPos, setCursorPos] = useState(0)
  const [imageDialog, setImageDialog] = useState({ open: false, pendingSave: false })
  const [findState, setFindState] = useState<{ open: boolean; mode: FindMode }>({
    open: false,
    mode: 'find',
  })
  const findBarRef = useRef<FindBarHandle>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [chineseOpen, setChineseOpen] = useState(false)
  const [tocInsertOpen, setTocInsertOpen] = useState(false)
  const [sourceText, setSourceText] = useState('')
  const [aboutOpen, setAboutOpen] = useState(false)
  const [smartHeadings, setSmartHeadings] = useState<{
    open: boolean
    candidates: HeadingCandidate[]
  }>({ open: false, candidates: [] })
  const [draggingSidebarWidth, setDraggingSidebarWidth] = useState<number | null>(null)
  const [closeRequest, setCloseRequest] = useState<{ ids: string[]; count: number } | null>(null)
  const [closingSaving, setClosingSaving] = useState(false)
  const [closedTabs, setClosedTabs] = useState<ClosedTab[]>([])

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

  const clearContentCheck = useCallback((id: string) => {
    const timer = contentCheckTimers.current.get(id)
    if (timer != null) {
      window.clearTimeout(timer)
      contentCheckTimers.current.delete(id)
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
    ): Promise<boolean> => {
      const store = tabStoreRef.current
      const tab = tabById(id)
      if (!store || !tab) return false
      flushTimer(id)

      if (inFlightSaves.current.has(id)) {
        // 保存进行中：记下更高优先级的请求，结束后再补一次
        const queued = pendingSaves.current.get(id)
        if (!queued || SAVE_RANK[kind] > SAVE_RANK[queued]) pendingSaves.current.set(id, kind)
        return false
      }
      inFlightSaves.current.add(id)
      let ok = false

      try {
        const markdown = store.markdownOf(id)
        const baseline = savedMarkdown.current.get(id)

        // 内容与上次保存完全一致：不写盘、不更新 mtime，清掉误报的 dirty
        if (
          kind !== 'saveAs' &&
          !overwrite &&
          baseline !== undefined &&
          markdown === baseline &&
          (tab.savePath || kind === 'auto')
        ) {
          clearContentCheck(id)
          pendingSaves.current.delete(id)
          patchTab(id, { dirty: false, saveStatus: 'idle', saveMessage: undefined })
          return true
        }

        // 没有落盘路径（新建 / 转换后未另存）时，自动保存只写草稿区，
        // 绝不弹“另存为”对话框打断输入。
        if (!tab.savePath && kind === 'auto') {
          await saveDraftIfNeeded(id)
          savedMarkdown.current.set(id, markdown)
          clearContentCheck(id)
          patchTab(id, {
            dirty: pendingSaves.current.has(id),
            saveStatus: 'idle',
            saveMessage: undefined,
          })
          return true
        }

        patchTab(id, { saveStatus: 'saving' })
        const result = await saveTab({
          tabId: id,
          savePath: kind === 'saveAs' ? null : tab.savePath,
          markdown,
          imageMode: forceMode ?? useApp.getState().settings.imageMode,
          assets: tab.assets,
          suggestedName:
            tab.converted && tab.sourcePath ? `${fileName(tab.sourcePath)}.md` : `${tab.title}.md`,
          sourcePath: tab.sourcePath,
          converted: tab.converted,
          kind,
          mtime: tab.mtime,
          overwrite,
        })

        if (result.status === 'saved' && result.path) {
          const savedPath = result.path
          ok = true
          savedMarkdown.current.set(id, markdown)
          clearContentCheck(id)
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
          if (useApp.getState().activeId === id) applyImageBase(result.path)
          void api.asset.drop(id)
          convertedBaseline.current.delete(id)
          // 转换文档保存为 Markdown 后，把最近文件里对应的源文件原地替换成 .md，
          // 不改变其它条目的顺序，也不让普通自动保存频繁重排最近文件。
          if (tab.converted && tab.sourcePath && savedPath !== tab.sourcePath) {
            const previous = useApp.getState().settings.recentFiles ?? []
            const index = previous.indexOf(tab.sourcePath)
            let next: string[]
            if (index >= 0) {
              next = previous.map((item, i) => (i === index ? savedPath : item))
            } else {
              next = [savedPath, ...previous]
            }
            next = next
              .filter((item, i) => item !== savedPath || i === next.indexOf(savedPath))
              .slice(0, 12)
            if (next.some((item, i) => item !== previous[i]) || next.length !== previous.length) {
              useApp.getState().updateSettings({ recentFiles: next })
            }
          }
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
        return ok
      } finally {
        inFlightSaves.current.delete(id)
        const queued = pendingSaves.current.get(id)
        if (queued) {
          pendingSaves.current.delete(id)
          window.setTimeout(() => void doSave(id, queued), 150)
        }
      }
    },
    [clearContentCheck, flushTimer, notify, patchTab, saveDraftIfNeeded],
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

  const scheduleContentCheck = useCallback(
    (id: string) => {
      clearContentCheck(id)
      const timer = window.setTimeout(() => {
        contentCheckTimers.current.delete(id)
        if (inFlightSaves.current.has(id)) return
        const store = tabStoreRef.current
        if (!store) return
        const baseline = savedMarkdown.current.get(id)
        if (baseline === undefined) return
        // 用序列化后的 Markdown 比较：ProseMirror 的 Node.eq 会把结构相同但
        // 文本相同、节点属性略有差异的 doc 判成“改了”。
        if (store.markdownOf(id) === baseline) {
          flushTimer(id)
          const tab = useApp.getState().tabs.find((item) => item.id === id)
          if (tab?.dirty) patchTab(id, { dirty: false })
        }
      }, 250)
      contentCheckTimers.current.set(id, timer)
    },
    [clearContentCheck, flushTimer, patchTab],
  )

  const markDirty = useCallback(() => {
    if (switchingTab.current) return
    const id = useApp.getState().activeId
    const tab = tabById(id)
    if (!id || !tab) return
    if (!tab.dirty) patchTab(id, { dirty: true })
    scheduleAutosave(id)
    scheduleContentCheck(id)
  }, [patchTab, scheduleAutosave, scheduleContentCheck])

  const saveActive = useCallback(
    (kind: 'manual' | 'saveAs' = 'manual') => {
      const id = useApp.getState().activeId
      if (!id) return
      void doSave(id, kind)
    },
    [doSave],
  )

  /* ----------------------------- 导出 / 打印 ----------------------------- */

  const activeExport = useCallback(() => {
    const state = useApp.getState()
    const id = state.activeId
    if (!id) return null
    const tab = state.tabs.find((item) => item.id === id)
    const store = tabStoreRef.current
    if (!tab || !store) return null
    const markdown = store.markdownOf(id)
    const baseName = (tab.savePath ? fileName(tab.savePath) : tab.title).replace(
      /\.(md|markdown|txt)$/i,
      '',
    )
    return { tab, baseName, markdown }
  }, [])

  const exportDocument = useCallback(
    async (kind: 'md' | 'html' | 'docx') => {
      const data = activeExport()
      if (!data) {
        notify('没有可导出的文档')
        return
      }
      try {
        const inlined = inlineAssets(data.markdown, data.tab.assets)
        if (inlined.missing > 0) notify(`有 ${inlined.missing} 张图片不在资源仓库里，已保留原占位`)

        if (kind === 'md') {
          const saved = await exportViaDialog({
            fileName: `${data.baseName}.md`,
            content: inlined.markdown,
            extensions: ['md'],
          })
          if (saved) notify(`已导出 ${fileName(saved)}`)
          return
        }

        if (kind === 'html') {
          const saved = await exportViaDialog({
            fileName: `${data.baseName}.html`,
            content: buildStandaloneHtml(data.baseName, inlined.markdown),
            extensions: ['html'],
          })
          if (saved) notify(`已导出 ${fileName(saved)}`)
          return
        }

        // docx：在渲染进程里转，浏览器环境会读取 data:image 图片
        const { convertMarkdownToDocx } = await import('@mohtasham/md-to-docx')
        const resolveDocxImage = createDocxImageResolver()
        const docxMarkdown = await prepareDocxMarkdown(
          replaceGithubTocWithMarker(inlined.markdown),
          resolveDocxImage,
        )
        const blob = await convertMarkdownToDocx(docxMarkdown, {
          codeHighlighting: {
            enabled: true,
            showLanguageLabel: true,
            languages: [
              'typescript',
              'javascript',
              'python',
              'bash',
              'json',
              'css',
              'html',
              'markdown',
              'java',
              'c',
              'cpp',
              'rust',
              'go',
              'sql',
              'yaml',
            ],
          },
          imageHandling: {
            maxImageBytes: 20 * 1024 * 1024,
            resolve: async (source: string) =>
              source.startsWith('data:') ? undefined : ((await resolveDocxImage(source)) ?? undefined),
          },
        })
        const saved = await exportViaDialog({
          fileName: `${data.baseName}.docx`,
          data: new Uint8Array(await blob.arrayBuffer()),
          extensions: ['docx'],
        })
        if (saved) notify(`已导出 ${fileName(saved)}`)
      } catch (err) {
        notify(`导出失败：${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [activeExport, notify],
  )

  const exportPdfActive = useCallback(async () => {
    const data = activeExport()
    if (!data) return
    try {
      const saved = await api.print.toPdf(`${data.baseName}.pdf`)
      if (saved) notify(`已导出 ${fileName(saved)}`)
    } catch (err) {
      notify(`导出 PDF 失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }, [activeExport, notify])

  const printActive = useCallback(async () => {
    try {
      await api.print.now()
    } catch (err) {
      notify(`打印失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }, [notify])

  const printPreviewActive = useCallback(async () => {
    const data = activeExport()
    if (!data) return
    try {
      const inlined = inlineAssets(data.markdown, data.tab.assets)
      await api.print.preview(
        data.baseName,
        buildPrintPreviewHtml(data.baseName, inlined.markdown),
      )
    } catch (err) {
      notify(`打印预览失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }, [activeExport, notify])

  const openSource = useCallback(() => {
    const state = useApp.getState()
    setSourceText(state.activeId ? (tabStoreRef.current?.markdownOf(state.activeId) ?? '') : '')
    setSourceOpen(true)
  }, [])

  /* ----------------------------- 编辑器启动 ----------------------------- */

  const restoreSession = useCallback(async () => {
    const store = tabStoreRef.current
    if (!store) return
    const session = await api.draft.loadSession()
    // 草稿始终恢复；“重开上次的文件”由设置控制，默认关闭
    const restoreFiles = useApp.getState().settings.restoreLastFiles

    let restoredFiles = false

    // 先重开上次有落盘路径的文件；已删除的跳过
    if (restoreFiles) {
      for (const open of session.openTabs ?? []) {
        if (!open.savePath) continue
        if ((await api.file.mtime(open.savePath)) == null) continue
        await openPathRef.current?.(open.savePath)
        restoredFiles = true
      }
    }

    let restoredDrafts = false
    for (const draft of session.tabs) {
      if (store.has(draft.tabId)) continue
      const state = store.createStateFromMarkdown(draft.markdown)
      store.register(draft.tabId, state)
      savedMarkdown.current.set(draft.tabId, store.markdownOf(draft.tabId))
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
      restoredDrafts = true
    }

    if (restoreFiles && session.activeSavePath) {
      const target = useApp
        .getState()
        .tabs.find((tab) => tab.savePath === session.activeSavePath)
      if (target) activateRef.current?.(target.id)
    } else if (session.activeTabId && store.has(session.activeTabId)) {
      activateRef.current?.(session.activeTabId)
    }

    if (!restoredFiles && !restoredDrafts) {
      if (useApp.getState().tabs.length === 0) newTabRef.current?.()
      return
    }
    notify(restoredFiles ? '已恢复上次打开的文件' : '已恢复上次的草稿')
  }, [notify])

  const saveOpenTabsSnapshot = useCallback(async () => {
    const state = useApp.getState()
    const openTabs = state.tabs
      .filter((tab) => !!tab.savePath)
      .map((tab) => ({
        savePath: tab.savePath as string,
        sourcePath: tab.sourcePath,
        sourceExt: tab.sourceExt,
        title: tab.title,
      }))
    const active = state.tabs.find((tab) => tab.id === state.activeId)
    await api.session.saveOpenTabs(openTabs, active?.savePath ?? null)
  }, [])

  const newTab = useCallback(() => {
    const store = tabStoreRef.current
    if (!store) return
    const id = makeTabId()
    untitledSeq.current += 1
    const state = store.createStateFromMarkdown(BLANK_DOC)
    store.register(id, state)
    savedMarkdown.current.set(id, store.markdownOf(id))
    useApp.getState().upsertTab({
      id,
      title: `新文档-${untitledSeq.current}`,
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

        // 纯文本粘贴：转成 Markdown 再插入，避免单换行被折叠；
        // 带 HTML 的富文本粘贴保持 Milkdown 默认行为。
        const onPaste = (event: ClipboardEvent) => {
          const data = event.clipboardData
          if (!data || event.defaultPrevented) return
          if (data.getData('text/html')) return
          const text = data.getData('text/plain')
          if (!text) return
          if (view.state.selection.$from.parent.type.name === 'code_block') return
          event.preventDefault()
          event.stopPropagation()
          void insertClipboardPlainText(ctx, text)
        }
        root.addEventListener('paste', onPaste, true)

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
    (id: string, force = false) => {
      const store = tabStoreRef.current
      if (!store || !store.has(id)) return
      const focusEditor = () => {
        const ctx = ctxRef.current
        if (!ctx) return
        try {
          ctx.get(editorViewCtx).focus()
        } catch {
          /* 编辑器还没准备好 */
        }
      }
      if (!force && useApp.getState().activeId === id) {
        // 重复点击当前标签 / 重复打开同一文件时也把焦点放回正文
        requestAnimationFrame(focusEditor)
        return
      }
      const tab = useApp.getState().tabs.find((item) => item.id === id)
      // 相对图片按当前文件目录解析；必须在 view 切到该标签之前设置 base
      applyImageBase(tab ? (tab.savePath ?? tab.sourcePath) : null)
      switchingTab.current = true
      try {
        store.activate(id)
        useApp.getState().setActive(id)
      } finally {
        switchingTab.current = false
      }
      setAssetTab(id)
      sessionRef.current?.refresh(true)
      // 新建 / 切换 / 打开标签后自动把焦点放回编辑区
      requestAnimationFrame(focusEditor)
    },
    [],
  )
  activateRef.current = activate
  newTabRef.current = newTab

  // Ctrl+Tab / Ctrl+Shift+Tab 在标签间循环
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.key !== 'Tab') return
      e.preventDefault()
      const state = useApp.getState()
      const list = state.tabs
      if (list.length < 2) return
      const index = list.findIndex((tab) => tab.id === state.activeId)
      const next = (index + (e.shiftKey ? -1 : 1) + list.length) % list.length
      activate(list[next].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activate])

  const rememberClosed = useCallback((tab: TabMeta) => {
    const store = tabStoreRef.current
    const markdown = tab.savePath ? '' : (store?.markdownOf(tab.id) ?? '')
    if (!tab.savePath && !markdown.trim()) return
    setClosedTabs((prev) =>
      [
        {
          savePath: tab.savePath,
          sourcePath: tab.sourcePath,
          sourceExt: tab.sourceExt,
          title: tab.title,
          markdown,
        },
        ...prev,
      ].slice(0, 20),
    )
  }, [])

  const needsClosePrompt = useCallback((tab: TabMeta) => {
    if (tab.dirty) return true
    if (tab.savePath) return false
    const markdown = tabStoreRef.current?.markdownOf(tab.id) ?? ''
    if (tab.converted) {
      // 转换文档刚打开、没手动编辑时关闭不需要提示；有编辑而草稿自动保存过，
      // dirty 可能已经清掉，所以和“刚打开时的 Markdown”比较。
      const baseline = convertedBaseline.current.get(tab.id)
      return baseline === undefined ? Boolean(markdown.trim()) : markdown !== baseline
    }
    // 普通无路径草稿即使自动保存过草稿，也没有真正落盘，关闭前仍然询问
    return Boolean(markdown.trim())
  }, [])

  const closeNow = useCallback(
    (ids: string[]) => {
      const targets = useApp.getState().tabs.filter((tab) => ids.includes(tab.id))
      if (!targets.length) return
      for (const tab of targets) {
        rememberClosed(tab)
        flushTimer(tab.id)
        pendingSaves.current.delete(tab.id)
        tabStoreRef.current?.drop(tab.id)
        savedMarkdown.current.delete(tab.id)
        convertedBaseline.current.delete(tab.id)
        clearContentCheck(tab.id)
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
    },
    [activate, clearContentCheck, flushTimer, newTab, rememberClosed],
  )

  const requestClose = useCallback(
    (ids: string[]) => {
      const targets = useApp.getState().tabs.filter((tab) => ids.includes(tab.id))
      if (!targets.length) return
      const promptCount = targets.filter((tab) => needsClosePrompt(tab)).length
      if (promptCount > 0) {
        setCloseRequest({ ids: targets.map((tab) => tab.id), count: promptCount })
        return
      }
      closeNow(targets.map((tab) => tab.id))
    },
    [closeNow, needsClosePrompt],
  )

  const closeTab = useCallback((id: string) => requestClose([id]), [requestClose])
  const closeManyTabs = useCallback((ids: string[]) => requestClose(ids), [requestClose])

  const saveAndClose = useCallback(async () => {
    const request = closeRequest
    if (!request) return
    setClosingSaving(true)
    try {
      for (const id of request.ids) {
        const tab = useApp.getState().tabs.find((item) => item.id === id)
        if (!tab || !needsClosePrompt(tab)) continue
        const saved = tab.savePath ? await doSave(id, 'manual') : await doSave(id, 'saveAs')
        if (!saved) {
          setCloseRequest(null)
          return
        }
      }
      setCloseRequest(null)
      closeNow(request.ids)
    } catch (err) {
      notify(`保存失败：${(err as Error).message}`, 'error')
      setCloseRequest(null)
    } finally {
      setClosingSaving(false)
    }
  }, [closeNow, closeRequest, doSave, needsClosePrompt, notify])

  const discardAndClose = useCallback(() => {
    if (!closeRequest) return
    const ids = closeRequest.ids
    setCloseRequest(null)
    closeNow(ids)
  }, [closeNow, closeRequest])

  const reopenClosedTab = useCallback(async () => {
    if (!closedTabs.length) return
    const [entry, ...rest] = closedTabs
    setClosedTabs(rest)

    if (entry.savePath) {
      const mtime = await api.file.mtime(entry.savePath)
      if (mtime != null) {
        await openPathRef.current?.(entry.savePath)
        return
      }
    }

    if (entry.markdown.trim()) {
      const store = tabStoreRef.current
      if (!store) return
      const id = makeTabId()
      const state = store.createStateFromMarkdown(entry.markdown)
      store.register(id, state)
      savedMarkdown.current.set(id, store.markdownOf(id))
      useApp.getState().upsertTab({
        id,
        title: entry.title,
        dirty: false,
        sourcePath: entry.sourcePath,
        sourceExt: entry.sourceExt,
        savePath: null,
        converted: Boolean(entry.sourceExt && entry.sourceExt !== '.md'),
        draft: true,
        saveStatus: 'idle',
        conflict: false,
        assets: [],
        mtime: null,
        scrollTop: 0,
      })
      activate(id)
      return
    }

    notify(entry.savePath ? '原文件已不存在，无法重新打开' : '没有可恢复的内容', 'error')
  }, [activate, closedTabs, notify])

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
      if (!store || !path) return
      const absolute = await api.file.resolve(path)
      const already = useApp
        .getState()
        .tabs.find((tab) => tab.savePath === absolute || tab.sourcePath === absolute)
      if (already) {
        activate(already.id)
        return
      }
      if (openingPaths.current.has(absolute)) return
      openingPaths.current.add(absolute)
      const id = makeTabId()
      setConverting(true, `正在打开 ${fileName(absolute)}…`)
      try {
        const result = await api.file.read(absolute, id)
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
          savedMarkdown.current.delete(blankId)
          convertedBaseline.current.delete(blankId)
          clearContentCheck(blankId)
          useApp.getState().removeTab(blankId)
          void api.asset.drop(blankId)
          void api.draft.drop(blankId)
        }
        const state = store.createStateFromMarkdown(result.markdown)
        store.register(id, state)
        savedMarkdown.current.set(id, store.markdownOf(id))
        if (result.converted) convertedBaseline.current.set(id, store.markdownOf(id))
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
        const openedPath = result.sourcePath ?? path
        if (openedPath) {
          const previous = useApp.getState().settings.recentFiles ?? []
          const next = [openedPath, ...previous.filter((item) => item !== openedPath)].slice(0, 12)
          if (next[0] !== previous[0] || next.length !== previous.length) {
            useApp.getState().updateSettings({ recentFiles: next })
          }
        }
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
        openingPaths.current.delete(absolute)
        setConverting(false)
      }
    },
    [activate, clearContentCheck, flushTimer, notify, setConverting],
  )
  openPathRef.current = openPath

  /** 冲突提示里的“重新载入”：读回同一个文件，替换当前标签而不是再开一个 */
  const reloadTab = useCallback(
    async (id: string) => {
      const store = tabStoreRef.current
      const tab = useApp.getState().tabs.find((item) => item.id === id)
      if (!store || !tab) return
      const path = tab.savePath ?? tab.sourcePath
      if (!path) {
        notify('这个标签还没有落盘文件，无法重新载入', 'error')
        return
      }
      if (inFlightSaves.current.has(id)) {
        notify('正在保存，请稍后再重新载入', 'error')
        return
      }
      flushTimer(id)
      clearContentCheck(id)
      pendingSaves.current.delete(id)
      setConverting(true, `正在重新载入 ${fileName(path)}…`)
      try {
        const result = await api.file.read(path, id)
        if (!result.ok) {
          notify(result.error ?? '重新载入失败', 'error')
          return
        }
        const state = store.createStateFromMarkdown(result.markdown)
        store.register(id, state)
        savedMarkdown.current.set(id, store.markdownOf(id))
        if (result.converted) convertedBaseline.current.set(id, store.markdownOf(id))
        else convertedBaseline.current.delete(id)
        patchTab(id, {
          title: result.title,
          dirty: false,
          sourcePath: result.sourcePath,
          sourceExt: result.sourceExt,
          savePath: result.converted ? null : result.sourcePath,
          converted: result.converted,
          draft: result.converted,
          saveStatus: 'idle',
          saveMessage: undefined,
          conflict: false,
          assets: result.assets,
          mtime: result.sourcePath ? await api.file.mtime(result.sourcePath) : null,
        })
        void api.asset.drop(id)
        if (result.assets.length) await api.asset.register(id, result.assets)
        activate(id, true)
        notify('已重新载入')
      } finally {
        setConverting(false)
      }
    },
    [activate, clearContentCheck, flushTimer, notify, patchTab, setConverting],
  )

  const openSmartHeadings = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    const view = ctx.get(editorViewCtx)
    setSmartHeadings({ open: true, candidates: detectHeadings(view.state.doc) })
  }, [])

  const applySmartHeadings = useCallback(
    (items: Array<{ pos: number; level: number }>) => {
      const ctx = ctxRef.current
      const view = ctx?.get(editorViewCtx)
      if (!view) return
      const { state } = view
      const headingType = state.schema.nodes.heading
      const paragraphType = state.schema.nodes.paragraph
      if (!headingType || !paragraphType) return
      const tr = state.tr
      let applied = 0
      // 倒序替换，避免前面节点的替换让后面的 pos 偏移
      for (const item of [...items].sort((a, b) => b.pos - a.pos)) {
        if (item.level < 1 || item.level > 6) continue
        const node = tr.doc.nodeAt(item.pos)
        if (!node) continue
        const isParagraph = node.type === paragraphType
        const isHeading = node.type === headingType
        if (!isParagraph && !isHeading) continue
        const currentLevel = isHeading ? Number(node.attrs.level) : 0
        // 已有标题级别没变：保持原节点，不制造一次无意义的历史记录
        if (currentLevel === item.level) continue
        // 用 node.content 保留加粗 / 行内代码等 mark，不用纯文本重建
        tr.replaceWith(
          item.pos,
          item.pos + node.nodeSize,
          headingType.create({ level: item.level }, node.content, node.marks),
        )
        applied += 1
      }
      setSmartHeadings({ open: false, candidates: [] })
      if (applied === 0) {
        notify('没有需要修改的标题')
        return
      }
      // 所有替换在同一个事务里，Ctrl+Z 一次撤销
      view.dispatch(tr)
      notify(`已应用 ${applied} 个标题，可按 Ctrl+Z 撤销`)
      // 对话框关闭后把焦点还给编辑器，否则 Ctrl+Z 到不了 ProseMirror
      requestAnimationFrame(() => view.focus())
    },
    [notify],
  )

  // 右键菜单「粘贴为纯文本」：主进程把剪贴板文本发过来
  useEffect(() => {
    return api.clipboard.onPastePlain((text) => {
      const ctx = ctxRef.current
      if (ctx && text) void insertClipboardPlainText(ctx, text)
    })
  }, [])

  // F3 / Shift+F3：搜索下一个 / 上一个；面板未打开时先打开查找
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F3') return
      e.preventDefault()
      if (!findState.open) {
        setFindState({ open: true, mode: 'find' })
        return
      }
      findBarRef.current?.navigate(e.shiftKey ? -1 : 1)
      findBarRef.current?.focus()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [findState.open])

  const insertToc = useCallback(
    (mode: TocMode) => {
      const ctx = ctxRef.current
      if (!ctx) return
      const view = ctx.get(editorViewCtx)
      const type = view.state.schema.nodes.seekieToc
      if (!type) {
        notify('目录节点尚未就绪', 'error')
        return
      }
      const { state } = view
      const $from = state.selection.$from
      let pos = $from.depth > 0 ? $from.after(1) : $from.pos
      pos = Math.min(Math.max(pos, 0), state.doc.content.size)
      view.dispatch(state.tr.insert(pos, type.create({ mode })).scrollIntoView())
      view.focus()
      setTocInsertOpen(false)
    },
    [notify],
  )

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
        case 'insert:toc':
          setTocInsertOpen(true)
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
      await saveOpenTabsSnapshot()
      const state = useApp.getState()
      for (const tab of state.tabs) {
        if (!tab.savePath && tab.dirty) await saveDraftIfNeeded(tab.id)
      }
    })
  }, [saveDraftIfNeeded, saveOpenTabsSnapshot])

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
          onOpenPath: (path: string) => void openPath(path),
          onSave: () => saveActive('manual'),
          onSaveAs: () => saveActive('saveAs'),
          onExportMarkdown: () => void exportDocument('md'),
          onExportHtml: () => void exportDocument('html'),
          onExportDocx: () => void exportDocument('docx'),
          onExportPdf: () => void exportPdfActive(),
          onPrint: () => void printActive(),
          onPrintPreview: () => void printPreviewActive(),
          onActivateTab: activate,
          onCloseTab: closeTab,
          onCloseOtherTabs: closeOtherTabs,
          onCloseRightTabs: closeRightTabs,
          canReopenClosed: closedTabs.length > 0,
          onReopenClosed: () => void reopenClosedTab(),
        }}
      />

      <div className={`body${sidebarVisible ? ' with-sidebar' : ''}`}>
        {sidebarVisible && (
          <Outline
            items={outline}
            activeId={outlineActive}
            onScrollTo={(item) => {
              const ctx = ctxRef.current
              if (ctx) focusPos(ctx, item.pos)
            }}
            onSelectSection={(item) => {
              const ctx = ctxRef.current
              if (ctx) selectRange(ctx, item.pos, item.end)
            }}
            onResizeStart={startSidebarResize}
            onResizeReset={resetSidebarWidth}
            onSmartHeadings={openSmartHeadings}
            canDetect={wordCount > 0}
            footer={
              <SidebarFooter
                onReload={() => {
                  if (active) void reloadTab(active.id)
                }}
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
          <button
            className="editor-more"
            onClick={() => setMoreOpen((open) => !open)}
            title="更多（查找 / 替换 / 源码 / 设置 / 关于）"
            aria-label="更多"
            aria-expanded={moreOpen}
          >
            <IconMore />
          </button>
          <FindBar
            ref={findBarRef}
            open={findState.open}
            mode={findState.mode}
            getCtx={() => ctxRef.current}
            onClose={() => setFindState((state) => ({ ...state, open: false }))}
            onWrap={(direction) =>
              notify(direction === 'next' ? '已回到开头继续搜索' : '已到末尾，继续搜索上一个')
            }
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

      <CloseTabsDialog
        open={closeRequest !== null}
        count={closeRequest?.count ?? 0}
        saving={closingSaving}
        onSave={() => void saveAndClose()}
        onDiscard={discardAndClose}
        onCancel={() => setCloseRequest(null)}
      />

      <TopBarMenu
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onUndo={() => {
          const ctx = ctxRef.current
          if (ctx) runEditorCommand(ctx, 'edit:undo')
        }}
        onRedo={() => {
          const ctx = ctxRef.current
          if (ctx) runEditorCommand(ctx, 'edit:redo')
        }}
        onFind={() => setFindState({ open: true, mode: 'find' })}
        onReplace={() => setFindState({ open: true, mode: 'replace' })}
        onSource={openSource}
        onChinese={() => setChineseOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onAbout={() => setAboutOpen(true)}
      />

      <TocInsertDialog
        open={tocInsertOpen}
        onInsert={insertToc}
        onCancel={() => setTocInsertOpen(false)}
      />

      <ChineseConvertDialog
        open={chineseOpen}
        getCtx={() => ctxRef.current}
        onClose={() => setChineseOpen(false)}
        notify={notify}
      />

      <SourceCodeDialog
        open={sourceOpen}
        markdownText={sourceText}
        documentTitle={active?.title ?? ''}
        onClose={() => setSourceOpen(false)}
      />

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />

      <SmartHeadingsDialog
        open={smartHeadings.open}
        candidates={smartHeadings.candidates}
        onClose={() => setSmartHeadings({ open: false, candidates: [] })}
        onApply={applySmartHeadings}
      />

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <Toast />
      <ConvertingOverlay />
    </div>
  )
}
