import type { Crepe, CrepeFeature } from '@milkdown/crepe'
import type { Ctx } from '@milkdown/kit/ctx'
import type { EditorState } from '@milkdown/kit/prose/state'
import { EditorState as PSState, TextSelection } from '@milkdown/kit/prose/state'
import type { Plugin } from '@milkdown/kit/prose/state'
import {
  commandsCtx,
  editorStateCtx,
  editorViewCtx,
  parserCtx,
  schemaCtx,
  serializerCtx,
} from '@milkdown/kit/core'
import type { EditorView } from '@milkdown/kit/prose/view'
import { undoCommand, redoCommand } from '@milkdown/kit/plugin/history'
import { searchPlugin } from './searchPlugin'

export interface TabRuntime {
  id: string
  state: EditorState
  scrollTop: number
}

/**
 * 多标签页核心：一个 ProseMirror view，N 份 EditorState。
 *
 * 为什么不是一个标签一个 Crepe 实例：
 *  - Crepe 实例 = 一整套 ProseMirror 插件 + 若干 Vue 挂载点，标签多了内存和重排都不划算
 *  - EditorState 自带 history（撤销栈），切换时 view.updateState 能完整还原
 *
 * prosemirror-view 的 updatePluginViews 只在 plugins 数组变化时才销毁重建插件视图；
 * 多份 state 共用同一 plugins 数组，所以 TopBar 的 Vue 实例不会在切标签时被销毁，
 * 只会收到 update() → 按钮激活态立即刷新。
 */
export class TabStore {
  private states = new Map<string, EditorState>()
  private scroll = new Map<string, number>()
  private activeId: string | null = null
  private view: EditorView | null = null
  /** 所有标签共用同一份插件数组，查找高亮插件也在其中 */
  private plugins: readonly Plugin[] | null = null

  constructor(private crepe: Crepe) {}

  private get ctx(): Ctx {
    return this.crepe.editor.ctx
  }

  /** Crepe 创建完成之后调用一次 */
  attach(): void {
    this.view = this.ctx.get(editorViewCtx)
  }

  get editorView(): EditorView {
    return this.ctx.get(editorViewCtx)
  }

  get active(): string | null {
    return this.activeId
  }

  /** 用 markdown 新建一个标签的 state */
  createStateFromMarkdown(markdown: string): EditorState {
    const schema = this.ctx.get(schemaCtx)
    const parser = this.ctx.get(parserCtx)
    const parsed = parser(markdown || '')
    // 空字符串解析出来是空 doc，而 schema 要求 block+，补一个空段落
    const doc = parsed.childCount > 0 ? parsed : (schema.topNodeType.createAndFill() ?? parsed)
    return PSState.create({
      schema,
      plugins: this.getPlugins(),
      doc,
    })
  }

  /**
   * 多份 state 必须共用同一个 plugins 数组：
   * prosemirror-view 只在数组引用变化时才销毁重建插件视图（TopBar 的 Vue 实例）。
   */
  private getPlugins(): readonly Plugin[] {
    if (!this.plugins) {
      this.plugins = [...this.ctx.get(editorStateCtx).plugins, searchPlugin]
    }
    return this.plugins
  }

  /** 空文档 */
  createEmptyState(): EditorState {
    return this.createStateFromMarkdown('')
  }

  register(tabId: string, state: EditorState): void {
    this.states.set(tabId, state)
  }

  has(tabId: string): boolean {
    return this.states.has(tabId)
  }

  /** 切走前把当前 state 与滚动位置存起来 */
  snapshotActive(): void {
    if (!this.activeId) return
    const view = this.ctx.get(editorViewCtx)
    this.states.set(this.activeId, view.state)
    this.scroll.set(this.activeId, this.scroller?.scrollTop ?? 0)
  }

  private get scroller(): HTMLElement | null {
    try {
      return (this.ctx.get(editorViewCtx).dom.closest('.editor-scroll') as HTMLElement) ?? null
    } catch {
      return null
    }
  }

  activate(tabId: string): void {
    const state = this.states.get(tabId)
    if (!state) return
    const view = this.ctx.get(editorViewCtx)
    if (this.activeId && this.activeId !== tabId) this.snapshotActive()
    view.updateState(state)
    this.activeId = tabId
    const top = this.scroll.get(tabId) ?? 0
    requestAnimationFrame(() => {
      const scroller = this.scroller
      if (scroller) scroller.scrollTop = top
    })
  }

  drop(tabId: string): void {
    this.states.delete(tabId)
    this.scroll.delete(tabId)
    if (this.activeId === tabId) this.activeId = null
  }

  /** 当前活动标签的 markdown（用于保存 / 自动保存） */
  currentMarkdown(): string {
    try {
      return this.crepe.getMarkdown()
    } catch {
      return ''
    }
  }

  /** 非活动标签的 markdown：直接序列化它自己保存的 EditorState */
  markdownOf(tabId: string): string {
    if (tabId === this.activeId) return this.currentMarkdown()
    const state = this.states.get(tabId)
    if (!state) return ''
    try {
      return this.ctx.get(serializerCtx)(state.doc)
    } catch {
      return ''
    }
  }

  /** 把当前视图里的内容存回标签（切标签前调用，保证撤销栈不丢） */
  syncActiveState(): void {
    this.snapshotActive()
  }

  getCtx(): Ctx {
    return this.ctx
  }
}

/* ------------------------------ 编辑器操作 ------------------------------ */

export function getView(ctx: Ctx) {
  return ctx.get(editorViewCtx)
}

/** 选中某个区间（大纲双击选章用） */
export function selectRange(ctx: Ctx, from: number, to: number): void {
  const view = ctx.get(editorViewCtx)
  const doc = view.state.doc
  const max = doc.content.size
  const safeFrom = Math.min(Math.max(from, 1), max)
  const safeTo = Math.min(Math.max(to, safeFrom), max)
  const tr = view.state.tr.setSelection(TextSelection.create(doc, safeFrom, safeTo))
  view.dispatch(tr)
  view.focus()
  // 用带顶部工具栏高度的偏移滚动，避免标题被 sticky TopBar 盖住
  scrollToPos(ctx, safeFrom)
}

export function scrollToPos(ctx: Ctx, pos: number): void {
  const view = ctx.get(editorViewCtx)
  const coords = view.coordsAtPos(Math.min(pos, view.state.doc.content.size))
  const scroller = view.dom.closest('.editor-scroll') as HTMLElement | null
  if (!scroller) return

  // TopBar 是 sticky 的，直接滚到容器顶部会让标题藏在它下面；
  // 注意 TopBar 不一定是 ProseMirror 的后代（它是 .milkdown 的子节点）
  const topbar =
    view.dom.closest('.milkdown')?.querySelector<HTMLElement>('.milkdown-top-bar') ??
    document.querySelector<HTMLElement>('.milkdown-top-bar')
  const inset = (topbar?.getBoundingClientRect().height ?? 0) + 16
  const scrollerRect = scroller.getBoundingClientRect()
  const delta = coords.top - scrollerRect.top
  scroller.scrollTo({
    top: Math.max(0, scroller.scrollTop + delta - inset),
    behavior: 'smooth',
  })
}

export function undo(ctx: Ctx): void {
  ctx.get(commandsCtx).call(undoCommand.key)
}

export function redo(ctx: Ctx): void {
  ctx.get(commandsCtx).call(redoCommand.key)
}

/** 用 markdown 替换当前文档内容（打开文件 / 另存后） */
export function replaceAll(ctx: Ctx, markdown: string): void {
  const view = ctx.get(editorViewCtx)
  const parser = ctx.get(parserCtx)
  const doc = parser(markdown || '')
  const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content)
  tr.setSelection(TextSelection.atStart(tr.doc))
  view.dispatch(tr)
}

export { undoCommand, redoCommand }
