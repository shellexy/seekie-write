# seekie-write

类 Typora 的所见即所得 Markdown 编辑器。Electron 45 + Milkdown Crepe 7.23。

![浅色](docs/screenshot-light.png)
![深色](docs/screenshot-dark.png)

## 现在能做什么

- **所见即所得编辑**：Milkdown Crepe 内核，表格 / 代码块（CodeMirror）/ LaTeX 公式（KaTeX，行内 `$…$` 与块级 `$$…$$`）/ 任务列表 / 图片块齐全
- **顶部工具栏**：Crepe TopBar（默认关闭的特性，这里显式打开），纯图标 + 鼠标悬浮提示，分组为
  `段落·标题一~六` │ `粗体 斜体 删除线 行内代码` │ `项目符号 有序列表` │ `插入图片 表格 分割线 引用 代码块` │ `清除格式` │ 最右侧 `⋮`
- **顶栏 ⋮ 菜单**：撤销 / 重做 / 查找 / 替换 / 查看源码 / 设置 / 关于；自定义标题栏只保留文件操作与标签条
- **自定义标题栏**（Linux 优先，`frame:false`）：新建 / 打开（右侧小箭头展开最近文件）/ 保存 / 另存为·导出下拉、标签条、自绘窗口三键
- **标签条**：用满标题栏剩余宽度；放不下时可用滚轮横向滚动，或 `Ctrl+Tab` / `Ctrl+Shift+Tab` 循环切换，切到的标签会自动滚到可见区域；右侧「全部标签」下拉可直接切换或关闭任意标签
- **启动恢复**：默认只恢复草稿；设置里勾选“启动时恢复上次打开的文件”后，才会连同上次有落盘路径的标签一起重新打开
- **最近文件**：打开按钮旁的箭头列出最近 12 个文件，点一下直接重开
- **导出 / 打印**：另存为下拉箭头里包含 另存为、导出 Markdown（单文件）、导出 HTML（单文件）、导出 docx、导出 PDF、打印、打印预览；单文件导出会把图片以内联 base64 写进同一个文件，HTML 里的 LaTeX 公式转成 MathML
- **程序图标**：`build/icon.png` 同时用于窗口图标、Linux 桌面入口和“关于”对话框
- **标签右键菜单**：关闭标签 / 关闭其他标签 / 关闭右侧标签、复制文件路径、在文件夹中显示
- **对话框记忆**：打开 / 保存对话框默认回到上次所在目录
- **大纲底部信息区**：字数 / 选中 / 字符 / 段落 / 保存状态 / 图片策略 / 缩放都收在大纲侧栏底部，不占窗口底部的横向空间
- **查找替换**：`Ctrl+F` / `Ctrl+H`，命中项用 ProseMirror Decoration 高亮，支持上一个/下一个、区分大小写、全部替换
- **设置面板**：外观（跟随系统 / 浅色 / 深色）、Crepe 主题（跟随应用 / Frame / Classic / Nord）、正文宽度、字体与字号、打开文档时是否把内嵌图片转成 base64、启动恢复；改完立即生效并持久化
- **正文右键菜单**：撤销 / 重做、剪切 / 粘贴、全选、插入图片 / 表格 / 分割线、清除格式、查找 / 替换；选中文字后可复制为纯文本 / Markdown / 富文本
- **可调宽大纲**：拖动右侧分隔条 170–420px，双击恢复 240px，宽度写入设置
- **窄窗口适配**：编辑区变窄时，Crepe 左侧的 +/拖动控件会自动让位，不会被裁到可视范围外
- **多标签页**：一个 ProseMirror view + 多份 EditorState，切标签保留撤销栈、选区、滚动位置
- **自动保存**：800ms debounce；没有落盘路径的标签只写草稿区（不会弹另存为），关窗口重开能恢复
- **冲突检测**：同一标签保存串行化，mtime 基线随保存结果直接带回，避免自己的自动保存误报；真正的外部修改仍会暂停并提示
- **打开非 Markdown 文档**：`@firecrawl/anydoc` 本地转换（Word / PPT / Excel / OpenDocument / RTF / EPUB / CSV / PDF）；可选把内嵌图片直接转成 base64 data URI，打开即自包含
- **另存命名**：`季度报告.docx` → `季度报告.docx.md`（保留原扩展名，不覆盖源文件）
- **图片两种保存策略**：内联 base64 / 相对路径（`文档名.assets/`）；base64 保存时先用 `@aurouscia/image-compress` 压成宽度 ≤1280px 的 webp（动图 GIF / webp / SVG 跳过，静态 GIF 会压缩）
- **大纲侧栏**：单击滚动到标题（自动避开 sticky TopBar），**双击选中整章**（大纲底部的"选中字数"立刻变成该章字数）
- **许可协议**：MIT（见 [LICENSE](LICENSE)）

## 开发

```bash
npm install
npm run dev          # 开发模式（HMR）
npm run build        # 打 out/
npm run typecheck    # 主进程 + 渲染层分别做类型检查
npm run dist         # Linux AppImage + deb
```

打包配置都在 `package.json` 的 `build` 字段（electron-builder 26）：`build/icon.png`、Linux 桌面入口 / MIME、AppImage zstd、`afterPack` 沙箱权限钩子等。`afterPack` 是 electron-builder 的**顶层钩子**，所以放在 `build.afterPack` 而不是 `build.linux.afterPack`。

Linux 上跑无边框窗口需要的系统库：

```bash
sudo apt install libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libgtk-3-0 \
  libxdamage1 libxkbcommon0 libasound2 libatspi2.0-0 libgbm1 libxrandr2 libxcomposite1
```

Wayland 会话下若拖拽区失效，用 `--ozone-platform=wayland` 启动；X11 下直接用默认即可。

## 快捷键

| 操作 | 快捷键 |
| --- | --- |
| 新建 / 打开 / 保存 | `Ctrl+N` / `Ctrl+O` / `Ctrl+S` |
| 另存为 | `Ctrl+Shift+S` |
| 关闭标签 | `Ctrl+W` |
| 切换标签 | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| 撤销 / 重做 | `Ctrl+Z` / `Ctrl+Shift+Z` |
| 查找 / 替换 | `Ctrl+F` / `Ctrl+H` |
| 设置 | `Ctrl+,` |
| 段落 / 标题一 / 二 / 三 | `Ctrl+0` / `Ctrl+1` / `Ctrl+2` / `Ctrl+3` |
| 清除格式 | `Ctrl+\` |
| 切换侧栏 | `Ctrl+Shift+B` |
| 缩放 | `Ctrl+=` / `Ctrl+-` / `Ctrl+Shift+0` |

## 目录结构

```
electron/
  main.ts              窗口、菜单、IPC、seekie-asset:// 协议、关闭前握手
  preload.ts           contextBridge 白名单（渲染层没有 fs 能力）
  lib/
    anydoc.ts          anydoc 转换 + Document 模型 → Markdown（含图片占位注入）
    files.ts           打开 / 原子写 / 图片重写 / mtime 冲突检测
    drafts.ts          草稿区 + session.json 会话恢复
    assetStore.ts      内存资源仓库（图片字节，保存时才落盘）
    settings.ts        settings.json
src/
  App.tsx              标签生命周期、自动保存、菜单命令、会话恢复
  editor/
    createEditor.ts    Crepe 唯一实例
    topBarConfig.ts    TopBar 分组、按钮、清除格式命令、tooltip
    insert.ts          插入图片 / 表格 / 分割线
    searchPlugin.ts    查找命中高亮（ProseMirror Decoration）
    theme.ts           Crepe 主题切换 / 字体 / 正文宽度
    tabs.ts            单 view 多 state 的 TabStore
    session.ts         大纲 / 字数 / 选区统计（节流 120ms）
    icons.ts           工具栏描边图标
  lib/search.ts        纯文本查找（返回匹配位置）
  components/          TitleBar / Outline / SidebarFooter / FindBar / SettingsDialog / Overlays
shared/types.ts        main 与 renderer 共享类型
shared/defaults.ts     共享默认设置
samples/               测试用的 .docx / .md
```

## 已知限制

- **PDF 转换拿不到内嵌图片**：anydoc 对 PDF 直接产出 Markdown，没有 document 模型，也就没有 assets。文本型 PDF 可用，扫描版会提示需要 OCR（本机不做 OCR）。
- **内嵌 base64 不可逆**：开启“打开时图片内嵌为 base64”后，转换出的 Markdown 已经是 data URI，保存时会保持内嵌，不会再自动改成 `.assets/` 相对路径；图片多的文档体积会明显增加。
- **启动恢复只在正常退出时记录**：`session.json` 在关闭窗口时写入；进程被强杀时只会恢复草稿区。
- **图片压缩跳过动图 GIF / webp / SVG**：动图避免被压成单帧，SVG 是矢量，webp 已经是目标格式；静态 GIF 仍会压成 webp。
- **docx 导出包**：`@md2docx/md2docx@0.1.3` 的 ESM 入口错误地 re-export 了不存在的 default，实际使用其官方底层 `@m2d/md2docx@0.1.3`（同一实现）。
- **Crepe TopBar 的自定义按钮不能加 class**：Crepe 只给 `.top-bar-item`，所以 tooltip 是靠挂载后补 `title` 实现的（`installTopBarTooltips`）。增删按钮或升级 Crepe 小版本后，要同步 `topBarConfig.ts` 里的 `BUTTON_LABEL_ORDER`。
- **`buildHeadingSelector` 未使用**：它没有从包入口导出，这里自己拼了 selector 结构，等价且不依赖半公开 API。
- **多标签共享一份 plugins**：个别插件的实例级瞬时状态（tooltip 是否展开等）在切标签时会被重置，文档内容、撤销栈、选区不受影响。

## 已验证的行为（Xvfb + CDP 自动化跑过）

| 场景 | 结果 |
| --- | --- |
| Crepe TopBar 出现、气泡工具栏不出现 | ✅ |
| 工具栏 13 个纯图标按钮 + tooltip，激活态跟随光标移动 | ✅ |
| 输入 → 字数（中西混排 31 字）/ 大纲实时更新 | ✅ |
| 双击大纲标题选中整章 → 标题栏"选中 N 字"同步 | ✅ |
| 打开 .docx（anydoc）→ 正文 + 大纲 + 内嵌图片显示 | ✅ 图片经 `seekie-asset://` 正常渲染 |
| 保存图片为相对路径 | ✅ 生成 `rel.assets/image-1.png`，md 写成 `./rel.assets/image-1.png` |
| 保存图片为 base64 | ✅ 示例图保存为 `data:image/webp;base64,…`（压缩后） |
| 打开 .md → 表格 / 代码块 / 删除线 / 引用 / KaTeX 行内公式 | ✅ 公式渲染出 `.katex` |
| 多标签切换 | ✅ 切回后内容与撤销栈都在 |
| 自动保存（800ms）到已有路径 | ✅ 文件内容更新 |
| 外部改文件 → 冲突检测 | ✅ 暂停自动保存 + 标签红框 + "重新载入 / 保留我的版本" |
| 关窗口前落盘草稿 | ✅ 写入 `userData/session.json` + `drafts/<tab>.md` |
| 深色主题 | ✅ 标题栏 / 大纲 / 编辑器 / 代码块同步切换 |
| 大纲底部信息区 | ✅ 字数 / 字符 / 段落 / 保存状态 / 图片策略 / 缩放合并显示，无底部横向状态栏 |
| 无路径标签自动保存 | ✅ 800ms 后写草稿区，不弹“另存为”；关闭标签会清理草稿 |
| 启动参数打开文件 | ✅ 只保留一个标签，不再多出空白标签 |
| 查找 / 替换 | ✅ 命中项高亮、`n/m` 计数、全部替换、撤销后恢复 |
| 设置面板 | ✅ 外观 / Crepe 主题 / 正文宽度 / 字体 / 字号实时生效，恢复默认正常 |
| TopBar 插入 | ✅ 图片（`seekie-asset://` 正常渲染）、3×3 表格、分割线、引用、代码块 |
| 标题栏 | ✅ 新建 / 打开+最近文件 / 保存 / 另存为·导出下拉；不再有撤销 / 重做 / 查找 / 替换 / 设置 |
| 顶栏 ⋮ 菜单 | ✅ 最右侧，右边缘距窗口 12px；撤销 / 重做 / 查找 / 替换 / 查看源码 / 设置 / 关于全部可用 |
| 新建空白标签 | ✅ 正文为空，标签临时名为“新文档-N”，placeholder 为中文提示 |
| 查看源码 | ✅ 对话框内 CodeMirror 只读高亮当前 Markdown 源码 |
| 关于 | ✅ 首页 / 版本 0.1.0 / Electron 45.2.2 / Node.js 24.22.2 / MIT；`build/icon.png` 正常加载（512→64px） |
| 启动文件拉取 | ✅ 渲染层就绪后主动取启动参数文件，生产构建打开准确 |
| 大纲单击 / 双击跳转 | ✅ 标题停在 TopBar 下方 16px，完整可见 |
| 标签条溢出 | ✅ 14 个标签时滚轮横向滚动；`Ctrl+Tab` 循环并自动滚出当前标签 |
| 自动保存冲突检测 | ✅ 连续 8 次输入触发自动保存无误报；外部追加修改仍会暂停并提示 |
| TopBar 图片图标 | ✅ 颜色加深到 `--fg`、线宽 2.1px |
| 大纲宽度拖动 | ✅ 240 → 330px 拖拽生效并持久化，双击恢复 240px |
| 窄窗口块级控件 | ✅ 760px 视口下 + 控件左边缘在编辑区内（248 vs 240） |
| 右键复制选中 | ✅ 纯文本 / Markdown（`**粗体**`）/ 富文本（`<strong>粗体</strong>`） |
| 打开文档图片内嵌 | ✅ 关闭时 `seekie-asset://`；开启后 `data:image/png;base64,…`，提示“已内嵌 base64” |
| 最近文件 | ✅ 打开后出现在打开按钮下拉，点击可重新打开 |
| 启动恢复 | ✅ 默认只恢复草稿（示例：新文档-1）；勾选后示例笔记 + 草稿一起恢复 |
| 标签右键菜单 | ✅ 关闭其他 → 剩 1 个；关闭右侧 → 剩 2 个；复制文件路径得到绝对路径 |
| 导出 Markdown / HTML | ✅ 单文件，图片写成 `data:image/png;base64,…`；HTML 公式输出 `<math>` MathML |
| 导出 docx | ✅ `PK` 开头的有效 docx（含内嵌图片，CSP 已放行 WASM） |
| 导出 PDF | ✅ `%PDF-`，`printBackground: true`；打印样式隐藏标题栏 / 大纲 / 顶栏，代码块 `pre-wrap` |
| 打印预览 | ✅ 独立预览窗口，关闭主窗口时一并退出 |
| 边界：base64 压缩 | ✅ 示例 docx 的 PNG 保存为 webp；动图 GIF / webp / SVG 跳过，静态 GIF 压缩 |
| 标题栏 / 顶栏 | ✅ 另存为是下拉箭头（与打开箭头同款）；顶栏图标 SVG 强制 `--fg`，分隔线 `--fg-faint`，底边 `color-mix(fg 30%)` |
| 打包配置 | ✅ electron-builder 26.18.0 `--dir` 成功；`afterPack` 把 `chrome-sandbox` 设为 4755 |
