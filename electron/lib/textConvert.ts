import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

/**
 * GfmEscape 的语义：每一行 = 一个独立段落。
 * 空行直接跳过，不产生空段落；单换行不会加反斜杠，也不会被折叠。
 */
let escapeLine: ((line: string) => string) | null = null

async function getEscaper(): Promise<(line: string) => string> {
  if (escapeLine) return escapeLine
  const mod = await import('gfm-escape')
  const GfmEscape = mod.default
  const escaper = new GfmEscape(
    { table: true, strikethrough: true },
    GfmEscape.Syntax.text,
  )
  escapeLine = (line: string) => escaper.escape(line)
  return escapeLine
}

export async function txtToMarkdown(raw: string): Promise<string> {
  const escape = await getEscaper()
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '')
    .map((line) => escape(line))
    .join('\n\n')
}

/** 源码文件用围栏代码块保留缩进与换行，不按纯文本拆段 */
const SOURCE_LANG: Record<string, string> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.fish': 'fish',
  '.ps1': 'powershell',
  '.sql': 'sql',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.ini': 'ini',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.xml': 'xml',
  '.svg': 'xml',
}

function fencedCode(raw: string, lang: string): string {
  const body = raw.replace(/\r\n?/g, '\n').replace(/\s+$/, '')
  let fence = '````'
  while (body.includes(fence)) fence += '`'
  return `${fence}${lang}\n${body}\n${fence}\n`
}

/** 纯文本 / 源码文件 → Markdown */
export async function convertPlainTextFile(filePath: string): Promise<string> {
  const raw = readFileSync(filePath, 'utf8')
  const lang = SOURCE_LANG[extname(filePath).toLowerCase()]
  if (lang) return fencedCode(raw, lang)
  return txtToMarkdown(raw)
}

/** HTML / XHTML / MHTML → Markdown */
export async function convertHtmlFile(filePath: string): Promise<string> {
  const { toMarkdown } = await import('@mdgate/html')
  const bytes = new Uint8Array(readFileSync(filePath))
  return toMarkdown(bytes, { path: filePath })
}

/** 粘贴的纯文本 → Markdown（每行一个段落，GfmEscape 转义） */
export async function plainTextToMarkdown(text: string): Promise<string> {
  return txtToMarkdown(text)
}
