#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_PATH="$(VINEXT_INCLUDE_LOCAL_SECRETS=1 bash "${SCRIPT_DIR}/cf-vinext-config.sh")"

cd "${REPO_ROOT}"

if [[ -z "${WRANGLER_VINEXT_CONFIG:-}" && "${CONFIG_PATH}" == "${REPO_ROOT}/wrangler.toml" ]]; then
  echo "❌ Remote Vinext dev requires concrete Cloudflare bindings in wrangler.local.toml." >&2
  echo "   Run: pnpm run cf:init -- --site-url=https://your-domain.com" >&2
  exit 1
fi

echo "==> using vinext wrangler config: ${CONFIG_PATH}"
bash "${SCRIPT_DIR}/cf-validate-config.sh" "${CONFIG_PATH}"

WRANGLER_VINEXT_CONFIG="${CONFIG_PATH}" \
  pnpm exec vp exec vinext dev
