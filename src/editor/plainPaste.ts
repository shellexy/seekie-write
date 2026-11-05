import type { Ctx } from '@milkdown/kit/ctx'
import { editorViewCtx, parserCtx } from '@milkdown/kit/core'
import { Slice } from '@milkdown/kit/prose/model'
import { api } from '../lib/api'

/**
 * 把剪贴板纯文本转成 Markdown 后插入。
 *
 * - 单行文本按原样内联插入，避免把行内粘贴变成新段落。
 * - 多行文本先经 @mdgate/text 转 Markdown（单换行硬化成硬换行）；
 *   只有一个段落时按行内内容插入，多段落 / 列表才按块插入。
 * - 代码块内直接插入原文。
 */
export async function insertClipboardPlainText(ctx: Ctx, text: string): Promise<void> {
  const raw = text.replace(/\r\n?/g, '\n')
  if (!raw) return
  const view = ctx.get(editorViewCtx)
  const { state } = view

  if (state.selection.$from.parent.type.name === 'code_block') {
    view.dispatch(state.tr.insertText(raw).scrollIntoView())
    view.focus()
    return
  }

  if (!raw.includes('\n')) {
    view.dispatch(state.tr.insertText(raw).scrollIntoView())
    view.focus()
    return
  }

  let markdown: string
  try {
    markdown = await api.text.toMarkdown(raw)
  } catch {
    view.dispatch(view.state.tr.insertText(raw).scrollIntoView())
    view.focus()
    return
  }

  const parser = ctx.get(parserCtx)
  const doc = parser(markdown)
  if (doc.childCount === 0) {
    view.dispatch(view.state.tr.insertText(raw).scrollIntoView())
    view.focus()
    return
  }

  if (doc.childCount === 1 && doc.firstChild?.type.name === 'paragraph') {
    view.dispatch(
      view.state.tr.replaceSelection(new Slice(doc.firstChild.content, 0, 0)).scrollIntoView(),
    )
  } else {
    view.dispatch(view.state.tr.replaceSelection(new Slice(doc.content, 0, 0)).scrollIntoView())
  }
  view.focus()
}
