import type { Ctx } from '@milkdown/kit/ctx'
import { commandsCtx, editorViewCtx, schemaCtx } from '@milkdown/kit/core'
import { insertTableCommand } from '@milkdown/kit/preset/gfm'
import { TextSelection } from '@milkdown/kit/prose/state'
import { getAssetTab, putAsset } from '../lib/assets'
import { useApp } from '../store/app'

/** 插入一张 3×3 表格（Crepe 的 Table 特性会自动接上表格交互） */
export function insertTable(ctx: Ctx): void {
  ctx.get(commandsCtx).call(insertTableCommand.key, { row: 3, col: 3 })
}

/** 在当前顶层块之后插入分割线（内建 insertHrCommand 在非空段落里会静默失败） */
export function insertHr(ctx: Ctx): void {
  const view = ctx.get(editorViewCtx)
  const schema = ctx.get(schemaCtx)
  const hrType = schema.nodes.hr
  const paragraphType = schema.nodes.paragraph
  if (!hrType || !paragraphType) return

  const { state } = view
  const { $from } = state.selection
  const pos = $from.depth >= 1 ? $from.after(1) : state.selection.to
  const hr = hrType.create()
  const paragraph = paragraphType.create()

  const tr = state.tr.insert(pos, hr).insert(pos + hr.nodeSize, paragraph)
  const caret = Math.min(pos + hr.nodeSize + 1, tr.doc.content.size)
  tr.setSelection(TextSelection.near(tr.doc.resolve(caret)))
  view.dispatch(tr.scrollIntoView())
}

/** 把一张已有 src 的图片作为 image-block 插到当前块之后 */
export function insertImageBlock(ctx: Ctx, src: string): void {
  const view = ctx.get(editorViewCtx)
  const schema = ctx.get(schemaCtx)
  const imageType = schema.nodes['image-block']
  const paragraphType = schema.nodes.paragraph
  if (!imageType || !paragraphType) return

  const { state } = view
  const { $from } = state.selection
  // 插到选区所在的顶层块之后：在列表 / 引用 / 表格里也不会产生非法嵌套
  const pos = $from.depth >= 1 ? $from.after(1) : state.selection.to
  const image = imageType.create({ src, caption: '', ratio: 1 })
  const paragraph = paragraphType.create()

  const tr = state.tr.insert(pos, image).insert(pos + image.nodeSize, paragraph)
  const caret = Math.min(pos + image.nodeSize + 1, tr.doc.content.size)
  tr.setSelection(TextSelection.near(tr.doc.resolve(caret)))
  view.dispatch(tr.scrollIntoView())
}

/** 工具栏 / 右键菜单的「插入图片」：选文件 → 进资源仓库 → 插入 image-block */
export function insertImageFromPicker(ctx: Ctx): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const tabId = useApp.getState().activeId ?? getAssetTab()
      const src = await putAsset(tabId, file)
      insertImageBlock(ctx, src)
    } catch (err) {
      console.error('[insert-image] 失败', err)
    } finally {
      input.remove()
    }
  }
  input.click()
}
