#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPORT_DIR="${REPO_ROOT}/reports/code-quality/knip"

mkdir -p "${REPORT_DIR}"
cd "${REPO_ROOT}"

echo "==> knip: repository dead-code report"
pnpm exec knip --reporter markdown --no-exit-code >"${REPORT_DIR}/knip-report.md"
pnpm exec knip --reporter json --no-exit-code >"${REPORT_DIR}/knip-report.json"
pnpm exec knip --cycles --reporter markdown --no-exit-code >"${REPORT_DIR}/knip-cycles-report.md"
pnpm exec knip --cycles --reporter json --no-exit-code >"${REPORT_DIR}/knip-cycles-report.json"

echo "Knip report: ${REPORT_DIR}/knip-report.md"
