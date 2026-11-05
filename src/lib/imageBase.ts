/**
 * 打开的 .md 里的相对图片按“文件所在目录”解析。
 *
 * 做法是给页面挂一个 <base>，指向自定义的 seekie-local:// 协议：
 *   <base href="seekie-local://local/home/me/notes/">
 * 这样 src="img/a.png" 会变成 seekie-local://local/home/me/notes/img/a.png，
 * 主进程只允许读取图片扩展名；Markdown 源文本保持相对路径不变。
 */

/** 取出文件所在目录（含末尾斜杠），统一成正斜杠 */
export function dirOf(filePath: string | null): string | null {
  if (!filePath) return null
  const normalized = filePath.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  if (slash < 0) return null
  return normalized.slice(0, slash + 1)
}

function hrefForFile(filePath: string | null): string | null {
  const dir = dirOf(filePath)
  if (!dir) return null
  const encoded = dir
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `seekie-local://local${encoded}`
}

/** 切换标签 / 保存到新路径时调用；没有文件路径就移除 <base> */
export function applyImageBase(filePath: string | null): void {
  const existing = document.head.querySelector('base')
  const href = hrefForFile(filePath)
  if (!href) {
    existing?.remove()
    return
  }
  const base = existing ?? document.createElement('base')
  if (!existing) document.head.prepend(base)
  if (base.getAttribute('href') !== href) base.setAttribute('href', href)
}
