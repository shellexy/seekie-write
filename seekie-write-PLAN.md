# seekie-write 开发计划（v0.3 · 改用 Crepe 顶部工具栏）

> 类 Typora 的所见即所得 Markdown 编辑器 · Electron + Milkdown Crepe
> 已确认：**工具栏顶部化（Crepe TopBar）** / 多标签页 + 自动保存 / Linux 优先 / 另存为 `原名.原扩展名.md`
> 日期：2026-11-04

---

## 0. 结论先行：Crepe 的工具栏能不能显示在顶部？

**能，但要分清楚是哪一个工具栏。** Crepe 实际有 **两个** 工具栏，之前的计划里我把它们混为一谈了：

| 特性 | 行为 | 能否顶部化 |
|---|---|---|
| `CrepeFeature.Toolbar`（默认开启） | **浮在选区上方的气泡工具条**，只有 粗体/斜体/删除线/代码/链接/公式/AI | ❌ 位置写死为跟随选区 |
| `CrepeFeature.TopBar`（**默认关闭，需显式开启**） | **固定在编辑器顶部的横条**，`position: sticky; top: 0; min-height: 44px` | ✅ 就是你要的 |

`TopBar` 源码实测（`lib/esm/feature/top-bar/index.js`）：

- 它自己 `document.createElement('div')` 建 `.milkdown-top-bar`，再 `editorRoot.insertBefore(container, editorRoot.firstChild)` —— **挂在 Milkdown 根容器内、ProseMirror 之前**，所以它在窗口里是"编辑器顶部"，不在 Electron 标题栏里。
- 分组可用 `buildTopBar(builder)` **完全重写**（`builder.clear()` 后重建），但 `onRun` 需要自己写，因为内置事件的 key 不可插桩。
- 内置分组正好覆盖你的需求：`heading`（段落 + H1..H6 下拉）、`formatting`（B/I/S/代码）、`list`、`insert`（链接/图片/表格）、`block`（代码块/公式）、`more`（引用/分割线）。
- 内置项**只有图标、没有 label**（`h('button', {...}, h(Icon, {icon: item.icon}))`），天然满足"工具栏按钮使用纯图标"。

```ts
const crepe = new Crepe({
  root: '#editor',
  defaultValue: markdown,
  features: {
    [Crepe.Feature.TopBar]: true,   // ← 默认 false，必须显式打开
    // Toolbar: false,              // ← 建议关掉，见 §3.3
  },
  featureConfigs: {
    [Crepe.Feature.TopBar]: { buildTopBar(b) { /* 自定义分组，见 §3.2 */ } },
  },
})
```

---

## 1. 已锁定决策

| 项 | 决定 |
|---|---|
| 编辑器基座 | **`@milkdown/crepe` 7.23**（含 vue3 / DOMPurify / katex / codemirror language-data 依赖） |
| 顶部工具栏 | `CrepeFeature.TopBar` + `buildTopBar` 定制（纯图标） |
| 标题栏 | 自定义无边框标题栏 = **新建 / 打开 / 保存 三个图标按钮 + 标签条 + 字数统计 + 窗口三键** |
| 保存命名 | `季度报告.docx` → `季度报告.docx.md` |
| 文档模型 | 多标签页；单 Crepe 实例 + 多份 EditorState 快照 |
| 保存 | 自动保存 debounce 800ms + 草稿区 + 冲突检测 |
| 平台 | Linux 优先（X11 + Wayland） |
| 大纲 | 左侧栏默认显示，双击标题选中整章 |

---

## 2. 分工总览（三个横条，各管一段）

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 自定义标题栏（-webkit-app-region: drag，高 40px）                          │
│  [≡] [＋新建][📂打开][💾保存] │ 采购单.docx.md ●  笔记.md │ 字数1,234·选中56 │ ─ □ × │
├──────────────────────────────────────────────────────────────────────────┤
│ Crepe TopBar（sticky，高 44px，纯图标）                                    │
│  [段落▾] │ B I S </> │ • ≡ ☑ │ 🔗 🖼 ⊞ │ {} ƒx │ ❝ ― │ 🧹清除格式          │
├────────────┬─────────────────────────────────────────────────────────────┤
│  大纲      │  Milkdown 正文（ProseMirror）                                │
│  H1 引言   │                                                              │
│   H2 背景  │                                                              │
└────────────┴─────────────────────────────────────────────────────────────┘
```

- 文件级操作（新建/打开/保存）→ 标题栏
- 文字级格式化 → Crepe TopBar
- 底部不再需要状态栏（字数已在标题栏）

---

## 3. 顶部工具栏定制

### 3.1 要做的 11 组按钮，分别归属于哪

| 你的需求 | 落在哪 | 实现 |
|---|---|---|
| 新建 / 打开 / 保存 | 标题栏 | IPC（与菜单共用 handler） |
| 撤销 / 重做 | **不进工具栏** | `Ctrl+Z`/`Ctrl+Shift+Z` + 应用菜单；也可用 `buildTopBar` 加 `undo/redo` 两项（§3.2 有代码） |
| 剪切 / 复制 / 粘贴 | **不进工具栏** | 系统快捷键 `Ctrl+X/C/V`，Electron 菜单 accelerator 天然支持。放进顶部栏容易误触且占宽 |
| 段落 / 标题一/二/三 | TopBar `heading` 组 | Crepe 内置下拉，自带 段落 + H1..H6（比你要求的多 H4..H6，白送） |
| 粗体 / 斜体 / 删除线 | TopBar `formatting` 组 | Crepe 内置，激活态自动高亮 |
| 清除格式 | TopBar 自定义末组 | 自定义 `onRun`（§3.3） |
| 字数统计 | 标题栏右端 | §5 |

如果你想严格做到"这些全都在工具栏里"，也能加，只是顶部栏会变长（下文给了 undo/redo/cut/copy/paste 的接入方法）。

### 3.2 `buildTopBar` 定制代码

```ts
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import { setHeading } from '@milkdown/crepe/feature/top-bar'   // 内部导出，见下方风险

function buildTopBar(builder: GroupBuilder<TopBarItem>) {
  builder.clear()                                  // 丢掉内置分组，自己排

  // 1) 撤销 / 重做（不需要就删掉这段）
  const undoRedo = builder.addGroup('history', 'History')
  undoRedo.addItem('undo', {
    icon: undoIcon,
    active: () => false,
    onRun: (ctx) => ctx.get(editorViewCtx).dispatch(
      ctx.get(editorViewCtx).state.tr   // 实际用 commandsCtx.call(undoCommand.key)
    ),
  })

  // 2) 段落 / H1~H6：用 Crepe 的 heading 选择器（自带下拉与当前态标签）
  builder.addGroup('heading', 'Heading').addItem('heading-selector', {
    ...buildHeadingSelector(
      [{label:'段落',level:null},{label:'标题一',level:1},{label:'标题二',level:2},
       {label:'标题三',level:3},{label:'标题四',level:4},{label:'标题五',level:5},{label:'标题六',level:6}],
    ),
  })

  // 3) 粗体 / 斜体 / 删除线 / 行内代码
  const fmt = builder.addGroup('formatting', 'Formatting')
  fmt.addItem('bold',    { icon: boldIcon,        active: (c)=>isMarkActive(c, strongSchema.type(c)),
                           onRun: (c)=>c.get(commandsCtx).call(toggleStrongCommand.key) })
  fmt.addItem('italic',  { icon: italicIcon,      active: (c)=>isMarkActive(c, emphasisSchema.type(c)),
                           onRun: (c)=>c.get(commandsCtx).call(toggleEmphasisCommand.key) })
  fmt.addItem('strike',  { icon: strikeIcon,      active: (c)=>isMarkActive(c, strikethroughSchema.type(c)),
                           onRun: (c)=>c.get(commandsCtx).call(toggleStrikethroughCommand.key) })

  // 4) 清除格式（自定义）
  builder.addGroup('cleanup', 'Cleanup').addItem('clear-format', {
    icon: clearIcon,
    active: () => false,
    onRun: clearFormat,
  })
}
```

要点：
- `GroupBuilder.addItem(key, { icon, active, onRun })` —— `onRun(ctx)` 自己写，`ctx.get(commandsCtx).call(cmd.key, payload)` 即可
- 图标要求是 **SVG 字符串**（`h(Icon, { icon })`，`Icon` 组件接受 svg 文本；Crepe 内置图标全是 `24x24` 的 `<svg>` 字符串，可复用 `@milkdown/crepe` 的或其他图标库）
- `active(ctx)` 在每次 `view.update` 时被重新求值（`TopBarView.update` 里 `version.value++` 触发 Vue 重渲染），所以激活态天然跟随光标
- 想保留内置分组就别 `clear()`，用 `builder.getGroup('formatting').addItem(...)` 追加

### 3.3 清除格式的实现

Crepe 没有内置"清除格式"，自己写一个 `$command`：

```ts
const clearFormatCommand = $command('ClearFormat', (ctx) => () => (state, dispatch) => {
  const { from, to, empty, $from } = state.selection
  let tr = state.tr

  // 1) 清 mark：区间内 removeMark；无选区时清 storedMarks
  tr = empty ? tr.setStoredMarks([]) : tr.removeMark(from, to)

  // 2) 块级：列表 / 引用先 lift 出去，再统一转段落
  const para = paragraphSchema.type(ctx)
  const inList = findParentNode(n => n.type === listItemSchema.type(ctx))($from)
  const inQuote = findParentNode(n => n.type === blockquoteSchema.type(ctx))($from)

  // lift 需要单独 dispatch 一次（lift 后位置会变，不能和 setBlockType 同事务）
  // 处理顺序：liftListItem → lift → setBlockType(paragraph)
  …
  dispatch?.(tr.scrollIntoView())
  return true
})
```

顺序坑：**先 lift 再 setBlockType**，否则 `setBlockType` 在列表项里会把 list_item 变段落但不脱出列表；`lift` 与 `setBlockType` 需分两个事务。M2 里按"标题 / 引用 / 列表 / 普通段落"四种场景各写一条测试。

### 3.4 Crepe 顶部栏的三个限制（必须提前接受）

1. **`buildTopBar` 里的自定义项拿不到 top-bar 的内部 CSS 类**：`renderButton` 只加 `.top-bar-item`，`renderSelector` 只认 `.top-bar-heading-selector`。所以自定义"清除格式"按钮的样式需复用 `.top-bar-item`，不能自定义类名或加 tooltip（Crepe 的 top-bar 项**没有 title / tooltip**）。
2. **没有分隔线定制**：分隔线是框架按"每组之间"自动插的（`.top-bar-divider`），你只能靠分组控制。
3. **位置不可配置**：写死 `position: sticky; top: 0`，无法移进 Electron 标题栏（跨进程 DOM）。若哪天想让它真的长在标题栏里，就得放弃 TopBar、自己用 `commandsCtx` 在 React 里画 —— 这条路我留了备选（见 §11）。

---

## 4. 标签条（在标题栏里）

```
[≡] [＋][📂][💾] │ 采购单.docx.md ● │ 笔记.md × │ 字数 1,234 · 选中 56 │ ─ □ ×
                  ↑ 拖拽区                ↑ 标签（no-drag，可中键关闭、可拖拽排序）
```

- 标签条用 flex，`min-width: 0` + `text-overflow: ellipsis`，标签多时横向滚动
- 只有 1 个文档时自动隐藏标签条（标题只显示当前文件名）——避免空荡
- 脏标记 `●`；保存中显示 `⋯`；外部冲突显示 `⚠`
- `Ctrl+Tab` / `Ctrl+Shift+Tab` 切换，`Ctrl+W` 关标签
- 标签本身 `-webkit-app-region: no-drag`

---

## 5. 字数统计

- 规则：CJK 每字 1；`[A-Za-z0-9_'’-]+` 每串 1 词；标点空白不计；另附字符数
- 数据源：`listener` 的 `updated` → `doc.textBetween(0, size, '\n', '\n')`；选区用 `textBetween(from, to)`
- 显示：`字数 1,234 · 选中 56`（无选区只显示前者），hover 展开 字符数/段落数/阅读时长
- 位置：标题栏右端，紧邻窗口按钮；窗口 <900px 时只留数字

---

## 6. 多标签页：一个 Crepe 实例，多份 EditorState

```ts
type Tab = {
  id: string
  state: EditorState        // 含 history，撤销栈随标签走
  scrollTop: number
  savePath: string | null
  sourcePath: string | null
  sourceExt: string | null
  dirty: boolean
  images: Map<string, Buffer>
}
```

切换标签：

```ts
const view = ctx.get(editorViewCtx)
view.updateState(tab.state)     // 撤销栈 / 选区 / mark 全部还原
view.dom.parentElement!.scrollTop = tab.scrollTop
```

**关键验证（已读 prosemirror-view 源码确认）**：`updatePluginViews` 只在 `prevState.plugins != state.plugins` 时才销毁重建插件视图；我们的多份 state 共用同一 plugins 数组，所以 **TopBar 的 Vue 实例不会在切标签时被销毁**，且 `update(view, prevState)` 会被调用 → `version++` → 按钮激活态立即刷新。这正是我需要的。

- 新建标签：`EditorState.create({ schema, plugins, doc })`
- 获取 schema/plugins：`ctx.get(schemaCtx)` + `ctx.get(editorStateCtx).plugins`（M3 里封成 `tabManager.ts`）
- 兜底方案：若某插件依赖实例级状态导致切标签异常，退回"每个标签一个 Crepe 实例、`display:none` 切换"（内存换稳定，最多 8 个标签后驱逐最旧）

---

## 7. 图片（anydoc 的坑 + Crepe 的上传钩子）

实测：`@firecrawl/anydoc` 的 `toMarkdown()` **不输出内嵌图片**（只有 alt 文本），字节在 `toDocument().assets`。所以：

1. 转换后立刻把 `asset.id` 注入为 `![alt](seekie-asset://<tabId>/<id>)`，**必须在首次渲染前**注入
2. main 侧 `protocol.handle('seekie-asset', …)` 从内存 Map 返回 Buffer
3. 编辑器内粘贴/拖入/工具栏插图，统一走 Crepe 的 `onUpload`：
   ```ts
   featureConfigs: {
     [Crepe.Feature.ImageBlock]: { onUpload: async (file) => registerAsset(tabId, file) }
   }
   ```
   返回的 URL 同样是 `seekie-asset://…`，图片暂存在内存，保存时统一落盘
4. 保存时按设置重写 src：

| 策略 | 输出 |
|---|---|
| 相对路径（默认） | `<md目录>/<md文件名>.assets/image1.png`，src 为 `./<md文件名>.assets/image1.png` |
| 内联 base64 | `data:image/png;base64,…`（>2MB 提示体积风险） |

5. 未保存过的文档，草稿图片先落 `userData/drafts/<tabId>.assets/`，Save As 时迁移并重写路径

---

## 8. 自动保存

| 场景 | 行为 |
|---|---|
| 内容变化 | debounce 800ms |
| 切标签 / 失焦 / 关标签 | 立即 flush |
| 无 `savePath` | 写 `userData/drafts/<tabId>.md` + `session.json` |
| 启动 | 恢复上会话的标签与草稿，标注"草稿" |
| 退出 | 全部已落盘则不弹框；仅写失败时拦截 |
| **冲突检测** | 写前比 mtime；被外部改过 → 暂停该标签自动保存 + `⚠` 提示（重新载入 / 保留我的版本），绝不静默覆盖 |

写盘用 `x.md.tmp` → `rename` 原子替换。

---

## 9. Linux 无边框标题栏

- `new BrowserWindow({ frame: false })`（Linux 上 `titleBarStyle` 无效）
- 标题栏 `-webkit-app-region: drag`；三个按钮、标签、字数 `no-drag`
- 自绘 最小化 / 最大化 / 关闭；监听 `maximize`/`unmaximize` 换图标；**双击拖拽区切换最大化需自己实现**（Electron 在 Linux 不代劳）
- X11 与 Wayland 双测；HiDPI 下 40px 标题栏与 44px TopBar 的图标对齐
- 深色主题：`nativeTheme.shouldUseDarkColors` → 切 Crepe 主题（`theme/classic.css` ↔ `theme/classic-dark.css`，Crepe 自带 3 套主题 × 明暗）

---

## 10. 大纲侧栏

```ts
type OutlineItem = { level: 1..6; text: string; pos: number; end: number }
// end = 下一个 level <= 当前 的标题 pos - 1，否则 doc.content.size
```

- 从 `doc` 遍历推导（不解析文本，代码块里的 `#` 不会误判），debounce 200ms
- **单击**：平滑滚动到标题
- **双击**：`setTextSelection(pos, end)` 选中整章 → 标题栏"选中"字数立刻变成该章字数
- 按 level 缩进、可折叠、当前章节高亮；侧栏 240px，可拖宽可收起

---

## 11. 风险（Crepe 带来的新风险，按严重度排）

| 风险 | 说明 | 对策 |
|---|---|---|
| **`buildTopBar` 依赖半公开 API** | `buildHeadingSelector` / `setHeading` / `GroupBuilder` 类型来自 `@milkdown/crepe/feature/top-bar`，是包内导出，小版本可能变 | 锁死版本 `7.23.0`；把定制代码收敛到一个 `topBarConfig.ts`；升级时只需改这个文件 |
| **TopBar 自定义项无 tooltip** | 纯图标无文字提示，靠猜 | 自己给 `.top-bar-item` 加 CSS `::after` tooltip（用 `data-*` 属性传给浏览器，需在按钮 DOM 上打标记 —— 可行但 hack，M2 验证） |
| **Crepe 顶部栏 + 选区气泡栏同时开，体验重复** | 两套格式入口 | v1 **关掉 `Toolbar`**（只保留 TopBar）；若你更想要 Typora 那种"选中即浮出"，可以反过来，但那时顶部栏只剩块级按钮 |
| **Crepe 体积** | Vue3 + katex + DOMPurify + codemirror language-data（几百 KB） | 打包体积可接受（Electron 本来几十 MB）；启动不加载 language-data（懒加载） |
| **多标签共享 state 的边界情况** | 个别插件实例状态在 `updateState` 后可能失效 | M3 先做 PoC 压测 8 个标签；不行就退回"多实例 + display 切换" |
| **anydoc 图片丢失** | 已实测 | §7 的注入流程；M6 专项验收 |
| **Milkdown 往返丢格式** | 表格/HTML/front matter | M1 建回归样本 + `parse→serialize` diff |

---

## 12. 里程碑（约 9.5 天，比 v0.2 少，因为工具栏和表格/公式/图片上传都由 Crepe 白送）

| 阶段 | 内容 | 验收 |
|---|---|---|
| **M0** 骨架 0.5d | electron-vite + React、`frame:false`、拖拽区、自绘三键、IPC | Linux 可拖可最大化可关 |
| **M1** Crepe 接入 1d | Crepe 初始化、markdown 读写、主题、往返一致性样本 | 表格/公式/代码块/任务列表正常 |
| **M2** TopBar 定制 1.5d | `buildTopBar` 重排 + 清除格式命令 + 纯图标 + tooltip | 11 组按钮行为正确、激活态随光标 |
| **M3** 多标签 1.5d | 单实例多 state、标签条（标题栏内）、拖拽排序、Ctrl+Tab | 切回标签撤销栈与光标都在，TopBar 不重建 |
| **M4** 文件+自动保存 2d | 打开/anydoc 转换/Save As/原子写、800ms 自动保存、草稿区、会话恢复、冲突检测 | 重开应用草稿与标签全在；外部改文件不静默覆盖 |
| **M5** 字数+大纲 1d | 统计、选区统计、大纲、双击选章 | 双击 H2 后"选中"字数 = 该章字数 |
| **M6** 图片 1d | 协议、onUpload、base64/相对路径、Save As 迁移 | 两种策略的 md 在 Typora 打开正常 |
| **M7** 打磨 1d | 快捷键表、菜单、主题切换、electron-builder（AppImage+deb）、X11/Wayland | 干净 Ubuntu 可用 |

---

## 13. 待确认

1. **关掉 Crepe 的选区气泡工具栏（`Toolbar`）**，只留顶部栏？我建议关（否则同一个加粗有两个入口）。
2. **撤销/重做/剪切/复制/粘贴**：保持"只用快捷键 + 应用菜单"，还是要我把 undo/redo 也塞进顶部栏？（cut/copy/paste 我建议永远不进工具栏）
3. **标签条**：只在 ≥2 个文档时出现（我建议），还是常显？
4. 上一版遗留、你还没答的：要不要 导出 PDF/HTML、源码模式（Typora 的 Ctrl+/）、查找替换、文件树侧栏、快捷键自定义？
