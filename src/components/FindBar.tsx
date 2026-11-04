import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Ctx } from '@milkdown/kit/ctx'
import { editorViewCtx } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { findMatches, type SearchMatch } from '../lib/search'
import { clearSearchDecorations, setSearchDecorations } from '../editor/searchPlugin'
import { IconClose } from './Icons'

export type FindMode = 'find' | 'replace'

interface FindBarProps {
  open: boolean
  mode: FindMode
  getCtx: () => Ctx | null
  onClose: () => void
}

/**
 * 查找 / 替换浮层。
 * 高频路径都在当前 ProseMirror doc 上重新算一遍匹配，避免文档被编辑后位置过期。
 */
export function FindBar({ open, mode, getCtx, onClose }: FindBarProps) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [index, setIndex] = useState(0)
  const findRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  const view = (): EditorView | null => getCtx()?.get(editorViewCtx) ?? null

  const collect = (v: EditorView): SearchMatch[] =>
    query ? findMatches(v.state.doc, query, caseSensitive) : []

  const show = (v: EditorView, list: SearchMatch[], current: number): void => {
    if (!list.length) {
      clearSearchDecorations(v)
      return
    }
    const safe = Math.min(Math.max(current, 0), list.length - 1)
    setSearchDecorations(v, list, safe)
    const target = list[safe]
    const tr = v.state.tr
      .setSelection(TextSelection.create(v.state.doc, target.from, target.to))
      .scrollIntoView()
    v.dispatch(tr)
  }

  // 打开时：用当前选中文字预填查找内容，并聚焦
  useEffect(() => {
    if (!open) {
      const v = view()
      if (v) clearSearchDecorations(v)
      return
    }
    const v = view()
    if (v && !v.state.selection.empty) {
      const selected = v.state.doc.textBetween(
        v.state.selection.from,
        v.state.selection.to,
        '\n',
        '\n',
      )
      if (selected && selected.length <= 120) setQuery(selected)
    }
    const timer = window.setTimeout(() => {
      const input = mode === 'replace' ? replaceRef.current : findRef.current
      input?.focus()
      input?.select()
    }, 30)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // 查询词 / 大小写变化：重算并选中第一个
  useEffect(() => {
    if (!open) return
    const v = view()
    if (!v) return
    const list = collect(v)
    setMatches(list)
    setIndex(0)
    show(v, list, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, caseSensitive])

  const go = (delta: number): void => {
    const v = view()
    if (!v) return
    const list = collect(v)
    if (!list.length) {
      setMatches([])
      clearSearchDecorations(v)
      return
    }
    const next = (index + delta + list.length) % list.length
    setMatches(list)
    setIndex(next)
    show(v, list, next)
  }

  const replaceOne = (): void => {
    const v = view()
    if (!v) return
    const list = collect(v)
    const target = list[Math.min(index, list.length - 1)]
    if (!target) return

    const tr = v.state.tr
    if (replacement) tr.replaceWith(target.from, target.to, v.state.schema.text(replacement))
    else tr.delete(target.from, target.to)
    v.dispatch(tr)

    const after = collect(v)
    setMatches(after)
    const next = after.length ? Math.min(index, after.length - 1) : 0
    setIndex(next)
    show(v, after, next)
  }

  const replaceAll = (): void => {
    const v = view()
    if (!v) return
    const list = collect(v)
    if (!list.length) return

    const tr = v.state.tr
    for (const match of [...list].reverse()) {
      if (replacement) tr.replaceWith(match.from, match.to, v.state.schema.text(replacement))
      else tr.delete(match.from, match.to)
    }
    v.dispatch(tr)

    setMatches([])
    setIndex(0)
    clearSearchDecorations(v)
  }

  const close = (): void => {
    const v = view()
    if (v) clearSearchDecorations(v)
    onClose()
  }

  const onFindKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(e.shiftKey ? -1 : 1)
    }
  }

  const onReplaceKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) replaceAll()
      else replaceOne()
    }
  }

  if (!open) return null

  return (
    <div className="findbar" role="dialog" aria-label={mode === 'replace' ? '替换' : '查找'}>
      <div className="findbar__row">
        <input
          ref={findRef}
          className="findbar__input"
          value={query}
          placeholder="查找"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onFindKeyDown}
        />
        <span className="findbar__count">
          {query ? `${matches.length ? index + 1 : 0}/${matches.length}` : ''}
        </span>
        <button
          type="button"
          className={`findbar__btn${caseSensitive ? ' is-on' : ''}`}
          onClick={() => setCaseSensitive((v) => !v)}
          title="区分大小写"
        >
          Aa
        </button>
        <button type="button" className="findbar__btn" onClick={() => go(-1)} title="上一个（Shift+Enter）">
          ↑
        </button>
        <button type="button" className="findbar__btn" onClick={() => go(1)} title="下一个（Enter）">
          ↓
        </button>
        <button type="button" className="findbar__btn" onClick={close} title="关闭（Esc）">
          <IconClose width={12} height={12} />
        </button>
      </div>

      {mode === 'replace' && (
        <div className="findbar__row">
          <input
            ref={replaceRef}
            className="findbar__input"
            value={replacement}
            placeholder="替换为"
            spellCheck={false}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={onReplaceKeyDown}
          />
          <button type="button" className="findbar__btn findbar__btn--text" onClick={replaceOne}>
            替换
          </button>
          <button type="button" className="findbar__btn findbar__btn--text" onClick={replaceAll}>
            全部替换
          </button>
        </div>
      )}
    </div>
  )
}
