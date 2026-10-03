#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_PATH="$(bash "${SCRIPT_DIR}/cf-vinext-config.sh")"
DRY_RUN=0
WARM_CDN=1

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
      ;;
    --warm-cdn-strict)
      # Vinext 1.0.1 blocks promotion on warmup failure by default.
      WARM_CDN=1
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: pnpm run deploy [--dry-run|--warm-cdn|--no-warm-cdn|--warm-cdn-strict]" >&2
      exit 1
      ;;
  esac
done

cd "${REPO_ROOT}"

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

DEPLOY_WORKER_NAME="$(
  node "${SCRIPT_DIR}/cf-worker-name.mjs" "${REPO_ROOT}/dist/server/wrangler.json"
)"

echo "==> targeting Cloudflare Worker: ${DEPLOY_WORKER_NAME}"

deploy_args=(
  deploy
  --config "${REPO_ROOT}/dist/server/wrangler.json"
  --skip-build
  --name "${DEPLOY_WORKER_NAME}"
)

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "==> running vinext Wrangler deploy dry-run"
  WRANGLER_SEND_METRICS=false \
    pnpm exec vp exec wrangler deploy -c "${REPO_ROOT}/dist/server/wrangler.json" --dry-run
  exit 0
fi

if [[ "${WARM_CDN}" == "1" ]]; then
  deploy_args+=(--warm-cache)
fi

if [[ "${VINEXT_PRERENDER_ALL:-0}" == "1" ]]; then
  deploy_args+=(--prerender-all)
fi

if [[ -n "${VINEXT_PRERENDER_CONCURRENCY:-}" ]]; then
  deploy_args+=(--prerender-concurrency "${VINEXT_PRERENDER_CONCURRENCY}")
fi

if [[ "${VINEXT_EXPERIMENTAL_TPR:-0}" == "1" ]]; then
  deploy_args+=(--traffic-aware-warm-cache)
fi

if [[ -n "${VINEXT_TPR_COVERAGE:-}" ]]; then
  deploy_args+=(--traffic-aware-coverage "${VINEXT_TPR_COVERAGE}")
fi

if [[ -n "${VINEXT_TPR_LIMIT:-}" ]]; then
  deploy_args+=(--traffic-aware-limit "${VINEXT_TPR_LIMIT}")
fi

if [[ -n "${VINEXT_TPR_WINDOW:-}" ]]; then
  deploy_args+=(--traffic-aware-window "${VINEXT_TPR_WINDOW}")
fi

if [[ -n "${VINEXT_CF_ENV:-}" ]]; then
  deploy_args+=(--env "${VINEXT_CF_ENV}")
fi

echo "==> deploying vinext Worker with @vinext/cloudflare"

WRANGLER_SEND_METRICS=false \
  WRANGLER_VINEXT_CONFIG="${CONFIG_PATH}" \
  pnpm exec vp exec vinext-cloudflare "${deploy_args[@]}"
