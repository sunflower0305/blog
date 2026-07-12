#!/usr/bin/env bash

set -euo pipefail

MODE="${1:-full}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

echo "==> clean build artifacts"
rm -rf .next dist

echo "==> pnpm run config:check"
pnpm run config:check

echo "==> pnpm run lint"
pnpm run lint

echo "==> pnpm run test:run"
pnpm run test:run

if [[ "${MODE}" == "full" ]]; then
  echo "==> pnpm run build"
  pnpm run build
else
  echo "==> pnpm run build"
  pnpm run build
fi

echo "Verification complete (${MODE})."
