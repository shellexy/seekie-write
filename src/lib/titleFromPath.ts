export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

/** 无标题文档编号 */
let untitled = 0
export function nextUntitled(): string {
  untitled += 1
  return `未命名-${untitled}`
}

export function tabId(): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `t${Date.now().toString(36)}${rand}`
}
