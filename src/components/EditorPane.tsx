import { useEffect, useRef } from 'react'

/**
 * Crepe 实例的唯一挂载点。多标签切换只换 EditorState，不重建 DOM。
 */
export function EditorPane({
  onReady,
}: {
  onReady: (root: HTMLDivElement) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) onReady(ref.current)
  }, [onReady])

  return (
    <div className="editor-pane">
      <div className="editor-scroll">
        <div id="crepe-root" ref={ref} className="crepe-host" />
      </div>
    </div>
  )
}
