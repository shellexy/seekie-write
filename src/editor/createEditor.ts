import { Crepe, CrepeFeature } from '@milkdown/crepe'
import { EditorView as CMEditorView } from '@codemirror/view'
import '@milkdown/crepe/theme/common/style.css'
// LaTeX（KaTeX）公式的字体与布局
import 'katex/dist/katex.min.css'
/**
import '@milkdown/crepe/theme/classic.css'
**/
import "@milkdown/crepe/theme/nord.css";
import './crepe-dark.css'
import { crepeFeatures, buildTopBar } from './topBarConfig'
import { putAsset } from '../lib/assets'
import { tocPlugins, tocRemark } from './toc'

/**
 * 代码块用自定义 CodeMirror 主题（跟随 CSS 变量），
 * 不用 Crepe 默认的 oneDark —— 否则浅色主题下代码块会突然变黑。
 */
const codeMirrorTheme = CMEditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: 'var(--fg)',
    fontSize: '13px',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--fg-faint)',
    border: 'none',
  },
  '.cm-activeLine': { backgroundColor: 'var(--hover)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--accent)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--active) !important',
  },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55' },
})

export interface CreateEditorOptions {
  /** 宿主元素：Crepe 会在其中创建 .milkdown 容器 */
  root: HTMLElement
  defaultValue: string
  tabId: string
}

/**
 * 只创建一个 Crepe 实例（内含唯一的 ProseMirror view）。
 * 切标签时替换 EditorState，不重建实例 —— 见 editor/tabs.ts。
 */
export function createEditor(options: CreateEditorOptions): Crepe {
  const { root, defaultValue, tabId } = options

  const crepe = new Crepe({
    root,
    defaultValue,
    features: crepeFeatures as Partial<Record<CrepeFeature, boolean>>,
    featureConfigs: {
      [CrepeFeature.TopBar]: { buildTopBar },
      // 图片统一进内存仓库，保存时按设置决定 base64 / 相对路径
      [CrepeFeature.CodeMirror]: { theme: codeMirrorTheme },
      [CrepeFeature.ImageBlock]: {
        onUpload: (file: File) => putAsset(tabId, file),
        inlineOnUpload: (file: File) => putAsset(tabId, file),
        blockOnUpload: (file: File) => putAsset(tabId, file),
      },
    },
  })

  crepe.editor.config((ctx) => {
    ctx.inject(tocRemark.options.key, {})
  })
  for (const plugin of tocPlugins) crepe.editor.use(plugin)

  return crepe
}

/** 深色主题：Crepe 的 .milkdown 由框架创建，这里等它出现后打标 */
export function applyThemeClass(host: HTMLElement | null, dark: boolean): void {
  if (!host) return
  const apply = () => {
    host.querySelectorAll<HTMLElement>('.milkdown').forEach((el) => {
      el.classList.toggle('theme-dark', dark)
    })
  }
  apply()
  if (!dark) return
  const observer = new MutationObserver(() => {
    apply()
    observer.disconnect()
  })
  observer.observe(host, { childList: true, subtree: true })
}

export { Crepe, CrepeFeature }
