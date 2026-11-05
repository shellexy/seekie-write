import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { api } from '../lib/api'

const sourceHighlight = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--accent)', fontWeight: '650' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--accent)' },
  { tag: tags.url, color: 'var(--fg-faint)' },
  { tag: tags.monospace, color: 'var(--ok)' },
  { tag: tags.quote, color: 'var(--fg-muted)' },
  { tag: tags.meta, color: 'var(--fg-faint)' },
  { tag: tags.contentSeparator, color: 'var(--fg-faint)' },
])

const sourceTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    backgroundColor: 'var(--bg)',
    color: 'var(--fg)',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
    lineHeight: '1.65',
    overflow: 'auto',
  },
  '.cm-content': { padding: '14px 16px 14px 8px', caretColor: 'transparent' },
  '.cm-line': { padding: '0' },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-soft)',
    color: 'var(--fg-faint)',
    border: 'none',
    borderRight: '1px solid var(--border)',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 6px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--selection, rgba(160, 120, 60, 0.25)) !important',
  },
})

export function SourceCodeDialog({
  open,
  markdownText,
  onClose,
}: {
  open: boolean
  markdownText: string
  onClose: () => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!open || !hostRef.current) return
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: markdownText,
        extensions: [
          markdown(),
          lineNumbers(),
          EditorView.lineWrapping,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          syntaxHighlighting(sourceHighlight),
          sourceTheme,
        ],
      }),
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [open, markdownText])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog dialog--source"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Markdown 源码"
      >
        <h3 className="dialog__title">Markdown 源码</h3>
        <div className="source-view" ref={hostRef} />
        <div className="dialog__actions">
          <button
            className="btn"
            onClick={() => {
              if (markdownText) void api.clipboard.write({ text: markdownText })
            }}
          >
            复制源码
          </button>
          <button className="btn btn--primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
