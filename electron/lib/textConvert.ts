import { readFileSync } from 'node:fs'

/**
 * 纯文本 / 源码 → Markdown，以及 HTML → Markdown。
 *
 * 纯文本里单个换行在 Markdown 里是软换行，编辑器会显示成连续一行；
 * 这里给非空行尾补两个空格，转成硬换行，空行仍作为段落分隔。
 */
function hardenPlainTextNewlines(markdown: string): string {
  // 源码文件会被 mdgate/text 包成 ``` 代码块，不能在里面改行尾
  if (/^```/.test(markdown.trimStart())) return markdown
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  return lines
    .map((line, index) => {
      const next = lines[index + 1]
      if (line === '' || next === undefined || next === '') return line
      if (line.endsWith('  ') || line.endsWith('\\')) return line
      return `${line}  `
    })
    .join('\n')
}

/** .txt / 源码 / 未知文本：@mdgate/text 根据 path 决定按段落还是代码块处理 */
export async function convertPlainTextFile(filePath: string): Promise<string> {
  const { toMarkdown } = await import('@mdgate/text')
  const bytes = new Uint8Array(readFileSync(filePath))
  const markdown = await toMarkdown(bytes, { path: filePath })
  return hardenPlainTextNewlines(markdown)
}

/** HTML / XHTML / MHTML → Markdown */
export async function convertHtmlFile(filePath: string): Promise<string> {
  const { toMarkdown } = await import('@mdgate/html')
  const bytes = new Uint8Array(readFileSync(filePath))
  return toMarkdown(bytes, { path: filePath })
}

/** 粘贴的纯文本 → Markdown（按 .txt 处理并硬化单换行） */
export async function plainTextToMarkdown(text: string): Promise<string> {
  const { toMarkdown } = await import('@mdgate/text')
  const bytes = new TextEncoder().encode(text)
  const markdown = await toMarkdown(bytes, { path: 'paste.txt' })
  return hardenPlainTextNewlines(markdown)
}
