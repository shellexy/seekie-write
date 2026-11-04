import type { EditorView } from '@milkdown/kit/prose/view'
import type { Transaction } from '@milkdown/kit/prose/state'
import type { Ctx } from '@milkdown/kit/ctx'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import { buildOutline, type OutlineItem } from '../lib/outline'
import { docText, selectionText } from '../lib/text'
import { countText, type CountResult } from '../lib/wordcount'

export interface EditorSnapshot {
  outline: OutlineItem[]
  total: CountResult
  selected: CountResult
  cursorPos: number
}

/**
 * 一个观察器管三件事：大纲、字数、选区字数。
 * 全部在 ProseMirror 的事务钩子里取，节流到 120ms，避免大文档卡输入。
 */
export class EditorSession {
  private view: EditorView | null = null
  private timer: number | null = null
  private lastDoc: PMNode | null = null
  private cachedOutline: OutlineItem[] = []
  private cachedTotal: CountResult = { words: 0, chars: 0, paragraphs: 0 }

  constructor(
    private ctx: Ctx,
    private onUpdate: (snapshot: EditorSnapshot) => void,
    private onDirty: () => void,
  ) {}

  attach(view: EditorView): void {
    this.view = view
    this.schedule(true)
  }

  private schedule(force = false): void {
    if (this.timer != null) window.clearTimeout(this.timer)
    this.timer = window.setTimeout(() => {
      this.timer = null
      this.compute(force)
    }, force ? 0 : 120)
  }

  private compute(force: boolean): void {
    const view = this.view
    if (!view) return
    const { doc, selection } = view.state

    if (force || !this.lastDoc || !this.lastDoc.eq(doc)) {
      this.cachedOutline = buildOutline(doc)
      this.cachedTotal = countText(docText(doc))
      this.lastDoc = doc
    }

    const selected = selection.empty
      ? { words: 0, chars: 0, paragraphs: 0 }
      : countText(selectionText(doc, selection.from, selection.to))

    this.onUpdate({
      outline: this.cachedOutline,
      total: this.cachedTotal,
      selected,
      cursorPos: selection.from,
    })
  }

  /** 由 EditorView 的 dispatch 代理调用 */
  handleTransaction(tr: Transaction): void {
    if (tr.docChanged) {
      this.onDirty()
      this.schedule()
    } else if (tr.selectionSet) {
      this.schedule()
    }
  }

  /** 切标签后强制重算 */
  refresh(docChanged = true): void {
    this.schedule(docChanged)
  }
}
