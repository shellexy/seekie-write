import type { Ctx } from '@milkdown/kit/ctx'
import { editorViewCtx } from '@milkdown/kit/core'
import { applyBlockType, clearFormat } from './topBarConfig'
import { insertHr, insertImageFromPicker, insertTable } from './insert'
import { redo, scrollToPos, selectRange, undo } from './tabs'

/**
 * 菜单 / 快捷键 / 标题栏按钮的统一命令入口。
 * 渲染层不直接摸 Ctx，全部经这里，避免上下文散落。
 */
export type EditorCommand =
  | 'edit:undo'
  | 'edit:redo'
  | 'format:paragraph'
  | 'format:h1'
  | 'format:h2'
  | 'format:h3'
  | 'format:clear'
  | 'insert:image'
  | 'insert:table'
  | 'insert:hr'

export function runEditorCommand(ctx: Ctx, command: string): boolean {
  const focusEditor = () => {
    try {
      ctx.get(editorViewCtx).focus()
    } catch {
      /* 编辑器尚未就绪 */
    }
  }
  let handled = true
  switch (command) {
    case 'edit:undo':
      undo(ctx)
      break
    case 'edit:redo':
      redo(ctx)
      break
    case 'format:paragraph':
      applyBlockType(ctx, null)
      break
    case 'format:h1':
      applyBlockType(ctx, 1)
      break
    case 'format:h2':
      applyBlockType(ctx, 2)
      break
    case 'format:h3':
      applyBlockType(ctx, 3)
      break
    case 'format:clear':
      clearFormat(ctx)
      break
    case 'insert:image':
      insertImageFromPicker(ctx)
      break
    case 'insert:table':
      insertTable(ctx)
      break
    case 'insert:hr':
      insertHr(ctx)
      break
    default:
      handled = false
  }
  if (handled) {
    // 原生菜单快捷键执行后焦点可能留在菜单/窗口上，主动还给编辑器
    window.requestAnimationFrame(focusEditor)
    window.setTimeout(focusEditor, 50)
    window.setTimeout(focusEditor, 150)
  }
  return handled
}

export { scrollToPos, selectRange }
