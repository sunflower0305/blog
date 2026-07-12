import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  readRuntimeEnvContract,
  renderEnvExample,
  validateRuntimeEnvFiles,
} from '../../scripts/runtime-env-config.mjs'

describe('runtime environment contract', () => {
  it('generates the committed env example', () => {
    const contract = readRuntimeEnvContract()

    expect(renderEnvExample(contract)).toBe(readFileSync('.env.example', 'utf8'))
  })

  it('keeps Wrangler public defaults aligned with the contract', () => {
    const contract = readRuntimeEnvContract()

    expect(
      validateRuntimeEnvFiles(contract, {
        envExamplePath: join(process.cwd(), '.env.example'),
        wranglerPath: join(process.cwd(), 'wrangler.toml'),
      }),
    ).toEqual([])
  })

  it('reports drift in generated and Wrangler configuration', () => {
    const contract = readRuntimeEnvContract()
    const directory = mkdtempSync(join(tmpdir(), 'runtime-env-config-'))
    const envExamplePath = join(directory, '.env.example')
    const wranglerPath = join(directory, 'wrangler.toml')
    writeFileSync(envExamplePath, 'AI_MODEL=wrong\n')
    writeFileSync(wranglerPath, '[vars]\nAI_MODEL = "wrong"\n')

    const errors = validateRuntimeEnvFiles(contract, { envExamplePath, wranglerPath })

    expect(errors.some((error) => error.endsWith('.env.example is not generated from config/runtime-env.json'))).toBe(true)
    expect(errors).toContain('wrangler.toml [vars].AI_MODEL must equal contract default "gpt-4o-mini"')
  })
})
