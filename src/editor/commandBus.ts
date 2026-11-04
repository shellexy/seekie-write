import type { Ctx } from '@milkdown/kit/ctx'
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
  switch (command) {
    case 'edit:undo':
      undo(ctx)
      return true
    case 'edit:redo':
      redo(ctx)
      return true
    case 'format:paragraph':
      applyBlockType(ctx, null)
      return true
    case 'format:h1':
      applyBlockType(ctx, 1)
      return true
    case 'format:h2':
      applyBlockType(ctx, 2)
      return true
    case 'format:h3':
      applyBlockType(ctx, 3)
      return true
    case 'format:clear':
      clearFormat(ctx)
      return true
    case 'insert:image':
      insertImageFromPicker(ctx)
      return true
    case 'insert:table':
      insertTable(ctx)
      return true
    case 'insert:hr':
      insertHr(ctx)
      return true
    default:
      return false
  }
}

export { scrollToPos, selectRange }
