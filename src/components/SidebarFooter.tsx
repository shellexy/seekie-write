import { useApp } from '../store/app'
import { formatNumber } from '../lib/wordcount'
import { IconWarning } from './Icons'

/**
 * 大纲底部的信息区：字数 / 选中字数 / 保存状态 / 冲突操作 / 图片策略 / 缩放。
 * 取代原先占据整个窗口底部的状态栏，把高度还给正文。
 */
export function SidebarFooter({
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
  const wordCount = useApp((s) => s.wordCount)
  const selCount = useApp((s) => s.selCount)
  const charset = useApp((s) => s.charset)
  const active = tabs.find((t) => t.id === activeId) ?? null

  const status = (() => {
    if (!active) return <span className="sb__muted">没有打开的文档</span>
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
    <footer className="sidebar-footer">
      <div className="sf__count" title="字数 / 选中 / 字符数 / 段落数">
        <b>{formatNumber(wordCount)}</b>
        <span>字</span>
        {selCount > 0 && (
          <span className="sf__sel">· 选中 {formatNumber(selCount)}</span>
        )}
        <span className="sf__detail">
          · {formatNumber(charset.chars)} 字符 · {formatNumber(charset.paragraphs)} 段
        </span>
      </div>

      <div className="sf__row">{status}</div>

      {active?.conflict && (
        <div className="sf__row sf__actions">
          <button className="sb__link" onClick={onReload}>
            重新载入
          </button>
          <button className="sb__link" onClick={onKeepMine}>
            保留我的版本
          </button>
        </div>
      )}

      <div className="sf__row sf__meta">
        <button className="sb__link" onClick={onChooseImageMode} title="保存图片的方式">
          图片：{settings.imageMode === 'base64' ? '内联 base64' : '相对路径'}
        </button>
        <span>{Math.round(zoom * 100)}%</span>
      </div>
    </footer>
  )
}
