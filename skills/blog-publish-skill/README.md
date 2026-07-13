# leyang-blog-publish Skill

这个目录放的是配套的 Claude Skill，用来把 Markdown、纯文本或网页内容直接发布到你自己的 Leyang Blog。

Skill 名称和命令是 `leyang-blog-publish`，源码目录是 `skills/blog-publish-skill/`。

## 能做什么

- 发布本地 Markdown 文件到博客
- 抓取网页正文后发布到博客
- 自动上传本地图片和第三方图片
- 选择分类和发布状态

## 安装

把这个目录复制或软链接到：

```bash
.codex/skills/leyang-blog-publish/
```

至少需要保留：

- `SKILL.md`

## 配置

推荐两种方式之一：

### 1. 环境变量

```bash
export LEYANG_BLOG_API_URL="https://your-domain.com"
export LEYANG_BLOG_API_TOKEN="blog_xxx"
```

### 2. 配置文件

```json
{
  "apiUrl": "https://your-domain.com",
  "token": "blog_xxx"
}
```

保存到：

```bash
.codex/skills/leyang-blog-publish/config.json
```

API Token 可以在你自己的博客后台 `设置 -> API Token` 里生成。

## 使用示例

```bash
/leyang-blog-publish ~/Documents/my-article.md
/leyang-blog-publish https://example.com/article
```

也可以直接说：

- “把这篇文章发布到博客”
- “发布成草稿”
- “发到 Leyang Blog”
