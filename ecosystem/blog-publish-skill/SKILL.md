---
name: leyang-blog-publish
description: 将 Markdown 文件、文本内容或 URL 发布到自己的 Leyang Blog，支持分类选择、草稿/发布状态、本地图片和第三方图片上传。用户说发布到博客、发到 Leyang Blog、publish draft、发布 Markdown、发布文章并带图片时，应使用这个 Skill。
trigger: /leyang-blog-publish
user_invocable: true
---

# leyang-blog-publish: 发布内容到 Leyang Blog

## 触发方式

**Slash command:**

- `/leyang-blog-publish path/to/file.md`
- `/leyang-blog-publish https://example.com/article`
- `/leyang-blog-publish` 然后粘贴 Markdown 或正文

**自然语言：**

- “发布到博客”
- “发布成草稿”
- “发到 Leyang Blog”
- “把这篇文章发到自己的博客”
- “publish to blog”
- “publish draft”

## 配置

**API Base URL 读取优先级：**

1. 环境变量 `LEYANG_BLOG_API_URL`
2. 配置文件 `.codex/skills/leyang-blog-publish/config.json` 中的 `apiUrl`
3. 用户在请求里明确提供的博客根域名

API Base URL 必须是博客根域名，例如 `https://your-domain.com`，不要带 `/api` 后缀。

**Token 读取优先级：**

1. 环境变量 `LEYANG_BLOG_API_TOKEN`
2. 配置文件 `.codex/skills/leyang-blog-publish/config.json`

如果没有 token，提示用户：

1. 打开 `https://your-domain.com/admin/settings`
2. 在 `API Token` 页面生成 token
3. 保存到：

```json
{
  "apiUrl": "https://your-domain.com",
  "token": "blog_xxx"
}
```

## 工作流

### 1. 判断输入来源

- 文件路径：读取本地 Markdown 或文本文件
- URL：抓取正文并转成 Markdown
- 纯文本：直接作为正文使用

### 2. 读取配置

优先读取环境变量；如果没有，再读取 `config.json` 中的 `apiUrl` 和 `token`。如果仍缺少 `apiUrl` 或 token，先提示用户补充配置，不要尝试发布。

### 3. 拉取分类

```bash
curl -s "https://your-domain.com/api/admin/categories" \
  -H "Authorization: Bearer $TOKEN"
```

让用户选择分类；如果不选，可以留空，后续再在后台调整。

### 4. 解析内容

标题优先级：

1. YAML frontmatter 的 `title`
2. 第一条 `# Heading`
3. 文件名

正文处理：

- 去掉 frontmatter
- 如果标题来自第一条 `# Heading`，则移除这条 heading，避免重复
- 其余 Markdown 原样保留
- 可从 frontmatter 读取 `title`、`slug`、`category`、`status`、`description`、`tags`、`cover_image`；用户显式指定的发布参数优先于 frontmatter

### 5. 上传本地媒体

需要识别这些引用：

- `![alt](./image.png)`
- `![[image.png]]`
- 音频 / 视频 / 附件本地路径

上传接口：

```bash
curl -s -X POST "https://your-domain.com/api/uploads" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/absolute/path/to/file"
```

拿到返回 URL 后，替换正文中的本地引用。上传接口通常返回相对路径 `/api/images/...`；发布正文里应替换成博客绝对 URL，避免跨平台复制时丢失域名。

### 6. 转存第三方图片

如果 Markdown 中有第三方远程图片：

1. 先下载到临时文件
2. 再上传到博客
3. 替换成博客自己的图片 URL

如果远程图片已经是当前博客域名下的 `/api/images/...`，直接保留，不要重复下载和上传。

如果下载失败，保留原图 URL，并在最终结果里提示。

### 7. 让用户确认发布参数

确认三件事：

1. 标题
2. 分类
3. 状态：`draft` 或 `published`

默认用 `draft`。

### 8. 发布

```bash
curl -s -X POST "https://your-domain.com/api/posts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "The Title",
    "content": "Full processed Markdown content",
    "category": "selected-category-or-empty",
    "status": "draft",
    "slug": "optional-custom-slug",
    "description": "optional summary",
    "tags": ["optional", "tags"],
    "cover_image": "optional absolute image URL"
  }'
```

只发送有值的可选字段。`status` 只能是 `draft` 或 `published`；默认用 `draft`，避免误公开。

### 9. 输出结果

```text
Published successfully!

Title: xxx
Status: draft
Category: xxx
Edit: https://your-domain.com/editor?edit=2026-04-16-abc123
View: https://your-domain.com/2026-04-16-abc123
Files: Uploaded N files
```

如果文章是草稿，公开地址可能不可访问，但仍可作为发布后的最终地址。

## 错误处理

- 没有 token：提示去后台生成
- `401`：提示 token 失效或错误
- 上传失败：保留原始引用并提示失败项
- 抓取 URL 失败：提示用户直接粘贴正文
- 内容为空：终止并要求补充内容

## 说明

- 默认发布为草稿
- 支持图片、音频、视频、PDF、Epub 等常见文件上传
- 适合和这个仓库里的 `ecosystem/chrome-clipper`、`ecosystem/obsidian-publisher` 一起使用
