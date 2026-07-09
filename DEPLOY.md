# 部署指南

Leyang Blog Open Source 的正式部署方式是 `Vinext + Cloudflare Workers`。

## 首次部署

### 1. 安装依赖和环境变量

```bash
pnpm install
cp .env.example .env.local
```

至少填写：

```env
ADMIN_PASSWORD=change-me
ADMIN_TOKEN_SALT=change-me-to-a-random-string
AI_CONFIG_ENCRYPTION_SECRET=change-me-to-another-random-string
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

### 2. 登录 Cloudflare

```bash
pnpm exec wrangler login
```

### 3. 初始化资源

```bash
pnpm run cf:init -- --site-url=https://your-domain.com
```

这一步会生成或更新本地的 `wrangler.local.toml`，并自动写入真实 D1 / R2 / KV 绑定。其中 Vinext 使用的 `CACHE` KV 现在是默认初始化资源，不需要再额外传 `--with-kv`。

### 4. 设置 secrets

```bash
pnpm exec wrangler secret put ADMIN_PASSWORD -c wrangler.local.toml
pnpm exec wrangler secret put ADMIN_TOKEN_SALT -c wrangler.local.toml
pnpm exec wrangler secret put AI_CONFIG_ENCRYPTION_SECRET -c wrangler.local.toml
```

如需外部 AI：

```bash
pnpm exec wrangler secret put AI_API_KEY -c wrangler.local.toml
```

### 5. 生成类型并部署

```bash
pnpm run cf-typegen
pnpm run build
pnpm run deploy
```

## 本地 Worker 预览

```bash
pnpm run preview
```

脚本会优先读取 `wrangler.local.toml`。模板仓库里的 `wrangler.toml` 不带真实资源绑定，不能直接拿来部署生产。

## 日常更新

```bash
git pull
pnpm install
pnpm run verify
pnpm run deploy
```

## 常见问题

### `pnpm run deploy` 报缺少 D1、R2 或 CACHE

先执行：

```bash
pnpm run cf:init -- --site-url=https://your-domain.com
```

### 后台登录提示鉴权未配置完成

至少补齐：

```bash
pnpm exec wrangler secret put ADMIN_PASSWORD -c wrangler.local.toml
pnpm exec wrangler secret put ADMIN_TOKEN_SALT -c wrangler.local.toml
```

### AI Provider 已保存的 Key 无法解密

通常是 `AI_CONFIG_ENCRYPTION_SECRET` 或 `ADMIN_TOKEN_SALT` 被改了。建议固定 `AI_CONFIG_ENCRYPTION_SECRET`，不要和 token salt 复用。

### RSS / sitemap / canonical 指向错域名

检查：

- `.env.local`
- `wrangler.local.toml`

两处的 `NEXT_PUBLIC_SITE_URL` 必须一致。
