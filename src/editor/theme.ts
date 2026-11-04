import type { CrepeTheme, EditorFontFamily } from '@shared/types'

import frameCss from '@milkdown/crepe/theme/frame.css?inline'
import frameDarkCss from '@milkdown/crepe/theme/frame-dark.css?inline'
import classicCss from '@milkdown/crepe/theme/classic.css?inline'
import classicDarkCss from '@milkdown/crepe/theme/classic-dark.css?inline'
import nordCss from '@milkdown/crepe/theme/nord.css?inline'
import nordDarkCss from '@milkdown/crepe/theme/nord-dark.css?inline'

/**
 * Crepe 主题 = 一组 CSS 变量。运行时把选中的主题写进 <style id="crepe-theme">，
 * 并放到 head 末尾，让它覆盖 seekie-write 的默认配色；
 * 'app' 表示不注入，完全跟随应用自己的暖色 token。
 */
const THEME_CSS: Record<Exclude<CrepeTheme, 'app'>, [light: string, dark: string]> = {
  frame: [frameCss, frameDarkCss],
  classic: [classicCss, classicDarkCss],
  nord: [nordCss, nordDarkCss],
}

export function applyCrepeTheme(theme: CrepeTheme, dark: boolean): void {
  let style = document.getElementById('crepe-theme') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = 'crepe-theme'
    document.head.appendChild(style)
  }
  const css = theme === 'app' ? '' : (THEME_CSS[theme]?.[dark ? 1 : 0] ?? '')
  if (style.textContent !== css) style.textContent = css
  // 移动到最后，确保在应用自己的 crepe-overrides 之后
  document.head.appendChild(style)
}

export const FONT_STACKS: Record<EditorFontFamily, string> = {
  serif: "'Noto Serif SC', Georgia, Cambria, 'Songti SC', 'Source Han Serif SC', serif",
  sans: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
}

/** 字号 / 字族 / 正文宽度都走 CSS 变量，Crepe 的 .ProseMirror 规则直接消费 */
export function applyEditorTypography(
  fontFamily: EditorFontFamily,
  fontSize: number,
  contentWidth: number,
): void {
  const root = document.documentElement
  root.style.setProperty('--font-body', FONT_STACKS[fontFamily])
  root.style.setProperty('--editor-font-size', `${fontSize}px`)
  root.style.setProperty('--content-width', contentWidth > 0 ? `${contentWidth}px` : 'none')

  // 主题 CSS 会定义 --crepe-font-*，用 inline 变量压过它，保证字体设置始终生效
  const milkdown = document.querySelector<HTMLElement>('#crepe-root .milkdown')
  if (milkdown) {
    milkdown.style.setProperty('--crepe-font-default', FONT_STACKS[fontFamily])
    milkdown.style.setProperty('--crepe-font-title', FONT_STACKS[fontFamily])
    milkdown.style.setProperty('--crepe-base-font-size', `${fontSize}px`)
  }
}
