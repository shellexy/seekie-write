import { useEffect, useRef, useState } from 'react'
import type { Ctx } from '@milkdown/kit/ctx'
import { editorViewCtx } from '@milkdown/kit/core'
import {
  collectChineseReplacements,
  DIRECTION_LABELS,
  guessDirection,
  type ChineseDirection,
} from '../lib/chinese'
import { IconClose } from './Icons'

interface ChineseConvertDialogProps {
  open: boolean
  getCtx: () => Ctx | null
  onClose: () => void
  notify: (text: string, kind?: 'info' | 'error') => void
}

export function ChineseConvertDialog({
  open,
  getCtx,
  onClose,
  notify,
}: ChineseConvertDialogProps) {
  const [direction, setDirection] = useState<ChineseDirection>('s2t')
  const [scope, setScope] = useState<'selection' | 'full'>('full')
  const [selection, setSelection] = useState({ from: 0, to: 0, has: false })
  const [from, setFrom] = useState(0)
  const [to, setTo] = useState(0)
  const [original, setOriginal] = useState('')
  const [generated, setGenerated] = useState('')
  const [edited, setEdited] = useState('')
  const originalRef = useRef<HTMLTextAreaElement>(null)
  const editedRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const view = () => getCtx()?.get(editorViewCtx) ?? null

  useEffect(() => {
    if (!open) return
    const v = view()
    if (!v) return
    const { from: selFrom, to: selTo } = v.state.selection
    const has = selFrom !== selTo
    setSelection({ from: selFrom, to: selTo, has })
    const rangeFrom = has ? selFrom : 0
    const rangeTo = has ? selTo : v.state.doc.content.size
    setFrom(rangeFrom)
    setTo(rangeTo)
    setScope(has ? 'selection' : 'full')
    const text = v.state.doc.textBetween(rangeFrom, rangeTo, '\n', '\n')
    setOriginal(text)
    setDirection(guessDirection(text))
  }, [open])

  useEffect(() => {
    if (!open) return
    const v = view()
    if (!v) return
    setOriginal(v.state.doc.textBetween(from, to, '\n', '\n'))
  }, [open, from, to])

  useEffect(() => {
    if (!open) return
    const v = view()
    if (!v) return
    const replacements = collectChineseReplacements(v.state.doc, from, to, direction)
    const tr = v.state.tr
    for (const replacement of [...replacements].reverse()) {
      tr.replaceWith(
        replacement.from,
        replacement.to,
        v.state.schema.text(replacement.text, replacement.marks),
      )
    }
    const mappedFrom = tr.mapping.map(from)
    const mappedTo = tr.mapping.map(to, 1)
    const converted = tr.doc.textBetween(mappedFrom, mappedTo, '\n', '\n')
    setGenerated(converted)
    setEdited(converted)
  }, [open, from, to, direction])

  const fitTextareas = (): void => {
    for (const element of [originalRef.current, editedRef.current]) {
      if (!element) continue
      element.style.height = 'auto'
      element.style.height = `${element.scrollHeight}px`
    }
  }

  // 两个 textarea 都随内容长高，由外层 .zh__scroll 统一滚动
  useEffect(() => {
    if (!open) return
    const raf = window.requestAnimationFrame(fitTextareas)
    const onResize = () => fitTextareas()
    window.addEventListener('resize', onResize)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [open, original, edited])

  useEffect(() => {
    if (!open) return
    scrollRef.current?.scrollTo({ top: 0 })
  }, [open, direction, scope])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const chooseScope = (next: 'selection' | 'full'): void => {
    if (next === 'selection' && !selection.has) return
    setScope(next)
    setFrom(next === 'selection' ? selection.from : 0)
    setTo(next === 'selection' ? selection.to : (view()?.state.doc.content.size ?? 0))
  }

  const apply = (): void => {
    const v = view()
    if (!v) return
    const tr = v.state.tr

    if (scope === 'selection' && edited !== generated) {
      // 选中范围的预览允许手动微调，确认时按编辑后的纯文本替换选中区
      tr.insertText(edited, from, to)
    } else {
      const replacements = collectChineseReplacements(v.state.doc, from, to, direction)
      if (!replacements.length) {
        notify('没有需要转换的文字')
        return
      }
      for (const replacement of [...replacements].reverse()) {
        tr.replaceWith(
          replacement.from,
          replacement.to,
          v.state.schema.text(replacement.text, replacement.marks),
        )
      }
    }

    if (!tr.docChanged) {
      notify('没有需要转换的文字')
      return
    }
    v.dispatch(tr.scrollIntoView())
    v.focus()
    onClose()
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog dialog--zh" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__head">
          <h3>中文简繁转换</h3>
          <button className="icon-btn" onClick={onClose} title="关闭" aria-label="关闭">
            <IconClose width={14} height={14} />
          </button>
        </div>

        <div className="zh__controls">
          <label className="zh__field">
            <span>转换方向</span>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as ChineseDirection)}
            >
              {(Object.keys(DIRECTION_LABELS) as ChineseDirection[]).map((key) => (
                <option key={key} value={key}>
                  {DIRECTION_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          <div className="zh__field">
            <span>转换范围</span>
            <div className="zh__radios">
              <label>
                <input
                  type="radio"
                  name="zh-scope"
                  checked={scope === 'selection'}
                  disabled={!selection.has}
                  onChange={() => chooseScope('selection')}
                />
                选中文本
              </label>
              <label>
                <input
                  type="radio"
                  name="zh-scope"
                  checked={scope === 'full'}
                  onChange={() => chooseScope('full')}
                />
                全文
              </label>
            </div>
          </div>
        </div>

        <div className="zh__scroll" ref={scrollRef}>
          <div className="zh__previews">
            <section className="zh__pane">
              <h4>原文预览{scope === 'selection' ? '（选中部分）' : '（全文）'}</h4>
              <textarea ref={originalRef} readOnly value={original} />
            </section>
            <section className="zh__pane">
              <h4>转换后预览（{scope === 'selection' ? '可编辑' : '全文只读'}）</h4>
              <textarea
                ref={editedRef}
                readOnly={scope === 'full'}
                value={edited}
                onChange={(e) => setEdited(e.target.value)}
              />
            </section>
          </div>
        </div>

        <p className="dialog__hint">
          提示：代码块、行内代码及链接 URL 将自动跳过。
          {scope === 'full'
            ? ' 全文转换保留原文档格式，右栏仅供预览；需要微调请切换到“选中文本”。'
            : ' 右栏可编辑，确认后按编辑后的文本替换选中区。'}
        </p>

        <div className="dialog__actions">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn--primary" onClick={apply}>
            确认转换
          </button>
        </div>
      </div>
    </div>
  )
}
