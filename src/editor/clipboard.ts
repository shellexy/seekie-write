import type { Ctx } from '@milkdown/kit/ctx'
import { editorViewCtx, serializerCtx } from '@milkdown/kit/core'
import { DOMSerializer } from '@milkdown/kit/prose/model'
import { api } from '../lib/api'

export type CopyFormat = 'markdown' | 'html'

/**
 * 把当前选区复制成 Markdown 或富文本（HTML + 纯文本）。
 * 纯文本格式由主进程直接用 context-menu 的 selectionText 处理。
 */
export async function copySelection(ctx: Ctx, format: CopyFormat): Promise<boolean> {
  const view = ctx.get(editorViewCtx)
  const { from, to, empty } = view.state.selection
  if (empty) return false

  const text = view.state.doc.textBetween(from, to, '\n', '\n')

  if (format === 'markdown') {
    let markdown = text
    try {
      // 用 doc.cut 包出一个 doc 节点，Milkdown 的 serializer 才能直接消费
      markdown = ctx.get(serializerCtx)(view.state.doc.cut(from, to))
    } catch {
      /* 序列化失败时退化为纯文本 */
    }
    return api.clipboard.write({ text: markdown })
  }

  const serializer = DOMSerializer.fromSchema(view.state.schema)
  const wrapper = document.createElement('div')
  wrapper.appendChild(serializer.serializeFragment(view.state.doc.slice(from, to).content))
  return api.clipboard.write({ text, html: wrapper.innerHTML })
}
