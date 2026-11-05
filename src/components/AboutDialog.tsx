import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/types'
import appIcon from '../../build/icon.png'
import { api } from '../lib/api'

// 固定成绝对 URL：编辑器会按当前文件的目录切换 <base>，相对路径会跟着跑偏
const appIconUrl = new URL(appIcon, import.meta.url).href

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    void api.app.info().then((value) => {
      if (alive) setInfo(value)
    })
    return () => {
      alive = false
    }
  }, [open])

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
        className="dialog dialog--about"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="关于 seekie-write"
      >
        <img className="about-icon" src={appIconUrl} alt="seekie-write" width={200} height={200} />
        <h3 className="dialog__title">seekie-write</h3>
        <p className="dialog__hint">所见即所得的 Markdown 编辑器</p>
        <dl className="about-list">
          <div className="about-list__row">
            <dt>首页</dt>
            <dd>
              <a
                href={info?.homepage ?? 'https://github.com/shellexy/seekie-write'}
                target="_blank"
                rel="noreferrer"
              >
                {info?.homepage ?? 'https://github.com/shellexy/seekie-write'}
              </a>
            </dd>
          </div>
          <div className="about-list__row">
            <dt>版本</dt>
            <dd>{info?.version ?? '…'}</dd>
          </div>
          <div className="about-list__row">
            <dt>Electron</dt>
            <dd>{info?.electron ?? '…'}</dd>
          </div>
          <div className="about-list__row">
            <dt>Node.js</dt>
            <dd>{info?.node ?? '…'}</dd>
          </div>
          <div className="about-list__row">
            <dt>许可协议</dt>
            <dd>MIT</dd>
          </div>
        </dl>
        <div className="dialog__actions">
          <button className="btn btn--primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
