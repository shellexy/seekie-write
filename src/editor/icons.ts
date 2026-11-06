/**
 * 顶部工具栏图标（24x24 SVG 字符串，Crepe 的 Icon 组件走 innerHTML 注入）。
 *
 * 注意：Crepe 的部分主题 CSS 会对图标 `<svg>` 施加 `fill: var(--crepe-color-…)`，
 * 会把 fill="none" 的描边图标直接填成实心块。因此这里每个图标显式写死
 * `fill="none"`（属性优先级高于继承的 CSS 类样式），形状用纯 stroke 表达。
 */
const wrap = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="fill:none;stroke:currentColor">${body}</svg>`

export const BOLD_ICON = wrap(
  '<path d="M7.5 5h4.9a3.4 3.4 0 0 1 0 6.9H7.5z"/><path d="M7.5 11.9h5.7a3.6 3.6 0 0 1 0 7.1H7.5z"/>',
)

export const ITALIC_ICON = wrap('<path d="M15.2 5h-4.6"/><path d="M13.4 19H8.8"/><path d="M14.2 5 9.8 19"/>')

export const STRIKE_ICON = wrap(
  '<path d="M5.5 12h13"/><path d="M16 7.6A4 4 0 0 0 12.4 5.2c-2.3 0-4 1-4 2.7 0 1.1.8 2 2.2 2.6"/><path d="M8 16.4a4 4 0 0 0 3.7 2.4c2.3 0 4-1 4-2.7 0-.6-.2-1.1-.6-1.5"/>',
)

export const CODE_ICON = wrap('<path d="m9.2 8.2-3.6 3.8 3.6 3.8"/><path d="m14.8 8.2 3.6 3.8-3.6 3.8"/>')

export const BULLET_LIST_ICON = wrap(
  '<circle cx="5" cy="7" r="1.15" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="5" cy="17" r="1.15" fill="currentColor" stroke="none"/><path d="M9.2 7h9.8"/><path d="M9.2 12h9.8"/><path d="M9.2 17h9.8"/>',
)

export const ORDERED_LIST_ICON = wrap(
  '<path d="M9.2 7h9.8"/><path d="M9.2 12h9.8"/><path d="M9.2 17h9.8"/><path d="M3.6 6.2h.9v3"/><path d="M3.3 12.2c0-.9.7-1.2 1.2-.7.4.4.2.9-.3 1.6l-.9 1.1h1.8"/>',
)

export const QUOTE_ICON = wrap('<path d="M5.5 5.5v13"/><path d="M9.6 8.2h9.4"/><path d="M9.6 12h9.4"/><path d="M9.6 15.8h5.6"/>')

export const CODE_BLOCK_ICON = wrap(
  '<rect x="3.2" y="4.8" width="17.6" height="14.4" rx="2.2"/><path d="M3.2 8.8h17.6"/><path d="m10.2 12.4-1.8 2 1.8 2"/><path d="m13.8 12.4 1.8 2-1.8 2"/>',
)

export const CLEAR_FORMAT_ICON = wrap(
  '<path d="M4.2 19.2h9.4"/><path d="M8.6 15.6 12.3 5.4a1.5 1.5 0 0 1 2.8 0l1 2.6"/><path d="M4.6 4.6 19.4 19.4"/>',
)

export const IMAGE_ICON = wrap(
  '<rect x="3.2" y="4.8" width="17.6" height="14.4" rx="2.2"/><circle cx="8.6" cy="9.6" r="1.4"/><path d="m4.6 16.9 4.2-4.2 3.2 3.2 2.4-2.4 4.2 4.1"/>',
)

export const TABLE_ICON = wrap(
  '<rect x="3.2" y="4.8" width="17.6" height="14.4" rx="2.2"/><path d="M3.2 9.6h17.6"/><path d="M3.2 14.4h17.6"/><path d="M9.6 4.8v14.4"/><path d="M15 4.8v14.4"/>',
)

export const HR_ICON = wrap(
  '<path d="M4 12h4.2"/><path d="M9.9 12h4.2"/><path d="M15.8 12H20"/>',
)
