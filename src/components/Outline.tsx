import { useMemo, useState } from 'react'
import type { OutlineItem } from '../lib/outline'

interface OutlineProps {
  items: OutlineItem[]
  activeId: string | null
  onScrollTo: (item: OutlineItem) => void
  onSelectSection: (item: OutlineItem) => void
}

export function Outline({ items, activeId, onScrollTo, onSelectSection }: OutlineProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const visible = useMemo(() => {
    const result: OutlineItem[] = []
    let minLevel = 7
    for (const item of items) {
      // 隐藏被折叠父级的子孙
      if (collapsed.size > 0) {
        const parent = items.find(
          (p) => p.pos < item.pos && p.level < item.level && collapsed.has(p.id),
        )
        if (parent) continue
      }
      if (item.level <= minLevel || collapsed.size === 0) {
        /* keep */
      }
      result.push(item)
    }
    return result
  }, [items, collapsed])

  const hasChildren = (item: OutlineItem) =>
    items.some((other) => other.pos > item.pos && other.level > item.level && other.pos < item.end)

  if (items.length === 0) {
    return (
      <aside className="outline">
        <div className="outline__head">
          <span>大纲</span>
        </div>
        <div className="outline__empty">
          还没有标题。
          <br />
          用 <b>标题 1/2/3</b> 插入后，这里会自动生成大纲。
        </div>
      </aside>
    )
  }

  return (
    <aside className="outline">
      <div className="outline__head">
        <span>大纲</span>
        <span className="outline__hint">双击选取整章</span>
      </div>
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
    </aside>
  )
}
