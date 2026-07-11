#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_PATH="$(bash "${SCRIPT_DIR}/cf-vinext-config.sh")"
DRY_RUN=0
WARM_CDN=1
WARM_CDN_STRICT=0
VINEXT_CACHE_BINDING="${VINEXT_CACHE_BINDING:-CACHE}"
VINEXT_CACHE_PREFIX="${VINEXT_CACHE_PREFIX:-leyang-blog-vinext}"

if [[ "${VINEXT_SKIP_CDN_WARMUP:-0}" == "1" ]]; then
  WARM_CDN=0
fi

for arg in "$@"; do
  case "$arg" in
    --)
      # pnpm forwards a standalone separator to scripts in some invocation styles.
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    --warm-cdn)
      WARM_CDN=1
      ;;
    --no-warm-cdn)
      WARM_CDN=0
      WARM_CDN_STRICT=0
      ;;
    --warm-cdn-strict)
      WARM_CDN=1
      WARM_CDN_STRICT=1
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: pnpm run deploy [--dry-run|--warm-cdn|--no-warm-cdn|--warm-cdn-strict]" >&2
      exit 1
      ;;
  esac
done

cd "${REPO_ROOT}"

upload_prerender_kv_cache() {
  if [[ "${VINEXT_SKIP_PRERENDER_KV_UPLOAD:-0}" == "1" ]]; then
    echo "==> skipping vinext prerender KV upload"
    return 0
  fi

  mkdir -p "${REPO_ROOT}/.wrangler/tmp"

  local kv_file
  kv_file="$(mktemp "${REPO_ROOT}/.wrangler/tmp/vinext-prerender-kv.XXXXXX")"

  set +e
  node --input-type=module - "${REPO_ROOT}" "${kv_file}" "${VINEXT_CACHE_PREFIX}" <<'NODE'
import { buildPrerenderKVPairs } from './node_modules/@vinext/cloudflare/dist/prerender-kv-populate.js'

const [root, outputPath, appPrefix] = process.argv.slice(2)
const { routeCount, pairs } = buildPrerenderKVPairs(`${root}/dist/server`, { appPrefix })

if (pairs.length === 0) {
  console.log('==> no vinext prerender KV entries to upload')
  process.exit(2)
}

await import('node:fs').then(({ writeFileSync }) => {
  writeFileSync(outputPath, `${JSON.stringify(pairs)}\n`)
})

console.log(`==> prepared ${pairs.length} vinext prerender KV entries for ${routeCount} routes`)
NODE
  local node_status=$?
  set -e

  if [[ "${node_status}" == "2" ]]; then
    rm -f "${kv_file}"
    return 0
  fi

  if [[ "${node_status}" != "0" ]]; then
    rm -f "${kv_file}"
    return "${node_status}"
  fi

  local namespace_id
  namespace_id="$(
    node --input-type=module - "${REPO_ROOT}/dist/server/wrangler.json" "${VINEXT_CACHE_BINDING}" <<'NODE'
import fs from 'node:fs'

const [configPath, binding] = process.argv.slice(2)
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const namespace = Array.isArray(config.kv_namespaces)
  ? config.kv_namespaces.find((item) => item?.binding === binding)
  : undefined

if (typeof namespace?.id === 'string' && namespace.id.length > 0) {
  process.stdout.write(namespace.id)
}
NODE
  )"

  if [[ -z "${namespace_id}" ]]; then
    rm -f "${kv_file}"
    echo "❌ Missing KV namespace id for binding ${VINEXT_CACHE_BINDING} in dist/server/wrangler.json" >&2
    return 1
  fi

  WRANGLER_SEND_METRICS=false \
    pnpm exec vp exec wrangler kv bulk put "${kv_file}" \
      --namespace-id "${namespace_id}" \
      --remote

  rm -f "${kv_file}"
}

echo "==> using vinext wrangler config: ${CONFIG_PATH}"
bash "${SCRIPT_DIR}/cf-validate-config.sh" "${CONFIG_PATH}"

rm -rf .next dist

WRANGLER_VINEXT_CONFIG="${CONFIG_PATH}" \
  pnpm exec vp exec vinext-cloudflare deploy --config "${REPO_ROOT}/dist/server/wrangler.json" --dry-run

WRANGLER_VINEXT_CONFIG="${CONFIG_PATH}" \
  pnpm exec vp exec vinext build

rm -rf .next

if [[ ! -f "${REPO_ROOT}/dist/server/wrangler.json" ]]; then
  echo "❌ Missing vinext build Wrangler config: ${REPO_ROOT}/dist/server/wrangler.json" >&2
  exit 1
fi

node --input-type=module - "${REPO_ROOT}/dist/server/wrangler.json" <<'NODE'
import fs from 'node:fs'

const configPath = process.argv[2]
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

if (Array.isArray(config.routes) && config.routes.length > 0 && process.env.VINEXT_ALLOW_ROUTES !== '1') {
  console.error('❌ Refusing to deploy vinext with routes unless VINEXT_ALLOW_ROUTES=1 is set.')
  process.exit(1)
}

const cache = Array.isArray(config.kv_namespaces)
  ? config.kv_namespaces.find((item) => item?.binding === 'CACHE')
  : undefined

if (!cache?.id) {
  console.error('❌ Missing KV namespace id for binding CACHE in dist/server/wrangler.json')
  process.exit(1)
}
NODE

deploy_args=(deploy --config "${REPO_ROOT}/dist/server/wrangler.json" --skip-build)

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "==> running vinext Wrangler deploy dry-run"
  WRANGLER_SEND_METRICS=false \
    pnpm exec vp exec wrangler deploy -c "${REPO_ROOT}/dist/server/wrangler.json" --dry-run
  exit 0
fi

if [[ "${WARM_CDN}" == "1" ]]; then
  deploy_args+=(--experimental-warm-cdn-cache)
fi

if [[ "${WARM_CDN_STRICT}" == "1" ]]; then
  deploy_args+=(--warm-cdn-strict)
fi

if [[ "${VINEXT_PRERENDER_ALL:-0}" == "1" ]]; then
  deploy_args+=(--prerender-all)
fi

if [[ -n "${VINEXT_PRERENDER_CONCURRENCY:-}" ]]; then
  deploy_args+=(--prerender-concurrency "${VINEXT_PRERENDER_CONCURRENCY}")
fi

if [[ "${VINEXT_EXPERIMENTAL_TPR:-0}" == "1" ]]; then
  deploy_args+=(--experimental-tpr)
fi

if [[ -n "${VINEXT_TPR_COVERAGE:-}" ]]; then
  deploy_args+=(--tpr-coverage "${VINEXT_TPR_COVERAGE}")
fi

if [[ -n "${VINEXT_TPR_LIMIT:-}" ]]; then
  deploy_args+=(--tpr-limit "${VINEXT_TPR_LIMIT}")
fi

if [[ -n "${VINEXT_TPR_WINDOW:-}" ]]; then
  deploy_args+=(--tpr-window "${VINEXT_TPR_WINDOW}")
fi

if [[ -n "${VINEXT_WORKER_NAME:-}" ]]; then
  deploy_args+=(--name "${VINEXT_WORKER_NAME}")
fi

if [[ -n "${VINEXT_CF_ENV:-}" ]]; then
  deploy_args+=(--env "${VINEXT_CF_ENV}")
fi

upload_prerender_kv_cache

echo "==> deploying vinext Worker with @vinext/cloudflare"

WRANGLER_SEND_METRICS=false \
  WRANGLER_VINEXT_CONFIG="${CONFIG_PATH}" \
  pnpm exec vp exec vinext-cloudflare "${deploy_args[@]}"
