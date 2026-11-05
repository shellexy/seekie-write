import { useEffect } from 'react'

export interface TopBarMenuProps {
  open: boolean
  onClose: () => void
  onUndo: () => void
  onRedo: () => void
  onFind: () => void
  onReplace: () => void
  onSource: () => void
  onSettings: () => void
  onAbout: () => void
}

/** Crepe 顶栏最右侧 ⋮ 的 React 下拉菜单 */
export function TopBarMenu({
  open,
  onClose,
  onUndo,
  onRedo,
  onFind,
  onReplace,
  onSource,
  onSettings,
  onAbout,
}: TopBarMenuProps) {
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.topbar-menu')) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  const item = (label: string, hint: string, action: () => void) => (
    <button
      className="topbar-menu__item"
      onClick={() => {
        onClose()
        action()
      }}
    >
      <span>{label}</span>
      <span className="topbar-menu__hint">{hint}</span>
    </button>
  )

  return (
    <div
      className="topbar-menu"
      style={{
        top:
          (document.querySelector('.milkdown-top-bar')?.getBoundingClientRect().bottom ?? 84) + 4,
        right: 12,
      }}
    >
      {item('撤销', 'Ctrl+Z', onUndo)}
      {item('重做', 'Ctrl+Shift+Z', onRedo)}
      <div className="topbar-menu__sep" />
      {item('查找', 'Ctrl+F', onFind)}
      {item('替换', 'Ctrl+H', onReplace)}
      <div className="topbar-menu__sep" />
      {item('查看源码', '', onSource)}
      {item('设置', 'Ctrl+,', onSettings)}
      <div className="topbar-menu__sep" />
      {item('关于', '', onAbout)}
    </div>
  )
}
