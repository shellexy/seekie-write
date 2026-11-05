import { useEffect, useMemo, useState } from 'react'
import type { HeadingCandidate } from '../lib/headingDetect'

interface Row extends HeadingCandidate {
  checked: boolean
  level: number
}

/**
 * 智能识别标题预览：勾选 + 调整 H1~H6/正文，确认后由 App 用单个
 * ProseMirror 事务应用，保证一次 Ctrl+Z 可完整撤销。
 */
export function SmartHeadingsDialog({
  open,
  candidates,
  onClose,
  onApply,
}: {
  open: boolean
  candidates: HeadingCandidate[]
  onClose: () => void
  onApply: (items: Array<{ pos: number; level: number }>) => void
}) {
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    if (!open) return
    setRows(candidates.map((item) => ({ ...item, checked: item.checked, level: item.level })))
  }, [open, candidates])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const selected = useMemo(
    () => rows.filter((row) => row.checked && row.level >= 1 && row.level <= 6),
    [rows],
  )

  if (!open) return null

  const patchRow = (pos: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.pos === pos ? { ...row, ...patch } : row)))

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog dialog--smart-headings"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="智能识别标题"
      >
        <h3 className="dialog__title">智能识别标题</h3>
        <p className="dialog__hint">
          系统根据正则特征推测，请确认后转换，转换可撤销。
        </p>
        <p className="smart-headings__warn">
          此操作会覆盖现有标题层级；已有标题不会被删除，但大纲会按新结果重排。
        </p>

        {rows.length === 0 ? (
          <div className="smart-headings__empty">
            没有找到可识别的标题行。需要至少 2 个字、不是纯数字/符号/日期，并命中章节序号等特征。
          </div>
        ) : (
          <>
            <div className="smart-headings__meta">
              共 {rows.length} 个候选，已勾选 {selected.length} 个
            </div>
            <div className="smart-headings__list">
              {rows.map((row) => (
                <div
                  key={row.pos}
                  className="smart-headings__row"
                  style={{ paddingLeft: 8 + Math.max(0, row.level - 1) * 16 }}
                >
                  <input
                    type="checkbox"
                    checked={row.checked}
                    onChange={(e) => patchRow(row.pos, { checked: e.target.checked })}
                    aria-label={`选择 ${row.text}`}
                  />
                  <span className="smart-headings__text" title={row.text}>
                    {row.text}
                  </span>
                  <span className="smart-headings__score" title="规则基础权重 + 上下文得分">
                    {row.score} 分
                  </span>
                  <select
                    value={row.level}
                    onChange={(e) => patchRow(row.pos, { level: Number(e.target.value) })}
                    aria-label={`${row.text} 的标题级别`}
                  >
                    <option value={0}>正文</option>
                    <option value={1}>H1</option>
                    <option value={2}>H2</option>
                    <option value={3}>H3</option>
                    <option value={4}>H4</option>
                    <option value={5}>H5</option>
                    <option value={6}>H6</option>
                  </select>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="dialog__actions">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn--primary"
            disabled={selected.length === 0}
            onClick={() => onApply(selected.map((row) => ({ pos: row.pos, level: row.level })))}
          >
            应用标题
          </button>
        </div>
      </div>
    </div>
  )
}
