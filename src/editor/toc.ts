import type { Ctx } from '@milkdown/kit/ctx'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView, NodeView } from '@milkdown/kit/prose/view'
import { $node, $prose, $remark, $view } from '@milkdown/kit/utils'
import { buildOutline } from '../lib/outline'
import { assignTocSlugs, GITHUB_TOC_PLACEHOLDER } from '../lib/toc'

/**
 * [TOC] 在编辑器里是一个 atom 节点：
 * - 只读，内容由 NodeView 根据当前标题生成
 * - 可整体选中 / 删除
 * - 序列化回 Markdown 仍是 [TOC]
 */
export const tocRemark = $remark('seekieTocRemark', () => () => (tree: any) => {
  const visit = (parent: any): void => {
    if (!Array.isArray(parent?.children)) return
    for (let i = 0; i < parent.children.length; i += 1) {
      const node = parent.children[i]
      if (
        node?.type === 'paragraph' &&
        node.children?.length === 1 &&
        node.children[0]?.type === 'text' &&
        node.children[0].value?.trim().toUpperCase() === '[TOC]'
      ) {
        parent.children[i] = { type: 'seekieToc', mode: 'marker', value: '[TOC]', children: [] }
        continue
      }
      // 打开含 GitHub 兼容目录的 .md 时，同样落到 TOC 节点
      if (
        node?.type === 'html' &&
        /^<nav\b[^>]*\brole=["']doc-toc["'][^>]*>/i.test(node.value ?? '')
      ) {
        parent.children[i] = { type: 'seekieToc', mode: 'github', value: '[TOC]', children: [] }
        continue
      }
      visit(node)
    }
  }
  visit(tree)
})

const tocNode = $node('seekieToc', () => ({
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  isolating: true,
  attrs: {
    mode: { default: 'marker' },
  },
  parseDOM: [
    {
      tag: 'div[data-seekie-toc]',
      getAttrs: (dom: HTMLElement) => ({
        mode: dom.getAttribute('data-mode') === 'github' ? 'github' : 'marker',
      }),
    },
    {
      tag: 'nav[role="doc-toc"]',
      getAttrs: () => ({ mode: 'github' }),
    },
  ],
  toDOM: (node: PMNode) => [
    'div',
    {
      'data-seekie-toc': 'true',
      'data-mode': node.attrs.mode,
      class: 'seekie-toc',
    },
  ],
  parseMarkdown: {
    match: (node: any) => node.type === 'seekieToc',
    runner: (state: any, node: any, proseType: any) => {
      state.addNode(proseType, { mode: node.mode === 'github' ? 'github' : 'marker' })
    },
  },
  toMarkdown: {
    match: (node: PMNode) => node.type.name === 'seekieToc',
    runner: (state: any, node: PMNode) => {
      // 用 html 节点让 remark-stringify 原样输出，不把方括号转义成 \[TOC]
      state.addNode(
        'html',
        [],
        node.attrs.mode === 'github' ? GITHUB_TOC_PLACEHOLDER : '[TOC]',
      )
    },
  },
}))

const tocViews = new Set<TocNodeView>()
let scheduled = false

function refreshTocViews(): void {
  if (scheduled) return
  scheduled = true
  window.requestAnimationFrame(() => {
    scheduled = false
    for (const view of tocViews) view.render()
  })
}

class TocNodeView implements NodeView {
  dom: HTMLElement

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.dom = document.createElement('div')
    this.dom.className = 'seekie-toc'
    this.dom.dataset.seekieToc = 'true'
    this.dom.contentEditable = 'false'
    this.dom.setAttribute('role', 'navigation')
    this.dom.setAttribute('aria-label', '目录')
    this.dom.addEventListener('click', this.onClick)
    tocViews.add(this)
    this.render()
  }

  private onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null
    if (target?.closest('.seekie-toc__remove')) {
      event.preventDefault()
      event.stopPropagation()
      const pos = this.getPos()
      if (pos != null) {
        this.view.dispatch(this.view.state.tr.delete(pos, pos + this.node.nodeSize))
        this.view.focus()
      }
      return
    }
    const link = target?.closest<HTMLAnchorElement>('.seekie-toc__link')
    if (!link) return
    event.preventDefault()
    event.stopPropagation()
    const pos = Number(link.dataset.pos)
    if (!Number.isFinite(pos)) return
    const doc = this.view.state.doc
    const safe = Math.min(Math.max(pos + 1, 0), doc.content.size)
    this.view.dispatch(
      this.view.state.tr.setSelection(TextSelection.near(doc.resolve(safe))).scrollIntoView(),
    )
    this.view.focus()
  }

  render(): void {
    const headings = assignTocSlugs(
      buildOutline(this.view.state.doc).map((item) => ({ level: item.level, text: item.text })),
    )
    const raw = buildOutline(this.view.state.doc)
    this.dom.replaceChildren()
    const head = document.createElement('div')
    head.className = 'seekie-toc__head'
    const title = document.createElement('span')
    title.className = 'seekie-toc__title'
    title.textContent = this.node.attrs.mode === 'github' ? '目录 · GitHub' : '目录'
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'seekie-toc__remove'
    remove.title = '删除目录'
    remove.setAttribute('aria-label', '删除目录')
    remove.textContent = '×'
    head.append(title, remove)
    this.dom.append(head)

    if (!headings.length) {
      const empty = document.createElement('div')
      empty.className = 'seekie-toc__empty'
      empty.textContent = '还没有标题'
      this.dom.append(empty)
      return
    }

    const list = document.createElement('ul')
    list.className = 'seekie-toc__list'
    for (let i = 0; i < headings.length; i += 1) {
      const heading = headings[i]
      const item = document.createElement('li')
      item.className = `seekie-toc__item seekie-toc__level-${heading.level}`
      const link = document.createElement('a')
      link.className = 'seekie-toc__link'
      link.href = `#user-content-${heading.slug}`
      link.dataset.pos = String(raw[i]?.pos ?? 0)
      link.textContent = heading.text || '(空标题)'
      item.append(link)
      list.append(item)
    }
    this.dom.append(list)
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.render()
    return true
  }

  selectNode(): void {
    this.dom.classList.add('is-selected')
  }

  deselectNode(): void {
    this.dom.classList.remove('is-selected')
  }

  stopEvent(event: Event): boolean {
    const target = event.target as HTMLElement | null
    return !!target?.closest('.seekie-toc__remove, .seekie-toc__link')
  }

  ignoreMutation(): boolean {
    return true
  }

  destroy(): void {
    this.dom.removeEventListener('click', this.onClick)
    tocViews.delete(this)
  }
}

const tocInput = $prose(
  (ctx) =>
    new Plugin({
      appendTransaction(transactions, _oldState, newState) {
        if (!transactions.some((tr) => tr.docChanged)) return null
        const type = tocNode.type(ctx)
        const positions: number[] = []
        newState.doc.descendants((node, pos) => {
          if (
            node.type.name === 'paragraph' &&
            node.textContent.trim().toUpperCase() === '[TOC]'
          ) {
            positions.push(pos)
            return false
          }
          return true
        })
        if (!positions.length) return null
        const tr = newState.tr
        for (const pos of [...positions].reverse()) {
          const node = newState.doc.nodeAt(pos)
          if (!node) continue
          tr.replaceWith(pos, pos + node.nodeSize, type.create({ mode: 'marker' }))
        }
        return tr
      },
    }),
)

const tocRefresh = $prose(
  () =>
    new Plugin({
      view: () => ({
        update: () => refreshTocViews(),
      }),
    }),
)

const tocView = $view(tocNode, () => (node, view, getPos) =>
  new TocNodeView(node, view, () => (typeof getPos === 'function' ? getPos() : undefined)),
)

export const tocPlugins = [
  tocRemark.plugin,
  tocNode,
  tocView,
  tocRefresh,
  tocInput,
] as const

export function installTocPlugins(ctx: Ctx): void {
  // 只用于类型/调试；createEditor 直接 use 插件
  void ctx
}
