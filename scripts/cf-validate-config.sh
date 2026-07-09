#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <wrangler-config-path>" >&2
  exit 1
fi

CONFIG_PATH="$1"

if [[ ! -f "${CONFIG_PATH}" ]]; then
  echo "❌ Wrangler config not found: ${CONFIG_PATH}" >&2
  exit 1
fi

validate_json_config() {
  node --input-type=module - "${CONFIG_PATH}" <<'NODE'
import fs from 'node:fs'

const configPath = process.argv[2]

function stripJsonComments(source) {
  let output = ''
  let inString = false
  let quote = ''
  let escaped = false

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    const next = source[i + 1]

    if (inString) {
      output += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        inString = false
      }
      continue
    }

    if (char === '"' || char === "'") {
      inString = true
      quote = char
      output += char
      continue
    }

    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      output += '\n'
      continue
    }

    if (char === '/' && next === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1
      i += 1
      continue
    }

    output += char
  }

  return output
}

function fail(message) {
  console.error(`❌ ${message}`)
  process.exit(1)
}

const config = JSON.parse(stripJsonComments(fs.readFileSync(configPath, 'utf8')))
const d1 = config.d1_databases?.find((binding) => binding.binding === 'DB')
const r2 = config.r2_buckets?.find((binding) => binding.binding === 'IMAGES')
const cache = config.kv_namespaces?.find((binding) => binding.binding === 'CACHE')
const siteUrl = config.vars?.NEXT_PUBLIC_SITE_URL

if (!d1) fail(`Missing D1 binding DB in ${configPath}`)
if (!d1.database_id || d1.database_id === d1.database_name) {
  fail(`D1 binding DB must include a concrete database_id in ${configPath}`)
}

if (!r2) fail(`Missing R2 binding IMAGES in ${configPath}`)
if (!r2.bucket_name) fail(`R2 binding IMAGES must include bucket_name in ${configPath}`)

if (!cache) fail(`Missing KV binding CACHE in ${configPath}`)
if (!cache.id) fail(`KV binding CACHE must include a concrete namespace id in ${configPath}`)

if (!/^https?:\/\/[^"]+/.test(siteUrl ?? '')) {
  fail(`Missing NEXT_PUBLIC_SITE_URL in ${configPath}`)
}

if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|example\.com)(:[0-9]+)?\/?$/.test(siteUrl)) {
  fail(`NEXT_PUBLIC_SITE_URL points to a local or placeholder host in ${configPath}`)
}

console.log(`==> validated Cloudflare bindings in ${configPath}`)
NODE
}

case "${CONFIG_PATH}" in
  *.json | *.jsonc)
    validate_json_config
    exit 0
    ;;
esac

require_binding() {
  local section_pattern="$1"
  local binding_pattern="$2"
  local description="$3"

  if ! rg -q "^[[:space:]]*${section_pattern}[[:space:]]*$" "${CONFIG_PATH}"; then
    echo "❌ Missing ${description} section in ${CONFIG_PATH}" >&2
    exit 1
  fi

  if ! rg -q "^[[:space:]]*${binding_pattern}[[:space:]]*$" "${CONFIG_PATH}"; then
    echo "❌ Missing ${description} binding in ${CONFIG_PATH}" >&2
    exit 1
  fi
}

require_binding "\\[\\[d1_databases\\]\\]" 'binding = "DB"' "D1"
require_binding "\\[\\[r2_buckets\\]\\]" 'binding = "IMAGES"' "R2"
require_binding "\\[\\[kv_namespaces\\]\\]" 'binding = "CACHE"' "KV CACHE"

if ! rg -q 'NEXT_PUBLIC_SITE_URL[[:space:]]*=[[:space:]]*"https?://[^"]+"' "${CONFIG_PATH}"; then
  echo "❌ Missing NEXT_PUBLIC_SITE_URL in ${CONFIG_PATH}" >&2
  exit 1
fi

if rg -q 'NEXT_PUBLIC_SITE_URL[[:space:]]*=[[:space:]]*"https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|example\.com)(:[0-9]+)?/?\"' "${CONFIG_PATH}"; then
  echo "❌ NEXT_PUBLIC_SITE_URL points to a local or placeholder host in ${CONFIG_PATH}" >&2
  exit 1
fi

echo "==> validated Cloudflare bindings in ${CONFIG_PATH}"
