#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="$(bash "${SCRIPT_DIR}/cf-config.sh")"

echo "==> using wrangler config: ${CONFIG_PATH}"
pnpm exec wrangler types --env-interface CloudflareEnv -c "${CONFIG_PATH}"
