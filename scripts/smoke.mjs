#!/usr/bin/env node
/**
 * Linux 冒烟测试：Xvfb + Electron 远程调试 + CDP。
 *
 * 运行：npm run smoke（会先 build）
 * 只跑脚本：npm run smoke:only
 * 调试：SMOKE_KEEP=1 npm run smoke:only
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import WebSocket from 'ws'

const root = process.cwd()
const smokeDir = join(root, '.smoke')
const autoPath = join(smokeDir, 'auto.md')
const smartPath = join(smokeDir, 'smart.md')
const plainPath = join(smokeDir, 'plain.txt')
const htmlPath = join(smokeDir, 'page.html')
const samplePath = join(root, 'samples', '示例笔记.md')
const readmePath = join(root, 'README.md')
const electronBin = join(root, 'node_modules', '.bin', 'electron')

const results = []
let failed = 0
function check(name, ok, extra = '') {
  results.push({ name, ok })
  if (!ok) failed += 1
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`)
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 9333))
    })
  })
}

async function waitForPage(port, timeoutMs = 45000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find(
        (item) =>
          item.type === 'page' &&
          item.webSocketDebuggerUrl &&
          !(item.url || '').includes('seekie-print-preview'),
      )
      if (page) return page
    } catch {
      /* app not ready */
    }
    await delay(300)
  }
  throw new Error('等待 Electron 调试端口超时')
}

async function createCdp(page) {
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })
  await new Promise((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })
  let seq = 0
  const pending = new Map()
  ws.on('message', (raw) => {
    const message = JSON.parse(raw.toString())
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(JSON.stringify(message.error)))
    else resolve(message.result)
  })
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  const ev = async (expression) => {
    const result = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    }
    return result.result.value
  }
  await call('Runtime.enable')
  await call('Page.enable')
  return { ws, call, ev }
}

let child = null
let cdp = null
let stderr = ''

try {
  if (!existsSync(join(root, 'out', 'main', 'index.js'))) {
    throw new Error('找不到 out/main/index.js，请先执行 npm run build')
  }
  if (!existsSync(samplePath)) throw new Error(`缺少示例文件：${samplePath}`)
  if (!existsSync(readmePath)) throw new Error(`缺少 README.md：${readmePath}`)

  rmSync(smokeDir, { recursive: true, force: true })
  mkdirSync(join(smokeDir, 'config'), { recursive: true })
  writeFileSync(autoPath, '# Auto2\n\nbase line\n', 'utf8')
  writeFileSync(
    smartPath,
    '# 已有标题\n\n第一卷 开端\n\n第一章 测试\n\n1.1 粗体小节\n',
    'utf8',
  )
  writeFileSync(plainPath, '第一行文字\n第二行文字\n\n第三行文字\n', 'utf8')
  writeFileSync(
    htmlPath,
    '<!doctype html><html><body><h1>HTML 标题</h1><ul><li>a</li><li>b</li></ul></body></html>',
    'utf8',
  )

  const port = await freePort()
  const env = {
    ...process.env,
    LIBGL_ALWAYS_SOFTWARE: '1',
    __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/50_mesa.json',
    XDG_CONFIG_HOME: join(smokeDir, 'config'),
    XDG_CACHE_HOME: join(smokeDir, 'cache'),
  }
  child = spawn(
    'xvfb-run',
    [
      '-a',
      '-s',
      '-screen 0 1280x900x24 -extension GLX',
      electronBin,
      '.',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${port}`,
      samplePath,
    ],
    { cwd: root, env, detached: true, stdio: ['ignore', 'ignore', 'pipe'] },
  )
  child.stderr?.on('data', (chunk) => {
    stderr += chunk.toString()
  })

  const page = await waitForPage(port)
  cdp = await createCdp(page)
  await delay(5000)

  const tabs = () =>
    cdp.ev(
      `[...document.querySelectorAll('.tab')].map((t) => ({
        name: t.querySelector('.tab__label')?.textContent ?? '',
        mark: t.querySelector('.tab__state')?.textContent ?? '',
      }))`,
    )
  const activeName = () => cdp.ev(`document.querySelector('.tab.is-active .tab__label')?.textContent ?? ''`)
  const activeMark = () => cdp.ev(`document.querySelector('.tab.is-active .tab__state')?.textContent ?? ''`)
  const openPath = async (path) => {
    await cdp.ev(`window.seekie.file.openPath(${JSON.stringify(path)})`)
    await delay(700)
  }
  const clickMore = async () => {
    const rect = await cdp.ev(`(() => {
      const button = document.querySelector('.editor-more')
      if (!button) return null
      const r = button.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })()`)
    if (!rect) throw new Error('找不到顶栏 ⋮ 按钮')
    await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
    await delay(400)
  }
  const pressEscape = () =>
    cdp.ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  const pressUndo = async () => {
    await cdp.call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      modifiers: 2,
      key: 'z',
      code: 'KeyZ',
      windowsVirtualKeyCode: 90,
      nativeVirtualKeyCode: 90,
    })
    await cdp.call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      modifiers: 2,
      key: 'z',
      code: 'KeyZ',
      windowsVirtualKeyCode: 90,
      nativeVirtualKeyCode: 90,
    })
    await delay(500)
  }

  const initial = await tabs()
  check('启动文件只开一个标签', initial.length === 1 && initial[0].name.includes('示例笔记'), JSON.stringify(initial))
  check('正文加载', await cdp.ev(`(document.querySelector('.ProseMirror')?.innerText ?? '').includes('示例笔记')`))

  await openPath(samplePath)
  const afterDuplicate = await tabs()
  check('重复打开同一文件不新增标签', afterDuplicate.length === 1, JSON.stringify(afterDuplicate))

  await cdp.ev(`document.querySelector('.titlebar button[aria-label="新建"]')?.click()`)
  await delay(500)
  check(
    '新建文档正文为空',
    (await cdp.ev(`document.querySelector('.ProseMirror')?.innerText.trim() ?? ''`)) === '',
  )
  check('新建标签临时名为新文档-N', /^新文档-\d+$/.test(await activeName()), await activeName())
  await cdp.ev(`document.querySelector('.tab.is-active .tab__close')?.click()`)
  await delay(500)

  await openPath(readmePath)
  await delay(1800)
  const readmeTabs = await tabs()
  const base = await cdp.ev(`document.querySelector('base')?.getAttribute('href') ?? null`)
  const imageWidths = await cdp.ev(
    `[...document.querySelectorAll('.ProseMirror img')].map((img) => img.naturalWidth)`,
  )
  check('打开 README.md 新增标签', readmeTabs.length === 2, JSON.stringify(readmeTabs))
  check('本地相对图片路径挂 base', typeof base === 'string' && base.startsWith('seekie-local://'), String(base))
  check('README 图片实际加载', imageWidths.some((width) => width > 0), JSON.stringify(imageWidths))
  await openPath(readmePath)
  check('重复打开 README 不新增标签', (await tabs()).length === 2)

  await openPath(autoPath)
  check('打开测试 md', (await activeName()) === 'auto.md', await activeName())
  check('打开后不误报 dirty', (await activeMark()) === '')

  const mtimeBefore = readFileSync(autoPath, 'utf8')
  const textBefore = await cdp.ev(`document.querySelector('.ProseMirror')?.innerText ?? ''`)
  const mtime0 = statSync(autoPath).mtimeMs
  await cdp.ev(`document.querySelector('.ProseMirror')?.focus()`)
  await cdp.call('Input.insertText', { text: 'SMOKE_TEMP' })
  await delay(100)
  await cdp.call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    modifiers: 2,
    key: 'z',
    code: 'KeyZ',
    windowsVirtualKeyCode: 90,
    nativeVirtualKeyCode: 90,
  })
  await cdp.call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    modifiers: 2,
    key: 'z',
    code: 'KeyZ',
    windowsVirtualKeyCode: 90,
    nativeVirtualKeyCode: 90,
  })
  await delay(800)
  const textAfter = await cdp.ev(`document.querySelector('.ProseMirror')?.innerText ?? ''`)
  const mtimeAfterUndo = statSync(autoPath).mtimeMs
  check('撤销回原内容后清掉 dirty', (await activeMark()) === '')
  check('撤销回原内容不触发自动保存', mtimeAfterUndo === mtime0, `${mtime0} → ${mtimeAfterUndo}`)
  check('撤销后正文恢复', textAfter === textBefore)
  check('撤销后文件内容未变', readFileSync(autoPath, 'utf8') === mtimeBefore)

  await cdp.call('Input.insertText', { text: 'SMOKE_OK' })
  await delay(1600)
  check('真实修改自动保存', readFileSync(autoPath, 'utf8').includes('SMOKE_OK'))
  check('自动保存后 dirty 清空', (await activeMark()) === '')

  await openPath(smartPath)
  await cdp.ev(`document.querySelector('.outline__more')?.click()`)
  await delay(250)
  await cdp.ev(
    `[...document.querySelectorAll('.outline-menu__item')].find((b) => b.textContent.includes('智能识别标题'))?.click()`,
  )
  await delay(500)
  const smartRows = await cdp.ev(`[...document.querySelectorAll('.smart-headings__row')].map((row) => ({
    text: row.querySelector('.smart-headings__text')?.textContent ?? '',
    checked: row.querySelector('input[type="checkbox"]')?.checked,
    level: row.querySelector('select')?.value,
    score: row.querySelector('.smart-headings__score')?.textContent ?? '',
  }))`)
  check(
    '智能识别标题候选预览',
    smartRows.some((row) => row.text.includes('第一卷') && row.checked) &&
      smartRows.some((row) => row.text.includes('第一章') && row.checked) &&
      smartRows.some((row) => row.text.includes('粗体小节') && !row.checked),
    JSON.stringify(smartRows),
  )
  const smartWarn = await cdp.ev(`document.querySelector('.smart-headings__warn')?.textContent ?? ''`)
  check(
    '已有标题原样进入预览',
    smartRows.some((row) => row.text === '已有标题' && row.score === '已有'),
    JSON.stringify(smartRows),
  )
  check('智能识别提示覆盖现有标题', smartWarn.includes('覆盖现有标题'), smartWarn)
  await cdp.ev(
    `[...document.querySelectorAll('.dialog--smart-headings .btn')].find((b) => b.textContent.includes('应用标题'))?.click()`,
  )
  await delay(700)
  const appliedHeadings = await cdp.ev(
    `[...document.querySelectorAll('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3')].map((h) => h.tagName + ':' + h.textContent)`,
  )
  check(
    '应用识别的标题级别',
    appliedHeadings.includes('H1:第一卷 开端') && appliedHeadings.includes('H2:第一章 测试'),
    JSON.stringify(appliedHeadings),
  )
  await pressUndo()
  const undoneHeadings = await cdp.ev(
    `[...document.querySelectorAll('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3')].map((h) => h.textContent)`,
  )
  check(
    '智能识别一次 Ctrl+Z 撤销',
    undoneHeadings.length === 1 && undoneHeadings[0] === '已有标题',
    JSON.stringify(undoneHeadings),
  )

  await openPath(plainPath)
  const plain = await cdp.ev(`({
    title: document.querySelector('.tab.is-active .tab__label')?.textContent ?? '',
    br: document.querySelectorAll('.ProseMirror br').length,
    paragraphs: document.querySelectorAll('.ProseMirror p').length,
    text: document.querySelector('.ProseMirror')?.innerText ?? '',
  })`)
  check(
    '纯文本 txt 每行一段',
    plain.title === 'plain.txt.md' &&
      plain.br === 0 &&
      plain.paragraphs >= 3 &&
      plain.text.includes('第一行文字') &&
      plain.text.includes('第二行文字'),
    JSON.stringify(plain),
  )

  await openPath(htmlPath)
  const htmlConverted = await cdp.ev(`({
    title: document.querySelector('.tab.is-active .tab__label')?.textContent ?? '',
    h1: document.querySelector('.ProseMirror h1')?.textContent ?? '',
    items: [...document.querySelectorAll('.ProseMirror li')].map((li) => li.textContent.trim()),
  })`)
  check(
    'HTML 转 Markdown',
    htmlConverted.title === 'page.html.md' &&
      htmlConverted.h1 === 'HTML 标题' &&
      htmlConverted.items.join(',') === 'a,b',
    JSON.stringify(htmlConverted),
  )

  await openPath(autoPath)
  await cdp.ev(`document.querySelector('.ProseMirror')?.focus()`)
  await cdp.ev(`window.seekie.clipboard.write({ text: 'PASTE1\\nPASTE2' })`)
  await cdp.call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    modifiers: 2,
    key: 'v',
    code: 'KeyV',
    windowsVirtualKeyCode: 86,
    nativeVirtualKeyCode: 86,
  })
  await cdp.call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    modifiers: 2,
    key: 'v',
    code: 'KeyV',
    windowsVirtualKeyCode: 86,
    nativeVirtualKeyCode: 86,
  })
  await delay(1200)
  const pasted = await cdp.ev(`({
    text: document.querySelector('.ProseMirror')?.innerText ?? '',
    br: document.querySelectorAll('.ProseMirror br').length,
    paragraphs: document.querySelectorAll('.ProseMirror p').length,
  })`)
  check(
    '纯文本粘贴每行一段',
    pasted.br === 0 &&
      pasted.paragraphs > 1 &&
      pasted.text.includes('PASTE1') &&
      pasted.text.includes('PASTE2') &&
      !pasted.text.includes('PASTE1 PASTE2'),
    JSON.stringify(pasted),
  )

  await clickMore()
  const menuItems = await cdp.ev(
    `[...document.querySelectorAll('.topbar-menu__item')].map((b) => b.textContent)`,
  )
  check(
    '⋮ 菜单项齐全',
    ['撤销', '重做', '查找', '替换', '查看 Markdown 源码', '设置', '关于'].every((label) =>
      menuItems.some((item) => item.includes(label)),
    ),
    JSON.stringify(menuItems),
  )
  await cdp.ev(
    `[...document.querySelectorAll('.topbar-menu__item')].find((b) => b.textContent.includes('关于'))?.click()`,
  )
  await delay(600)
  const about = await cdp.ev(`(() => {
    const icon = document.querySelector('.about-icon')
    return icon ? { width: icon.width, natural: icon.naturalWidth } : null
  })()`)
  check('关于图标 200×200', about?.width === 200 && (about?.natural ?? 0) > 0, JSON.stringify(about))
  await pressEscape()

  try {
    await cdp.ev(`window.seekie.window.close()`)
  } catch {
    /* 窗口关闭后连接会断 */
  }
  await delay(1200)
  console.log(`\n${failed === 0 ? '全部通过' : `${failed} 项失败`}（${results.length} 项检查）`)
} catch (error) {
  failed += 1
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`)
  if (stderr) console.error(`\nElectron stderr:\n${stderr.slice(-3000)}`)
} finally {
  if (cdp) {
    try {
      cdp.ws.close()
    } catch {
      /* ignore */
    }
  }
  if (child) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      /* ignore */
    }
    await delay(500)
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      /* ignore */
    }
  }
  if (!process.env.SMOKE_KEEP) rmSync(smokeDir, { recursive: true, force: true })
  process.exit(failed === 0 ? 0 : 1)
}
