#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_CONFIG_PATH="${REPO_ROOT}/wrangler.toml"
RUNTIME_ENV_CONTRACT_PATH="${REPO_ROOT}/config/runtime-env.json"
OUTPUT_CONFIG_PATH="${REPO_ROOT}/.wrangler/wrangler.vinext.local.jsonc"

if [[ -n "${WRANGLER_VINEXT_CONFIG:-}" ]]; then
  case "${WRANGLER_VINEXT_CONFIG}" in
    /*) printf '%s\n' "${WRANGLER_VINEXT_CONFIG}" ;;
    *) printf '%s\n' "${REPO_ROOT}/${WRANGLER_VINEXT_CONFIG}" ;;
  esac
  exit 0
fi

RESOURCE_CONFIG_PATH="$(bash "${SCRIPT_DIR}/cf-config.sh")"

if [[ ! -f "${RESOURCE_CONFIG_PATH}" || "${RESOURCE_CONFIG_PATH}" == "${REPO_ROOT}/wrangler.toml" ]]; then
  printf '%s\n' "${BASE_CONFIG_PATH}"
  exit 0
fi

mkdir -p "${REPO_ROOT}/.wrangler"

node --input-type=module - "${BASE_CONFIG_PATH}" "${RESOURCE_CONFIG_PATH}" "${OUTPUT_CONFIG_PATH}" "${RUNTIME_ENV_CONTRACT_PATH}" <<'NODE'
import fs from 'node:fs'

const [baseConfigPath, resourceConfigPath, outputConfigPath, contractPath] = process.argv.slice(2)

function parseTomlString(value) {
  const match = value.match(/^\s*"((?:\\"|[^"])*)"/)
  if (!match) return undefined
  return match[1].replace(/\\"/g, '"')
}

function parseTomlStringArray(value) {
  const match = value.match(/^\s*\[(.*)\]\s*$/)
  if (!match) return undefined
  const items = []
  const source = match[1]
  const stringPattern = /"((?:\\"|[^"])*)"/g
  let item
  while ((item = stringPattern.exec(source))) {
    items.push(item[1].replace(/\\"/g, '"'))
  }
  return items
}

function parseTomlValue(value) {
  const arrayValue = parseTomlStringArray(value)
  if (arrayValue !== undefined) return arrayValue
  const stringValue = parseTomlString(value)
  if (stringValue !== undefined) return stringValue
  if (/^\s*true\b/.test(value)) return true
  if (/^\s*false\b/.test(value)) return false
  const numberMatch = value.match(/^\s*([0-9]+)\b/)
  if (numberMatch) return Number(numberMatch[1])
  return undefined
}

function parseWranglerToml(source) {
  const result = {
    name: undefined,
    main: undefined,
    compatibility_date: undefined,
    compatibility_flags: undefined,
    workers_dev: undefined,
    routes: [],
    dev: {},
    assets: undefined,
    cache: undefined,
    ai: undefined,
    vars: {},
    kv_namespaces: [],
    d1_databases: [],
    r2_buckets: [],
  }
  let section = 'root'
  let current = null

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim()
    if (!line) continue

    if (section === 'routes') {
      if (line.startsWith(']')) {
        section = 'root'
        continue
      }

      const routeMatch = line.match(/\{\s*pattern\s*=\s*"([^"]+)"(?:\s*,\s*custom_domain\s*=\s*(true|false))?\s*\}/)
      if (routeMatch) {
        const [, pattern, customDomain] = routeMatch
        const route = { pattern }
        if (customDomain !== undefined) route.custom_domain = customDomain === 'true'
        result.routes.push(route)
      }
      continue
    }

    if (line === '[[d1_databases]]') {
      current = {}
      result.d1_databases.push(current)
      section = 'd1_databases'
      continue
    }

    if (line === '[[kv_namespaces]]') {
      current = {}
      result.kv_namespaces.push(current)
      section = 'kv_namespaces'
      continue
    }

    if (line === '[[r2_buckets]]') {
      current = {}
      result.r2_buckets.push(current)
      section = 'r2_buckets'
      continue
    }

    if (/^routes\s*=\s*\[/.test(line)) {
      section = 'routes'
      current = null
      continue
    }

    const tableMatch = line.match(/^\[([^\]]+)\]$/)
    if (tableMatch) {
      section = tableMatch[1]
      current = null
      continue
    }

    const keyValueMatch = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/)
    if (!keyValueMatch) continue

    const [, key, rawValue] = keyValueMatch
    const value = parseTomlValue(rawValue)
    if (value === undefined) continue

    if (section === 'root') {
      result[key] = value
    } else if (section === 'root' && key === 'workers_dev') {
      result.workers_dev = value
    } else if (section === 'vars') {
      result.vars[key] = value
    } else if (section === 'dev') {
      result.dev[key] = value
    } else if (section === 'assets') {
      result.assets ??= {}
      result.assets[key] = value
    } else if (section === 'cache') {
      result.cache ??= {}
      result.cache[key] = value
    } else if (section === 'ai') {
      result.ai ??= {}
      result.ai[key] = value
    } else if ((section === 'd1_databases' || section === 'r2_buckets' || section === 'kv_namespaces') && current) {
      current[key] = value
    }
  }

  return result
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

const baseConfig = parseWranglerToml(fs.readFileSync(baseConfigPath, 'utf8'))
const resourceConfig = parseWranglerToml(fs.readFileSync(resourceConfigPath, 'utf8'))
const runtimeEnvContract = JSON.parse(fs.readFileSync(contractPath, 'utf8'))
const contractDefaults = Object.fromEntries(
  runtimeEnvContract.variables
    .filter((variable) => variable.wranglerVar)
    .map((variable) => [variable.key, variable.defaults?.wrangler ?? '']),
)
const localSecrets = {}

if (process.env.VINEXT_INCLUDE_LOCAL_SECRETS === '1') {
  const localEnvPath = new URL('../.env.local', `file://${outputConfigPath}`)
  const localOnlyKeys = new Set(
    runtimeEnvContract.variables
      .filter((variable) => variable.localPreview)
      .map((variable) => variable.key),
  )

  if (fs.existsSync(localEnvPath)) {
    for (const rawLine of fs.readFileSync(localEnvPath, 'utf8').split(/\r?\n/)) {
      const match = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!match || !localOnlyKeys.has(match[1])) continue

      let value = match[2]
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (value) localSecrets[match[1]] = value
    }
  }
}
const d1 = resourceConfig.d1_databases.find((binding) => binding.binding === 'DB')
const r2 = resourceConfig.r2_buckets.find((binding) => binding.binding === 'IMAGES')
const cache = resourceConfig.kv_namespaces.find((binding) => binding.binding === 'CACHE')

const vinextConfig = compactObject({
  name: process.env.VINEXT_WORKER_NAME || resourceConfig.name || baseConfig.name,
  main: baseConfig.main,
  compatibility_date: baseConfig.compatibility_date,
  compatibility_flags: baseConfig.compatibility_flags,
  assets: baseConfig.assets,
  cache: baseConfig.cache,
  ai: baseConfig.ai,
  dev: Object.keys(baseConfig.dev ?? {}).length > 0 ? baseConfig.dev : undefined,
  d1_databases: baseConfig.d1_databases,
  r2_buckets: baseConfig.r2_buckets,
  kv_namespaces: baseConfig.kv_namespaces,
  vars: {
    ...contractDefaults,
    ...(baseConfig.vars ?? {}),
    ...resourceConfig.vars,
    ...localSecrets,
  },
})

if (d1?.database_id) {
  vinextConfig.d1_databases = [
    {
      binding: 'DB',
      database_name: d1.database_name,
      database_id: d1.database_id,
      remote: true,
    },
  ]
}

if (r2?.bucket_name) {
  vinextConfig.r2_buckets = [
    {
      binding: 'IMAGES',
      bucket_name: r2.bucket_name,
      remote: true,
    },
  ]
}

if (cache?.id) {
  vinextConfig.kv_namespaces = [
    {
      binding: 'CACHE',
      id: cache.id,
      remote: true,
    },
  ]
}

if (process.env.VINEXT_INCLUDE_ROUTES === '1') {
  if (resourceConfig.workers_dev !== undefined) {
    vinextConfig.workers_dev = resourceConfig.workers_dev
  }
  if (resourceConfig.routes.length > 0) {
    vinextConfig.routes = resourceConfig.routes
  }
} else {
  delete vinextConfig.routes
  delete vinextConfig.workers_dev
}

fs.writeFileSync(outputConfigPath, `${JSON.stringify(vinextConfig, null, 2)}\n`, { mode: 0o600 })
fs.chmodSync(outputConfigPath, 0o600)
NODE

printf '%s\n' "${OUTPUT_CONFIG_PATH}"
