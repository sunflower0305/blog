import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('cf-deploy-vinext arguments', () => {
  it('accepts a standalone separator and validates the following argument', () => {
    const result = spawnSync('bash', ['scripts/cf-deploy-vinext.sh', '--', '--bogus'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Unknown argument: --bogus')
    expect(result.stderr).not.toContain('Unknown argument: --\n')
    expect(result.stderr).toContain(
      'Usage: pnpm run deploy [--dry-run|--warm-cdn|--no-warm-cdn|--warm-cdn-strict]',
    )
  })
})
