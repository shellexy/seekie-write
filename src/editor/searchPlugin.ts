import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { SearchMatch } from '../lib/search'

/**
 * 查找高亮：用 ProseMirror Decoration 把匹配项画出来，
 * 这样焦点留在查找输入框里时，正文里的命中项依然可见。
 */
export const searchPluginKey = new PluginKey<DecorationSet>('seekie-search')

export const searchPlugin = new Plugin<DecorationSet>({
  key: searchPluginKey,
  state: {
    init: () => DecorationSet.empty,
    apply(tr, previous) {
      const next = tr.getMeta(searchPluginKey) as DecorationSet | undefined
      if (next) return next
      return previous.map(tr.mapping, tr.doc)
    },
  },
  props: {
    decorations(state) {
      return searchPluginKey.getState(state) ?? DecorationSet.empty
    },
  },
})

export function setSearchDecorations(
  view: EditorView,
  matches: SearchMatch[],
  current: number,
): void {
  const decorations = matches.map((match, index) =>
    Decoration.inline(match.from, match.to, {
      class: index === current ? 'seekie-find-match is-current' : 'seekie-find-match',
    }),
  )
  view.dispatch(
    view.state.tr.setMeta(searchPluginKey, DecorationSet.create(view.state.doc, decorations)),
  )
}

export function clearSearchDecorations(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(searchPluginKey, DecorationSet.empty))
}
