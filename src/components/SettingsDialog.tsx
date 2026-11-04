import { useEffect } from 'react'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import type { AppSettings, CrepeTheme, EditorFontFamily, ThemeMode } from '@shared/types'
import { useApp } from '../store/app'

const THEME_LABELS: Record<ThemeMode, string> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
}

const CREPE_THEME_LABELS: Record<CrepeTheme, string> = {
  app: '跟随应用（暖色）',
  frame: 'Frame（中性灰）',
  classic: 'Classic（暖纸）',
  nord: 'Nord（冷灰）',
}

const FONT_LABELS: Record<EditorFontFamily, string> = {
  serif: '衬线（宋体风格）',
  sans: '无衬线',
  mono: '等宽',
}

const WIDTHS = [
  { label: '窄（640px）', value: 640 },
  { label: '标准（760px）', value: 760 },
  { label: '宽（920px）', value: 920 },
  { label: '全宽', value: 0 },
]

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useApp((s) => s.settings)
  const update = useApp((s) => s.updateSettings)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const patch = (next: Partial<AppSettings>) => update(next)

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog dialog--settings" onClick={(e) => e.stopPropagation()}>
        <h3>设置</h3>
        <p className="dialog__hint">修改会立即生效并保存。</p>

        <div className="settings">
          <section className="settings__group">
            <h4>外观</h4>
            <label className="settings__row">
              <span>主题</span>
              <select
                value={settings.theme}
                onChange={(e) => patch({ theme: e.target.value as ThemeMode })}
              >
                {(Object.keys(THEME_LABELS) as ThemeMode[]).map((key) => (
                  <option key={key} value={key}>
                    {THEME_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings__row">
              <span>Crepe 主题</span>
              <select
                value={settings.crepeTheme}
                onChange={(e) => patch({ crepeTheme: e.target.value as CrepeTheme })}
              >
                {(Object.keys(CREPE_THEME_LABELS) as CrepeTheme[]).map((key) => (
                  <option key={key} value={key}>
                    {CREPE_THEME_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="settings__group">
            <h4>正文</h4>
            <label className="settings__row">
              <span>显示宽度</span>
              <select
                value={settings.contentWidth}
                onChange={(e) => patch({ contentWidth: Number(e.target.value) })}
              >
                {WIDTHS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings__row">
              <span>字体</span>
              <select
                value={settings.fontFamily}
                onChange={(e) => patch({ fontFamily: e.target.value as EditorFontFamily })}
              >
                {(Object.keys(FONT_LABELS) as EditorFontFamily[]).map((key) => (
                  <option key={key} value={key}>
                    {FONT_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings__row">
              <span>字号</span>
              <input
                type="range"
                min={14}
                max={22}
                step={1}
                value={settings.fontSize}
                onChange={(e) => patch({ fontSize: Number(e.target.value) })}
              />
              <b className="settings__value">{settings.fontSize}px</b>
            </label>
          </section>

          <section className="settings__group">
            <h4>打开文档</h4>
            <label className="settings__row">
              <span>图片内嵌为 base64</span>
              <input
                type="checkbox"
                checked={settings.openInlineImages}
                onChange={(e) => patch({ openInlineImages: e.target.checked })}
              />
            </label>
            <p className="settings__hint">
              打开 Word / PPT / Excel 等文档时，把内嵌图片直接写成 data URI；文档自包含，但体积约增加
              33%，保存时保持内嵌。PDF 无法提取内嵌图片。
            </p>
          </section>
        </div>

        <div className="dialog__actions">
          <button
            className="btn"
            onClick={() =>
              update({
                theme: DEFAULT_SETTINGS.theme,
                crepeTheme: DEFAULT_SETTINGS.crepeTheme,
                contentWidth: DEFAULT_SETTINGS.contentWidth,
                fontFamily: DEFAULT_SETTINGS.fontFamily,
                fontSize: DEFAULT_SETTINGS.fontSize,
                imageMode: DEFAULT_SETTINGS.imageMode,
                autoSaveDelay: DEFAULT_SETTINGS.autoSaveDelay,
                sidebarVisible: DEFAULT_SETTINGS.sidebarVisible,
                sidebarWidth: DEFAULT_SETTINGS.sidebarWidth,
                openInlineImages: DEFAULT_SETTINGS.openInlineImages,
              })
            }
          >
            恢复默认
          </button>
          <button className="btn btn--primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  )
}
