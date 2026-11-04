import { useMemo, useState, type ReactNode } from 'react'
import type { OutlineItem } from '../lib/outline'

interface OutlineProps {
  items: OutlineItem[]
  activeId: string | null
  onScrollTo: (item: OutlineItem) => void
  onSelectSection: (item: OutlineItem) => void
  /** 固定在大纲底部的字数 / 保存状态等信息 */
  footer?: ReactNode
}

export function Outline({ items, activeId, onScrollTo, onSelectSection, footer }: OutlineProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // 折叠某一章 = 隐藏落在它 [pos, end) 区间内的所有子标题。
  // 用 end 判断比"找最近的更高级标题"简单，也能正确处理多层嵌套折叠。
  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          !items.some(
            (parent) =>
              collapsed.has(parent.id) && item.pos > parent.pos && item.pos < parent.end,
          ),
      ),
    [items, collapsed],
  )

  const hasChildren = (item: OutlineItem) =>
    items.some((other) => other.pos > item.pos && other.level > item.level && other.pos < item.end)

  return (
    <aside className="outline">
      <div className="outline__head">
        <span>大纲</span>
        {items.length > 0 && <span className="outline__hint">双击选取整章</span>}
      </div>

      {items.length === 0 ? (
        <div className="outline__empty">
          还没有标题。
          <br />
          用 <b>标题 1/2/3</b> 插入后，这里会自动生成大纲。
        </div>
      ) : (
        <div className="outline__list">
          {visible.map((item) => {
            const child = hasChildren(item)
            const isCollapsed = collapsed.has(item.id)
            return (
              <div
                key={item.id}
                className={`outline__item${activeId === item.id ? ' is-active' : ''}`}
                style={{ paddingLeft: 10 + (item.level - 1) * 12 }}
                onClick={() => onScrollTo(item)}
                onDoubleClick={() => onSelectSection(item)}
                title={`${item.text}\n单击：滚动到此　双击：选中整章`}
                role="button"
                tabIndex={-1}
              >
                <span
                  className={`outline__chevron${child ? '' : ' is-hidden'}${
                    isCollapsed ? ' is-collapsed' : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setCollapsed((prev) => {
                      const next = new Set(prev)
                      if (next.has(item.id)) next.delete(item.id)
                      else next.add(item.id)
                      return next
                    })
                  }}
                >
                  ▸
                </span>
                <span className={`outline__text outline__text--h${item.level}`}>
                  {item.text || '(空标题)'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {footer}
    </aside>
  )
}
