import { useEffect } from 'react'

export type TocMode = 'marker' | 'github'

export function TocInsertDialog({
  open,
  onInsert,
  onCancel,
}: {
  open: boolean
  onInsert: (mode: TocMode) => void
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog dialog--toc-insert" onClick={(e) => e.stopPropagation()}>
        <h3>插入目录</h3>
        <p className="dialog__hint">选择目录格式：</p>
        <div className="toc-insert__options">
          <div className="toc-insert__option">
            <b>选项 A：[TOC] 标记</b>
            <p>文件小巧，Typora 等编辑器可直接渲染。</p>
            <p className="toc-insert__warn">但 GitHub 等平台会显示为一行普通文本。</p>
          </div>
          <div className="toc-insert__option">
            <b>选项 B：GitHub 兼容目录</b>
            <p>在 GitHub、VS Code 等支持 HTML 的环境中显示为可点击列表。</p>
            <p className="toc-insert__warn">
              文件体积较大，保存时会展开为静态列表，离开本编辑器后目录不会自动更新。
            </p>
          </div>
        </div>
        <div className="dialog__actions">
          <button className="btn" onClick={() => onInsert('marker')}>
            [TOC] 标记
          </button>
          <button className="btn btn--primary" onClick={() => onInsert('github')}>
            GitHub 兼容目录
          </button>
          <button className="btn" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
