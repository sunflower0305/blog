[![zread](https://raw.githubusercontent.com/sunflower0305/claude-proxy/master/docs/assets/zread-badge.svg)](https://zread.ai/sunflower0305/blog)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?logo=cloudflare&logoColor=white)](https://blog.zhangleyang.com)

[中文](README.md) | [English](README.en.md)

# Leyang Blog

如果你也想拥有一个真正属于自己的学习、写作、分享阵地，而不是把内容完全寄托在平台算法上，此项目就是为你量身定做的。

Leyang Blog 不只是个渲染 Markdown 的静态模板，而是一套完整的博客系统：前后台双编辑器、AI 写作辅助、AI 生图、主题系统、全文检索、API Token、外部发布生态都已经接好，目标就是让你更容易持续写下去。

- 在线示例：<https://blog.zhangleyang.com/>
- 介绍文章：<https://blog.zhangleyang.com/2026-07-10-uxI_bn>
- 项目文档：<https://zread.ai/sunflower0305/blog>

## 为什么值得做成自己的站

- 自媒体账号可能被封，平台流量也可能波动，但自己的站点不会
- 写作系统应该足够轻，打开就能写，而不是被后台流程打断
- AI 最该服务的是摘要、标签、封面、slug、生图这些重复工作
- 博客不该只是展示页，还应该是你的长期知识资产

## 你会得到什么

- 前台、后台都能编辑，所见即所得，接近飞书 / Notion 的写作体验
- 三套首页主题，移动端友好，开箱即用
- Bubble Menu + Ask AI，选中文本就能改写、润色、扩写、翻译
- AI 自动处理摘要、标签、SEO slug、封面图
- AI 生图模型和模板配置、最近生成记录、插入和替换工作流
- 图片右键菜单：下载、设为封面、对齐、裁剪、参考生图
- 发布状态：公开、草稿、密码访问、链接访问
- 默认初始化配置：主题、导航、字体、AI 文本模型模板、AI 生图模型模板
- Cloudflare Workers + D1 + R2 部署，不需要自己维护服务器和 CDN

## 配套博客发布工具也一起开源了

- [`skills/blog-publish-skill`](skills/blog-publish-skill/README.md)：通过 Claude/Codex Skill / 命令工作流直接发布

## 一键部署到 Cloudflare

```bash
pnpm run deploy
```

这个模板已经补好了适合 Deploy Button 的配置：

- Cloudflare 会读取仓库里的 Worker 配置
- 自动创建需要的 `D1` / `R2` 绑定
- 使用仓库里的自定义 deploy script
- 部署时自动应用数据库 schema 和模板默认配置

部署时建议准备这些值：

- `NEXT_PUBLIC_SITE_URL`
- `ADMIN_PASSWORD`
- `ADMIN_TOKEN_SALT`
- `AI_CONFIG_ENCRYPTION_SECRET`
- `AI_API_KEY`（可选）

如果你更想手动掌控 Cloudflare 资源，也可以走 CLI：

```bash
pnpm install
cp .env.example .env.local
pnpm exec wrangler login
pnpm run cf:init -- --site-url=https://your-domain.com
pnpm run cf-typegen
pnpm run deploy
```

`pnpm run cf:init` 会生成或更新 `wrangler.local.toml`，并默认准备 Vinext 需要的 `DB`、`IMAGES` 和 `CACHE` 绑定。

## 本地开发

```bash
git clone https://github.com/sunflower0305/blog.git
cd blog
pnpm install
cp .env.example .env.local
pnpm run dev
```

`pnpm run dev` 默认使用本地 Workers runtime，不连接远程 Cloudflare bindings，启动更快。需要调试 Workers AI 或真实远程绑定时，先运行 `pnpm run cf:init -- --site-url=https://your-domain.com`，再使用：

```bash
pnpm run dev:remote
```

### 环境变量配置

[`config/runtime-env.json`](config/runtime-env.json) 是运行时环境变量的唯一配置契约，统一声明变量名、是否敏感、是否用于本地预览、Cloudflare Deploy Button 展示信息，以及公开默认值。不要分别维护 `.env.example`、`wrangler.toml` 和 `package.json.cloudflare.bindings` 中的变量清单。

- `.env.local`：本机开发和预览的实际值，不提交仓库
- `wrangler.local.toml`：由 `pnpm run cf:init` 生成的 Cloudflare 资源绑定和本地部署配置，不提交仓库
- Cloudflare Secrets：生产环境敏感值，例如管理员密码和 API Key
- `wrangler.toml`：Deploy Button 所需的结构配置和非敏感默认值

修改环境变量契约后运行：

```bash
pnpm run config:generate
pnpm run config:check
```

前者重新生成 `.env.example`，后者检查生成文件、`wrangler.toml` 和 `package.json.cloudflare.bindings` 是否与契约一致。`pnpm run verify` 已包含该检查。

常用入口：

- 首页：`/`
- 后台：`/admin`
- 编辑器：`/editor`

如果你要在 Worker 运行时本地预览：

```bash
pnpm run preview
```

## 默认初始化内容

首次初始化后，模板会自动带上这些基础能力：

- 默认导航
- 默认主题与字体
- 默认分类
- AI 文本模型配置模板
- AI 生图模型配置模板
- 文章摘要、标签、slug、封面生成器
- 编辑器 Ask AI 预设动作

所有 API Key 都不会进入仓库，首次部署时通过 Cloudflare secret 或后台配置补齐。

## 技术栈

- Next.js 16
- React 19
- TypeScript 7
- Vite+（测试与工具链入口）
- Vinext for Cloudflare Workers
- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- Tiptap v3

## 常用命令

| 命令                       | 说明                                                           |
| -------------------------- | -------------------------------------------------------------- |
| `pnpm run dev`             | Vinext 本地开发                                                |
| `pnpm run dev:remote`      | 使用 `wrangler.local.toml` 的远程 Cloudflare bindings 本地开发 |
| `pnpm run build`           | 构建应用                                                       |
| `pnpm run test:run`        | 通过 Vite+ / Vitest 跑测试                                     |
| `pnpm run typecheck`       | 通过 Vite+ 检查全仓 TypeScript 类型                            |
| `pnpm run verify:quick`    | 跑配置检查、格式、lint、全仓类型检查、test、build              |
| `pnpm run verify`          | 跑完整验证链路                                                 |
| `pnpm run config:generate` | 根据环境变量契约生成 `.env.example`                            |
| `pnpm run config:check`    | 检查环境变量配置是否与契约一致                                 |
| `pnpm run quality:report`  | 生成 scc 规模/复杂度与 jscpd 重复代码报告                      |
| `pnpm run quality:check`   | 生成质量报告，并以 6% 重复代码率作为质量门槛                   |
| `pnpm run cf:init`         | 初始化 DB、IMAGES、CACHE 和模板默认设置                        |
| `pnpm run preview`         | Worker 运行时预览                                              |
| `pnpm run deploy`          | 部署到 Cloudflare Workers                                      |
