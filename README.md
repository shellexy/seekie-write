# seekie-write

类 Typora 的所见即所得 Markdown 编辑器。Electron 45 + Milkdown Crepe 7.23。

![浅色](docs/screenshot-light.png)
![深色](docs/screenshot-dark.png)

## 现在能做什么

- **所见即所得编辑**：Milkdown Crepe 内核，表格 / 代码块（CodeMirror）/ 公式（KaTeX）/ 任务列表 / 图片块齐全
- **顶部工具栏**：Crepe TopBar（默认关闭的特性，这里显式打开），纯图标 + tooltip，分组为
  `段落·标题一~六` │ `粗体 斜体 删除线 行内代码` │ `项目符号 有序列表 引用 代码块` │ `清除格式`
- **自定义标题栏**（Linux 优先，`frame:false`）：新建 / 打开 / 保存、标签条、自绘窗口三键
- **大纲底部信息区**：字数 / 选中字数 / 字符数 / 段落数 / 阅读时长 / 保存状态 / 图片策略 / 缩放 / 路径都收在大纲侧栏底部，不再占用窗口底部的整条状态栏，正文能多显示一行
- **多标签页**：一个 ProseMirror view + 多份 EditorState，切标签保留撤销栈、选区、滚动位置
- **自动保存**：800ms debounce；没有落盘路径的标签只写草稿区（不会弹另存为），关窗口重开能恢复
- **冲突检测**：磁盘文件被外部改过就暂停自动保存并提示，绝不静默覆盖
- **打开非 Markdown 文档**：`@firecrawl/anydoc` 本地转换（Word / PPT / Excel / OpenDocument / RTF / EPUB / CSV / PDF）
- **另存命名**：`季度报告.docx` → `季度报告.docx.md`（保留原扩展名，不覆盖源文件）
- **图片两种保存策略**：内联 base64 / 相对路径（`文档名.assets/`）
- **大纲侧栏**：单击滚动到标题，**双击选中整章**（状态栏的"选中字数"立刻变成该章字数）

## 开发

```bash
npm install
npm run dev          # 开发模式（HMR）
npm run build        # 打 out/
npm run typecheck    # 主进程 + 渲染层分别做类型检查
npm run dist         # Linux AppImage + deb
```

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
| 撤销 / 重做 | `Ctrl+Z` / `Ctrl+Shift+Z` |
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
    tabs.ts            单 view 多 state 的 TabStore
    session.ts         大纲 / 字数 / 选区统计（节流 120ms）
    icons.ts           工具栏描边图标
  components/          TitleBar / Outline / SidebarFooter / Overlays
shared/types.ts        main 与 renderer 共享类型
samples/               测试用的 .docx / .md
```

## 已知限制

- **PDF 转换拿不到内嵌图片**：anydoc 对 PDF 直接产出 Markdown，没有 document 模型，也就没有 assets。文本型 PDF 可用，扫描版会提示需要 OCR（本机不做 OCR）。
- **Crepe TopBar 的自定义按钮不能加 class**：Crepe 只给 `.top-bar-item`，所以 tooltip 是靠挂载后按 DOM 顺序补 `title` 实现的（`installTopBarTooltips`）。升级 Crepe 小版本后要复核顺序。
- **`buildHeadingSelector` 未使用**：它没有从包入口导出，这里自己拼了 selector 结构，等价且不依赖半公开 API。
- **多标签共享一份 plugins**：个别插件的实例级瞬时状态（tooltip 是否展开等）在切标签时会被重置，文档内容、撤销栈、选区不受影响。

## 已验证的行为（Xvfb + CDP 自动化跑过）

| 场景 | 结果 |
| --- | --- |
| Crepe TopBar 出现、气泡工具栏不出现 | ✅ |
| 工具栏 9 个纯图标按钮 + tooltip，激活态跟随光标移动 | ✅ |
| 输入 → 字数（中西混排 31 字）/ 大纲实时更新 | ✅ |
| 双击大纲标题选中整章 → 标题栏"选中 N 字"同步 | ✅ |
| 打开 .docx（anydoc）→ 正文 + 大纲 + 内嵌图片显示 | ✅ 图片经 `seekie-asset://` 正常渲染 |
| 保存图片为相对路径 | ✅ 生成 `rel.assets/image-1.png`，md 写成 `./rel.assets/image-1.png` |
| 保存图片为 base64 | ✅ 写成 `data:image/png;base64,…` |
| 打开 .md → 表格 / 代码块 / 删除线 / 引用 / KaTeX 行内公式 | ✅ |
| 多标签切换 | ✅ 切回后内容与撤销栈都在 |
| 自动保存（800ms）到已有路径 | ✅ 文件内容更新 |
| 外部改文件 → 冲突检测 | ✅ 暂停自动保存 + 标签红框 + "重新载入 / 保留我的版本" |
| 关窗口前落盘草稿 | ✅ 写入 `userData/session.json` + `drafts/<tab>.md` |
| 深色主题 | ✅ 标题栏 / 大纲 / 编辑器 / 代码块同步切换 |
| 大纲底部信息区 | ✅ 字数 / 字符 / 段落 / 阅读时长 / 保存状态 / 图片策略 / 缩放 / 路径，无底部横向状态栏 |
| 无路径标签自动保存 | ✅ 800ms 后写草稿区，不弹“另存为”；关闭标签会清理草稿 |
| 启动参数打开文件 | ✅ 只保留一个标签，不再多出空白标签 |
