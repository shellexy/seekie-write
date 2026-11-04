import { useEffect } from 'react'
import { useApp } from '../store/app'
import type { ImageSaveMode } from '@shared/types'

export function Toast() {
  const toast = useApp((s) => s.toast)
  const dismiss = useApp((s) => s.dismissToast)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(dismiss, toast.kind === 'error' ? 6000 : 3000)
    return () => window.clearTimeout(timer)
  }, [toast, dismiss])

  if (!toast) return null
  return (
    <div className={`toast toast--${toast.kind}`} onClick={dismiss} role="status">
      {toast.text}
    </div>
  )
}

export function ConvertingOverlay() {
  const converting = useApp((s) => s.converting)
  if (!converting.active) return null
  return (
    <div className="overlay">
      <div className="overlay__card">
        <div className="spinner" />
        <div>{converting.label || '正在转换为 Markdown…'}</div>
        <div className="overlay__hint">本地转换，文件不会离开这台电脑</div>
      </div>
    </div>
  )
}

export function ImageModeDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (mode: ImageSaveMode) => void
}) {
  const settings = useApp((s) => s.settings)
  const update = useApp((s) => s.updateSettings)
  const [local, setLocal] = [settings.imageMode, (m: ImageSaveMode) => update({ imageMode: m })]

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>保存图片的方式</h3>
        <p className="dialog__hint">
          文档里的图片（含从 Office / PDF 转换出来的）在保存时如何处理。
        </p>
        <label className={`radio${local === 'relative' ? ' is-on' : ''}`}>
          <input
            type="radio"
            name="imgmode"
            checked={local === 'relative'}
            onChange={() => setLocal('relative')}
          />
          <div>
            <div className="radio__title">保存为相对路径（推荐）</div>
            <div className="radio__desc">
              图片写入 <code>文档名.assets/</code> 目录，markdown 里是相对链接。适合放进 Git 仓库。
            </div>
          </div>
        </label>
        <label className={`radio${local === 'base64' ? ' is-on' : ''}`}>
          <input
            type="radio"
            name="imgmode"
            checked={local === 'base64'}
            onChange={() => setLocal('base64')}
          />
          <div>
            <div className="radio__title">内联 base64</div>
            <div className="radio__desc">
              图片直接嵌进 markdown，单文件即可分享；但体积会增大约 33%，大图建议不要用。
            </div>
          </div>
        </label>
        <div className="dialog__actions">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn--primary" onClick={() => onConfirm(settings.imageMode)}>
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: React.ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="dialog__body">{message}</div>
        <div className="dialog__actions">
          <button className="btn" onClick={onCancel}>
            {cancelText}
          </button>
          <button className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
