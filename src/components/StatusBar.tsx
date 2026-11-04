import { useApp } from '../store/app'
import { IconWarning } from './Icons'

export function StatusBar({
  onReload,
  onKeepMine,
  onChooseImageMode,
}: {
  onReload: () => void
  onKeepMine: () => void
  onChooseImageMode: () => void
}) {
  const tabs = useApp((s) => s.tabs)
  const activeId = useApp((s) => s.activeId)
  const settings = useApp((s) => s.settings)
  const zoom = useApp((s) => s.zoom)
  const active = tabs.find((t) => t.id === activeId) ?? null

  const status = (() => {
    if (!active) return null
    if (active.saveStatus === 'saving') return <span className="sb__muted">保存中…</span>
    if (active.saveStatus === 'error')
      return <span className="sb__err">保存失败：{active.saveMessage}</span>
    if (active.conflict)
      return (
        <span className="sb__err">
          <IconWarning width={12} height={12} /> 文件已在外部被修改
        </span>
      )
    if (active.dirty) return <span className="sb__muted">未保存</span>
    if (active.savePath) return <span className="sb__ok">已保存</span>
    return <span className="sb__muted">草稿（尚未落盘）</span>
  })()

  return (
    <footer className="statusbar">
      <div className="sb__left">
        {status}
        {active?.conflict && (
          <>
            <button className="sb__link" onClick={onReload}>
              重新载入
            </button>
            <button className="sb__link" onClick={onKeepMine}>
              保留我的版本
            </button>
          </>
        )}
      </div>
      <div className="sb__right">
        <button className="sb__link" onClick={onChooseImageMode} title="保存图片的方式">
          图片：{settings.imageMode === 'base64' ? '内联 base64' : '相对路径'}
        </button>
        <span className="sb__muted">{Math.round(zoom * 100)}%</span>
        <span className="sb__muted">
          {active?.savePath ? shorten(active.savePath) : '未保存到磁盘'}
        </span>
      </div>
    </footer>
  )
}

function shorten(path: string): string {
  const parts = path.split(/[\\/]/)
  if (parts.length <= 3) return path
  return `…/${parts.slice(-2).join('/')}`
}
