#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_PATH="$(VINEXT_INCLUDE_LOCAL_SECRETS=1 bash "${SCRIPT_DIR}/cf-vinext-config.sh")"
PORT="${VINEXT_PREVIEW_PORT:-8789}"

cd "${REPO_ROOT}"

echo "==> using vinext wrangler config: ${CONFIG_PATH}"
bash "${SCRIPT_DIR}/cf-validate-config.sh" "${CONFIG_PATH}"

rm -rf .next dist

WRANGLER_VINEXT_CONFIG="${CONFIG_PATH}" \
  XDG_CONFIG_HOME=.wrangler/xdg \
  WRANGLER_LOG_PATH=.wrangler/logs \
  pnpm exec vp exec vinext build

rm -rf .next

echo "==> starting vinext Cloudflare preview on http://127.0.0.1:${PORT}"
WRANGLER_VINEXT_CONFIG="${CONFIG_PATH}" \
  WRANGLER_SEND_METRICS=false \
  XDG_CONFIG_HOME=.wrangler/xdg \
  WRANGLER_LOG_PATH=.wrangler/logs \
  pnpm exec vp preview --host 127.0.0.1 --port "${PORT}"
