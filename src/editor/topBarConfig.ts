import {
  Crepe,
  CrepeFeature,
  useCrepeFeatures,
} from '@milkdown/crepe'
import type { TopBarFeatureConfig } from '@milkdown/crepe/feature/top-bar'
import { commandsCtx, editorViewCtx, editorCtx, EditorStatus } from '@milkdown/kit/core'
import {
  blockquoteSchema,
  bulletListSchema,
  codeBlockSchema,
  emphasisSchema,
  headingSchema,
  inlineCodeSchema,
  listItemSchema,
  orderedListSchema,
  paragraphSchema,
  setBlockTypeCommand,
  strongSchema,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  wrapInBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark'
import {
  toggleStrikethroughCommand,
  strikethroughSchema,
  tableSchema,
} from '@milkdown/kit/preset/gfm'
import { lift, setBlockType } from '@milkdown/kit/prose/commands'
import { liftListItem } from '@milkdown/kit/prose/schema-list'
import { findParentNode } from '@milkdown/kit/prose'
import type { Ctx } from '@milkdown/kit/ctx'
import {
  BOLD_ICON,
  ITALIC_ICON,
  STRIKE_ICON,
  CODE_ICON,
  BULLET_LIST_ICON,
  ORDERED_LIST_ICON,
  QUOTE_ICON,
  CODE_BLOCK_ICON,
  CLEAR_FORMAT_ICON,
  IMAGE_ICON,
  TABLE_ICON,
  HR_ICON,
  MORE_ICON,
} from './icons'
import { insertHr, insertImageFromPicker, insertTable } from './insert'

/** App 挂载后注册：TopBar 的 ⋮ 按钮点击时打开 React 菜单 */
let moreMenuHandler: (() => void) | null = null
export function setMoreMenuHandler(handler: (() => void) | null): void {
  moreMenuHandler = handler
}

/**
 * Crepe 顶部工具栏（TopBar）定制。
 *
 * - Crepe 默认的 Toolbar 是"跟随选区浮出的气泡条"，这里关掉，只保留顶部栏。
 * - TopBar 默认也是关闭的，必须在 features 里显式打开。
 * - buildTopBar 里的分组顺序即屏幕顺序；Crepe 会在每两组之间自动插分隔线。
 */
export const crepeFeatures: Partial<Record<CrepeFeature, boolean>> = {
  [CrepeFeature.TopBar]: true,
  [CrepeFeature.Toolbar]: false,
  [CrepeFeature.CodeMirror]: true,
  [CrepeFeature.Table]: true,
  [CrepeFeature.Latex]: true,
  [CrepeFeature.ListItem]: true,
  [CrepeFeature.ImageBlock]: true,
  [CrepeFeature.BlockEdit]: true,
  [CrepeFeature.LinkTooltip]: true,
  [CrepeFeature.Placeholder]: true,
  [CrepeFeature.Cursor]: true,
}

function isMarkActive(ctx: Ctx, markType: any): boolean {
  try {
    const view = ctx.get(editorViewCtx)
    const { state } = view
    if (state.selection.empty) {
      const stored = state.storedMarks ?? state.selection.$from.marks()
      return markType.isInSet(stored) != null
    }
    return state.doc.rangeHasMark(state.selection.from, state.selection.to, markType)
  } catch {
    return false
  }
}

function isBlockActive(ctx: Ctx, type: any): boolean {
  try {
    const view = ctx.get(editorViewCtx)
    const { $from } = view.state.selection
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type === type) return true
    }
    return false
  } catch {
    return false
  }
}

/** 清除格式：行内 mark 全清 + 块级降级为段落（列表 / 引用先脱出） */
export function clearFormat(ctx: Ctx): void {
  const view = ctx.get(editorViewCtx)
  const listItem = listItemSchema.type(ctx)
  const quote = blockquoteSchema.type(ctx)
  const paragraph = paragraphSchema.type(ctx)

  const hasAncestor = (type: any) =>
    !!findParentNode((node) => node.type === type)(view.state.selection)

  // 1) 列表：逐层脱出
  let guard = 0
  while (hasAncestor(listItem) && guard < 8) {
    if (!liftListItem(listItem)(ctx.get(editorViewCtx).state, ctx.get(editorViewCtx).dispatch)) break
    guard += 1
  }
  if (!hasAncestor(listItem)) {
    guard = 0
    while (hasAncestor(quote) && guard < 8) {
      if (!lift(ctx.get(editorViewCtx).state, ctx.get(editorViewCtx).dispatch)) break
      guard += 1
    }
  }

  const currentView = ctx.get(editorViewCtx)
  const state = currentView.state
  const { from, to, empty } = state.selection
  let tr = state.tr
  tr = empty ? tr.setStoredMarks([]) : tr.removeMark(from, to)

  const isParagraph = state.selection.$from.parent.type === paragraph
  if (!isParagraph) {
    currentView.dispatch(tr)
    const view2 = ctx.get(editorViewCtx)
    setBlockType(paragraph)(view2.state, view2.dispatch)
    return
  }
  currentView.dispatch(tr.scrollIntoView())
}

const HEADING_LABELS: Record<number, string> = {
  0: '正文',
  1: '标题一',
  2: '标题二',
  3: '标题三',
  4: '标题四',
  5: '标题五',
  6: '标题六',
}

function currentHeadingLabel(ctx: Ctx): string {
  try {
    const view = ctx.get(editorViewCtx)
    const node = view.state.selection.$from.parent
    if (node.type === headingSchema.type(ctx)) {
      return HEADING_LABELS[Number(node.attrs.level) || 1] ?? '标题'
    }
    return '正文'
  } catch {
    return '正文'
  }
}

function setHeadingLevel(ctx: Ctx, level: number | null): void {
  const commands = ctx.get(commandsCtx)
  if (level === null) {
    commands.call(setBlockTypeCommand.key, { nodeType: paragraphSchema.type(ctx) })
  } else {
    commands.call(setBlockTypeCommand.key, {
      nodeType: headingSchema.type(ctx),
      attrs: { level },
    })
  }
}

/** 供菜单 / 快捷键调用的块类型转换 */
export function applyBlockType(ctx: Ctx, level: number | null): void {
  const commands = ctx.get(commandsCtx)
  if (level === null) {
    commands.call(setBlockTypeCommand.key, { nodeType: paragraphSchema.type(ctx) })
  } else {
    commands.call(setBlockTypeCommand.key, {
      nodeType: headingSchema.type(ctx),
      attrs: { level },
    })
  }
}

/** 纯图标必须给 tooltip，这里按 Crepe 渲染顺序映射 */
export const TOOLBAR_LABELS: Record<string, string> = {
  'heading-selector': '段落 / 标题级别（Ctrl+1/2/3）',
  bold: '粗体（Ctrl+B）',
  italic: '斜体（Ctrl+I）',
  strike: '删除线（Ctrl+Shift+X）',
  code: '行内代码',
  'bullet-list': '项目符号列表',
  'ordered-list': '有序列表',
  image: '插入图片',
  table: '插入表格',
  hr: '插入分割线',
  quote: '引用',
  'code-block': '代码块',
  'clear-format': '清除格式（Ctrl+\\）',
  more: '更多（查找 / 替换 / 源码 / 设置 / 关于）',
}

/** 与 buildTopBar 里 addItem 的顺序严格一致（不含 heading selector） */
const BUTTON_LABEL_ORDER = [
  'bold',
  'italic',
  'strike',
  'code',
  'bullet-list',
  'ordered-list',
  'image',
  'table',
  'hr',
  'quote',
  'code-block',
  'clear-format',
  'more',
]

type Builder = Parameters<NonNullable<TopBarFeatureConfig['buildTopBar']>>[0]

export function buildTopBar(builder: Builder): void {
  builder.clear()

  // 段落 / 标题一~六：自己拼 selector，不依赖 Crepe 的内部导出
  builder.addGroup('heading', '段落与标题').addItem('heading-selector', {
    icon: '',
    active: () => false,
    selector: {
      options: [
        { label: '正文', level: null },
        { label: '标题一', level: 1 },
        { label: '标题二', level: 2 },
        { label: '标题三', level: 3 },
        { label: '标题四', level: 4 },
        { label: '标题五', level: 5 },
        { label: '标题六', level: 6 },
      ].map((option) => ({
        label: option.label,
        onSelect: (ctx: Ctx) => setHeadingLevel(ctx, option.level),
      })),
      activeLabel: (ctx: Ctx) => currentHeadingLabel(ctx),
    },
  })

  // 粗体 / 斜体 / 删除线 / 行内代码
  const formatting = builder.addGroup('formatting', '文字样式')
  formatting.addItem('bold', {
    icon: BOLD_ICON,
    active: (ctx: Ctx) => isMarkActive(ctx, strongSchema.type(ctx)),
    onRun: (ctx: Ctx) => ctx.get(commandsCtx).call(toggleStrongCommand.key),
  })
  formatting.addItem('italic', {
    icon: ITALIC_ICON,
    active: (ctx: Ctx) => isMarkActive(ctx, emphasisSchema.type(ctx)),
    onRun: (ctx: Ctx) => ctx.get(commandsCtx).call(toggleEmphasisCommand.key),
  })
  formatting.addItem('strike', {
    icon: STRIKE_ICON,
    active: (ctx: Ctx) => isMarkActive(ctx, strikethroughSchema.type(ctx)),
    onRun: (ctx: Ctx) => ctx.get(commandsCtx).call(toggleStrikethroughCommand.key),
  })
  formatting.addItem('code', {
    icon: CODE_ICON,
    active: (ctx: Ctx) => isMarkActive(ctx, inlineCodeSchema.type(ctx)),
    onRun: (ctx: Ctx) => ctx.get(commandsCtx).call(toggleInlineCodeCommand.key),
  })

  // 列表
  const lists = builder.addGroup('lists', '列表')
  lists.addItem('bullet-list', {
    icon: BULLET_LIST_ICON,
    active: (ctx: Ctx) => isBlockActive(ctx, bulletListSchema.type(ctx)),
    onRun: (ctx: Ctx) =>
      ctx.get(commandsCtx).call(wrapInBlockTypeCommand.key, {
        nodeType: bulletListSchema.type(ctx),
      }),
  })
  lists.addItem('ordered-list', {
    icon: ORDERED_LIST_ICON,
    active: (ctx: Ctx) => isBlockActive(ctx, orderedListSchema.type(ctx)),
    onRun: (ctx: Ctx) =>
      ctx.get(commandsCtx).call(wrapInBlockTypeCommand.key, {
        nodeType: orderedListSchema.type(ctx),
      }),
  })

  // 插入：图片 / 表格 / 分割线 / 引用 / 代码块
  const insert = builder.addGroup('insert', '插入')
  insert.addItem('image', {
    icon: IMAGE_ICON,
    active: () => false,
    onRun: insertImageFromPicker,
  })
  insert.addItem('table', {
    icon: TABLE_ICON,
    active: (ctx: Ctx) => isBlockActive(ctx, tableSchema.type(ctx)),
    onRun: insertTable,
  })
  insert.addItem('hr', {
    icon: HR_ICON,
    active: () => false,
    onRun: insertHr,
  })
  insert.addItem('quote', {
    icon: QUOTE_ICON,
    active: (ctx: Ctx) => isBlockActive(ctx, blockquoteSchema.type(ctx)),
    onRun: (ctx: Ctx) =>
      ctx.get(commandsCtx).call(wrapInBlockTypeCommand.key, {
        nodeType: blockquoteSchema.type(ctx),
      }),
  })
  insert.addItem('code-block', {
    icon: CODE_BLOCK_ICON,
    active: (ctx: Ctx) => isBlockActive(ctx, codeBlockSchema.type(ctx)),
    onRun: (ctx: Ctx) =>
      ctx.get(commandsCtx).call(setBlockTypeCommand.key, {
        nodeType: codeBlockSchema.type(ctx),
      }),
  })

  // 清除格式
  builder.addGroup('cleanup', '清理').addItem('clear-format', {
    icon: CLEAR_FORMAT_ICON,
    active: () => false,
    onRun: clearFormat,
  })

  // 顶栏最右侧的 ⋮，菜单由 React 渲染
  builder.addGroup('more', '更多').addItem('more', {
    icon: MORE_ICON,
    active: () => false,
    onRun: () => moreMenuHandler?.(),
  })
}

/**
 * 顶部栏按钮没有原生 tooltip（Crepe 渲染时不给 title），
 * 这里在挂载后按 DOM 顺序补上 title，纯图标也能看懂。
 */
let observer: MutationObserver | null = null

export function installTopBarTooltips(root: HTMLElement): void {
  // Crepe 渲染的按钮不带 key，只能按 DOM 顺序对应；
  // 标题下拉是独立的 .top-bar-heading-button，所以按钮列表要跳过第一条标签
  const decorate = () => {
    root.querySelectorAll<HTMLButtonElement>('.milkdown-top-bar .top-bar-item').forEach((btn, i) => {
      const key = BUTTON_LABEL_ORDER[i]
      if (!key) return
      const label = TOOLBAR_LABELS[key]
      if (!label) return
      if (btn.dataset.key !== key) btn.dataset.key = key
      if (btn.title !== label) btn.title = label
      btn.setAttribute('aria-label', label)
    })
    const selector = root.querySelector<HTMLElement>('.milkdown-top-bar .top-bar-heading-button')
    if (selector && !selector.title) {
      selector.title = TOOLBAR_LABELS['heading-selector']
    }
  }
  decorate()
  observer?.disconnect()

  // Crepe 在切换 EditorState 时可能整体替换 TopBar，所以观察 root 而不是某一根 bar：
  // 本层只关心 TopBar 内部的 childList 变化，正文输入不会触发 decorate。
  observer = new MutationObserver((mutations) => {
    const touchesBar = mutations.some((mutation) => {
      const target = mutation.target as Element
      if (target.closest?.('.milkdown-top-bar')) return true
      return Array.from(mutation.addedNodes).some(
        (node) =>
          node instanceof Element &&
          (node.matches('.milkdown-top-bar') || !!node.querySelector('.milkdown-top-bar')),
      )
    })
    if (touchesBar) decorate()
  })
  observer.observe(root, { childList: true, subtree: true })
}

export function stopTopBarTooltips(): void {
  observer?.disconnect()
  observer = null
}

export { EditorStatus, editorCtx, useCrepeFeatures }
