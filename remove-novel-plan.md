推荐做成一次原子迁移：保持 HTML、功能和视觉不变，把 Novel 运行时完整替换为官方 Tiptap v3。预计涉及约 18 到 22 个文件，工作量 4 到 6 个开发日。增加的时间主要用于验证并重写 Slash Command 交互。

## 方案摘要

- Building：纯 Tiptap v3 编辑器内核、本地 Slash Command、本地图片上传占位插件。
- Not building：不引入 `reactjs-tiptap-editor`，不改数据库，不迁移文章内容，不重做 UI，不新增协作等功能。
- 数据契约：继续以 `posts.html` 为正式内容，保留现有节点名称和 HTML 属性。
- 样式边界：本次有意保留 `.novel-prose` 类名，避免同时改动编辑器样式作用域和 CSS 边界测试；类名清理不在本次迁移范围内。
- 发布方式：一次提交完成迁移，避免仓库长期处于 Tiptap v2/v3 混合状态。

## 实施步骤

1. 盘点现有 Novel 编辑器实现、依赖、测试和工作区状态
2. 实现并验证本地 Slash Command 迁移门槛
3. 迁移 Tiptap 编辑器外壳、扩展与 BubbleMenu
4. 本地化图片上传插件并清理类型/文件命名
5. 增加 round-trip 与迁移测试，收敛依赖
6. 运行依赖检查和全量 verify，修复回归？

## 1. 收敛依赖

在 [package.json (line 38)](/Users/joe/ai/blog/package.json:38)：

新增并统一为 `^3.27.4`：

- `@tiptap/starter-kit`
- `@tiptap/extension-character-count`
- `@tiptap/extension-code-block-lowlight`
- `@tiptap/extension-color`
- `@tiptap/extension-highlight`
- `@tiptap/extension-task-item`
- `@tiptap/extension-task-list`
- `@tiptap/extension-text-style`
- `@tiptap/suggestion`
- `cmdk@^1.1.1`，复用现有 Slash Menu 的筛选、选中态和键盘交互
- `tippy.js@^6.3.7`，仅负责 Slash Menu 定位

删除：

- `novel`
- Novel 带来的 Tiptap v2、Jotai、react-moveable 等不再使用的间接依赖

保留现有 `tiptap-markdown`、拖拽手柄和 AutoJoiner；它们不属于本次迁移目标，避免同时改变编辑行为。

迁移成功后删除 `.pnpmfile.cjs`，并从 [pnpm-workspace.yaml (line 7)](/Users/joe/ai/blog/pnpm-workspace.yaml:7) 移除 Novel 专用 package extension 和 ProseMirror 强制版本覆盖。

## 2. 建立官方 Tiptap 编辑器外壳

新增 `components/TiptapEditorSurface.tsx`，统一封装：

- 官方 `useEditor`
- 官方 `EditorContent`
- `EditorContext.Provider`
- `immediatelyRender: false`
- extensions、editorProps、initialContent
- `onCreate`、`onUpdate` 生命周期
- 编辑器实例释放
- 子组件访问当前 editor 的 context

两个使用方都接入同一个外壳：

- 后台文章编辑器
- 前台行内编辑器 [InlineArticleEditor.tsx (line 559)](/Users/joe/ai/blog/components/InlineArticleEditor.tsx:559)

避免两套编辑器分别维护初始化、SSR 和回调同步逻辑。

## 3. 替换 Novel 扩展导出

修改 [editor-extensions.tsx (line 3)](/Users/joe/ai/blog/lib/editor-extensions.tsx:3)：

- `EditorInstance` → `Editor`，来自 `@tiptap/core`
- `StarterKit`、CharacterCount、CodeBlockLowlight 等全部从官方 v3 包导入
- StarterKit 继续关闭内置 codeBlock
- Link 的现有配置移入 StarterKit；Underline 和 HorizontalRule 也只由 StarterKit 提供
- 删除独立的 `TiptapLink.configure(...)`、`TiptapUnderline` 导入及 extensions 数组项
- 表格、YouTube、图片、自定义音视频、公式、Twitter 保持现状
- 删除所有 `as any` 形式的 v2/v3 扩展混装

扩展顺序保持当前顺序，避免输入规则和 paste plugin 优先级发生变化。`createEditorExtensions()` 返回的扩展名称必须唯一，其中 `link` 和 `underline` 各只能出现一次；这是依赖迁移的硬性验收条件。

## 4. 本地实现 Slash Command

新增 `lib/editor-slash-command.tsx`，替代 Novel 的：

- `Command`
- `createSuggestionItems`
- `renderItems`
- `EditorCommand*`
- `handleCommandNavigation`

实现使用官方 `@tiptap/suggestion`、`ReactRenderer`、`cmdk` 和 `tippy.js`：

- 保留当前所有命令、图标、中文搜索词和样式
- `@tiptap/suggestion` 负责查询范围和生命周期，`ReactRenderer` 负责 React 菜单挂载
- `cmdk` 负责输入过滤、激活项和循环键盘导航
- `tippy.js` 负责菜单定位、滚动更新和外部点击关闭
- 支持上下键、Enter、Escape，列表首尾循环行为与现状一致
- 进入 code block 时不显示
- 执行命令前删除 `/查询词`
- 菜单位置随光标和滚动更新
- 无结果时显示“没找到匹配项”
- 关闭或销毁编辑器后不残留菜单 DOM、事件监听器或浮层实例

现有 `suggestionItems` 内容不变，只替换菜单运行机制。

Slash Command 是本次迁移的首个实施工作包和继续迁移的门槛。在仍可对照 Novel 现有行为时，先完成本地模块及查询、键盘、定位、关闭和销毁测试；这些测试通过后，再切换编辑器外壳和清理 Novel 依赖。整个变更仍作为一个原子提交合并，不单独发布无法工作的中间状态。如果这一门槛无法通过，就停止迁移，不改变现有编辑器运行时。

## 5. 替换 BubbleMenu

`FormattingBubble` 改用：

- `useCurrentEditor`，来自 `@tiptap/react`
- `BubbleMenu`，来自 `@tiptap/react/menus`
- Floating UI 的 `placement: "top"`、offset、flip 和 shift

继续使用现有 [shouldShowEditorBubble (line 3)](/Users/joe/ai/blog/lib/editor-bubble.ts:3)，保持以下行为：

- 仅文本选区显示
- 光标、图片节点、只读状态不显示
- AI、链接、颜色、格式清除、公式功能不变

## 6. 本地化图片上传插件

新增 `lib/editor-image-upload-plugin.ts`，替代 Novel 的：

- `UploadImagesPlugin`
- `createImageUpload`
- `handleImagePaste`
- `handleImageDrop`

保持当前语义：

- 上传过程中显示半透明图片占位
- 上传成功后在原位置插入 `image`
- 上传失败后移除占位
- 粘贴、拖拽位置正确
- 非图片继续走现有文件上传流程
- 多文件处理保持现状

[resizable-image.tsx (line 382)](/Users/joe/ai/blog/lib/resizable-image.tsx:382) 只改插件来源，不改 `img` 的 `src`、`width`、`data-align` 和 style 输出。

## 7. 类型与文件命名清理

将八处 Novel 类型导入替换为官方类型：

- `EditorInstance` → `Editor`
- `JSONContent` → `@tiptap/core` 的 `JSONContent`

涉及：

- `lib/editor-content.ts`
- `lib/editor-markdown.ts`
- `lib/editor-file-upload.ts`
- `lib/ai-modal.tsx`
- `lib/resizable-image.tsx`
- 两个编辑器组件
- `lib/editor-extensions.tsx`

同时重命名：

- `NovelEditor.tsx` → `PostEditor.tsx`
- `NovelEditorClient.tsx` → `PostEditorClient.tsx`
- 更新 [app/editor/page.tsx (line 8)](/Users/joe/ai/blog/app/editor/page.tsx:8) 的引用

保留 `buildEditorProps`、`app/editor.css`、`app/content.css` 和 `tests/components/css-boundaries.test.ts` 中的 `.novel-prose`。它在本次迁移后只是兼容性样式钩子，不代表仍依赖 Novel；改名会扩大视觉回归范围，因此明确排除在本次工作之外。

## 8. 保证 HTML 零迁移

增加代表性 HTML round-trip fixtures，覆盖：

- 标题、引用、有序/无序/待办列表
- 代码块与语言
- 表格
- 图片 `width`、`data-align`、alt
- YouTube
- Twitter
- 数学公式
- 音频、视频
- Markdown 表格粘贴

验收比较规范化 DOM，不比较属性顺序和无意义空白。任何节点丢失或降级成段落都视为阻塞问题。

数据库、API payload、公开文章渲染和微信导出不做结构变更。

## 9. 测试和验收

新增测试：

- Slash Command 查询、键盘导航、执行和关闭
- 图片上传占位成功与失败
- HTML → editor → HTML round-trip
- Tiptap editor surface 初始化与销毁
- 两个 editor 实例之间状态隔离

更新现有 [editor-extensions.test.ts (line 10)](/Users/joe/ai/blog/tests/lib/editor-extensions.test.ts:10)：

- 删除对 `StarterKit.configure(...)` 源码字符串的精确匹配，避免配置格式变化导致无意义失败
- 改为调用扩展工厂并检查 schema 或扩展集合行为
- 断言 `link`、`underline` 和其他扩展名称没有重复，其中 `link`、`underline` 各恰好一次
- 继续验证 StarterKit 关闭内置 codeBlock，并由 CodeBlockLowlight 提供唯一的 `codeBlock`

现有 CSS 边界测试继续要求 `.novel-prose`，本次不把类名替换纳入验收。

执行：

```
pnpm install
pnpm why @tiptap/core @tiptap/react @tiptap/pm prosemirror-model cmdk
rg -n 'from "novel"|from '\''novel'\''' components lib
pnpm run verify
```

依赖验收：

- `@tiptap/core`、`@tiptap/react`、`@tiptap/pm` 各只有一个 v3 版本
- ProseMirror 各核心包只有一个解析版本
- `cmdk` 只有一个直接依赖版本
- `createEditorExtensions()` 中所有扩展名称唯一，尤其是 `link`、`underline` 各恰好一次
- 业务源码不再从 `novel` 导入，`package.json` 和 lockfile 不再包含 `novel` 包
- `.novel-prose` 作为明确保留的兼容性样式钩子，可以继续出现在源码和测试中

手工验收：

- 新建、自动保存、发布文章
- 打开并保存历史文章
- 前台行内编辑、放弃和保存
- Undo/Redo、复制粘贴、Markdown 表格
- 图片粘贴、拖拽、上传、缩放、裁剪、设封面
- 音视频、公式、Twitter、YouTube、表格
- AI 改写、生图、微信复制、Markdown/PDF 导出
- 控制台无 hydration、duplicate plugin key 或 schema 错误

## 回滚

迁移作为一个提交合并；失败时直接 revert。由于数据库和 HTML schema 不变，不需要数据回滚。

两个最脆弱的假设是本地 Slash Command 能完整复现现有交互，以及 Tiptap v3 StarterKit 对现有 HTML 的解析结果与 Novel/Tiptap v2 一致。Slash Command 门槛测试失败时，不进入编辑器外壳切换和依赖清理；round-trip fixtures 出现内容丢失时，调整扩展配置后再发布，不能依赖线上打开文章时自动“顺便迁移”。

如果认可这个方案，下一步可以直接说“实现这个计划”。实现完成后再运行 `/check` 做合并前审查。
