---
name: leyang-blog-publish
description: 将 Markdown 文件、正文或 URL 发布到 Leyang Blog，支持草稿/公开发布、分类、frontmatter，以及本地和第三方媒体上传。用户要求“发布到博客”“发到 Leyang Blog”“发布成草稿”“publish to blog”或“publish draft”时使用。
---

# 发布内容到 Leyang Blog

## 配置

把“Skill 目录”理解为当前加载的 `SKILL.md` 所在目录，不能理解为当前工作目录。分别解析 `apiUrl` 和 token；不要输出、记录或在最终回复中展示 token。

**配置文件查找顺序：**

1. 当前 Skill 目录下的 `config.json`
2. 用户级安装目录：`${CODEX_HOME}/skills/leyang-blog-publish/config.json`
3. 未设置 `CODEX_HOME` 时：`~/.codex/skills/leyang-blog-publish/config.json`

候选路径可能指向同一文件；先规范化并去重。即使当前加载的是仓库内 `.codex/skills/leyang-blog-publish/SKILL.md`，也必须继续检查用户级安装目录，不能只检查仓库副本。

**API Base URL 取值优先级：**

1. 用户在当前请求里明确提供的博客根域名
2. 环境变量 `LEYANG_BLOG_API_URL`
3. 按上述顺序找到的首个非空 `apiUrl`

API Base URL 必须是博客根域名，例如 `https://your-domain.com`，不要带 `/api` 后缀。

**Token 读取优先级：**

1. 环境变量 `LEYANG_BLOG_API_TOKEN`
2. 按上述顺序找到的首个非空 `token`

如果没有 token，提示用户：

1. 打开 `https://your-domain.com/admin/settings`
2. 在 `API Token` 页面生成 token
3. 保存到用户级安装目录的 `config.json`：

```json
{
  "apiUrl": "https://your-domain.com",
  "token": "blog_xxx"
}
```

## 工作流

### 1. 解析输入与配置

- 文件路径：读取本地 Markdown 或文本文件
- URL：抓取正文并转成 Markdown
- 纯文本：直接作为正文使用
- 按“配置”一节独立解析 `apiUrl` 和 token
- 如果仍缺少任一配置，报告已检查的路径并停止，不要尝试发布

### 2. 拉取并解析分类

```bash
curl -s "https://your-domain.com/api/admin/categories" \
  -H "Authorization: Bearer $TOKEN"
```

如果用户已指定分类，先按 `name` 精确匹配，再按 `slug` 匹配；匹配成功后提交该分类的 `slug`，不要重复询问。只有分类缺失、无匹配或存在歧义时才询问；用户不选时可以留空。

### 3. 解析文章

标题优先级：

1. YAML frontmatter 的 `title`
2. 第一条 `# Heading`
3. 文件名

正文处理：

- 去掉 frontmatter
- 如果标题来自第一条 `# Heading`，则移除这条 heading，避免重复
- 其余 Markdown 原样保留
- 可从 frontmatter 读取 `title`、`slug`、`category`、`status`、`description`、`tags`、`cover_image`
- 发布参数优先级为：用户当前请求 > frontmatter > Skill 默认值

### 4. 上传本地媒体

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

图片使用响应中的 `url` 保存原始地址，不使用 `variants.content`；图片尺寸和 AVIF/WebP 格式由博客展示层根据浏览器能力自动处理。上传接口通常返回相对路径 `/api/images/...`，发布正文里应转换成博客绝对 URL，避免跨平台复制时丢失域名。

上传前确认所有本地路径存在。每次上传都校验 HTTP 状态码、响应是否为合法 JSON，以及 `success` 和 `url`；失败时不要把错误响应当成图片 URL。

### 5. 转存第三方图片

如果 Markdown 中有第三方远程图片：

1. 先下载到临时文件
2. 再上传到博客
3. 替换成博客自己的图片 URL

如果远程图片已经是当前博客域名下的 `/api/images/...`，直接保留，不要重复下载和上传。

如果下载失败，保留原图 URL，并在最终结果里提示。

### 6. 确定发布参数

确定三件事：

1. 标题
2. 分类
3. 状态：`draft` 或 `published`

状态未指定时默认用 `draft`。标题、分类和状态已经能从用户请求、frontmatter 或默认值唯一确定时，不要重复询问；只有值缺失或有歧义时才暂停确认。

### 7. 发布

```bash
curl -s -X POST "https://your-domain.com/api/posts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @payload.json
```

使用可靠的 JSON 序列化工具构造请求体，不能手工拼接或插值 Markdown，以免引号、换行和反斜杠破坏 JSON。可以使用安全的临时文件或通过标准输入传给 `curl`，结束后清理临时文件。只发送有值的可选字段。`status` 只能是 `draft` 或 `published`。

提交后校验 HTTP 状态码、响应是否为合法 JSON、`success` 是否为 `true`，并从响应读取最终 `slug`。网络结果不明确时先查询是否已创建，避免盲目重试生成重复文章。

### 8. 输出结果

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
- `404` 或分类无匹配：重新拉取分类并提示可选分类
- 非 2xx 或非法 JSON：保留响应摘要，停止后续步骤
- 上传失败：保留原始引用并提示失败项
- 抓取 URL 失败：提示用户直接粘贴正文
- 内容为空：终止并要求补充内容

## 说明

- 默认发布为草稿
- 支持图片、音频、视频、PDF、Epub 等常见文件上传
- 适合和这个仓库里的 `ecosystem/chrome-clipper`、`ecosystem/obsidian-publisher` 一起使用
