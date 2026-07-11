import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('cf-vinext-config', () => {
  it('copies only allowed local secrets into the generated preview bindings', () => {
    const repo = mkdtempSync(join(tmpdir(), 'cf-vinext-config-'))
    const scripts = join(repo, 'scripts')
    mkdirSync(scripts)

    for (const name of ['cf-vinext-config.sh', 'cf-config.sh']) {
      const source = join(process.cwd(), 'scripts', name)
      const target = join(scripts, name)
      copyFileSync(source, target)
      chmodSync(target, 0o755)
    }

    writeFileSync(join(repo, 'wrangler.toml'), `
name = "test-worker"
main = "vinext/server/app-router-entry"
compatibility_date = "2026-04-14"

[vars]
NEXT_PUBLIC_SITE_URL = "https://example.com"
`)
    writeFileSync(join(repo, 'wrangler.local.toml'), `
name = "test-worker"

[[d1_databases]]
binding = "DB"
database_name = "test-db"
database_id = "00000000-0000-0000-0000-000000000000"
`)
    writeFileSync(join(repo, '.env.local'), `
ADMIN_PASSWORD="local password"
ADMIN_TOKEN_SALT=local-salt
AI_CONFIG_ENCRYPTION_SECRET='local-encryption-secret'
UNRELATED_SECRET=must-not-be-copied
`)

    const script = join(scripts, 'cf-vinext-config.sh')
    const productionOutputPath = execFileSync('bash', [script], {
      cwd: repo,
      encoding: 'utf8',
    }).trim()
    const productionConfig = JSON.parse(readFileSync(productionOutputPath, 'utf8'))
    expect(productionConfig.vars.ADMIN_PASSWORD).toBeUndefined()

    const outputPath = execFileSync('bash', [script], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, VINEXT_INCLUDE_LOCAL_SECRETS: '1' },
    }).trim()
    const config = JSON.parse(readFileSync(outputPath, 'utf8'))

    expect(config.vars).toMatchObject({
      ADMIN_PASSWORD: 'local password',
      ADMIN_TOKEN_SALT: 'local-salt',
      AI_CONFIG_ENCRYPTION_SECRET: 'local-encryption-secret',
    })
    expect(config.vars.UNRELATED_SECRET).toBeUndefined()
    expect(statSync(outputPath).mode & 0o777).toBe(0o600)
  })
})
