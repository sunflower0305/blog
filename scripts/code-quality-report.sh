#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPORT_DIR="${REPO_ROOT}/reports/code-quality"
MODE="${1:---report}"

if [[ "${MODE}" != "--report" && "${MODE}" != "--check" ]]; then
  echo "Usage: $0 [--report|--check]" >&2
  exit 2
fi

for command_name in sloc jscpd node vp; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 127
  fi
done

mkdir -p "${REPORT_DIR}/jscpd/production" "${REPORT_DIR}/jscpd/tests"
cd "${REPO_ROOT}"

PRODUCTION_PATHS=(
  app
  components
  lib
  tools/wechat-bridge
)
TEST_PATHS=(
  tests
)
TOOLING_PATHS=(
  scripts
  vite.config.ts
  next.config.ts
)

run_sloc_report() {
  local report_name="$1"
  shift
  echo "==> sloc: ${report_name}"
  sloc "$@" \
    --include '.*\.(ts|tsx|js|mjs|sh)$' \
    --format json \
    >"${REPORT_DIR}/sloc-${report_name}-report.json"
}

run_sloc_report production "${PRODUCTION_PATHS[@]}"
run_sloc_report tests "${TEST_PATHS[@]}"
run_sloc_report tooling "${TOOLING_PATHS[@]}"

echo "==> lint: Oxlint quality metrics"
CODE_SIZE_CHECK=0
if [[ "${MODE}" == "--check" ]]; then
  CODE_SIZE_CHECK=1
fi
CODE_QUALITY_SIZE_CHECK="${CODE_SIZE_CHECK}" vp lint \
  --format json \
  --ignore-pattern 'dist/**' \
  --ignore-pattern '.wrangler/**' \
  --ignore-pattern 'worker-configuration.d.ts' \
  >"${REPORT_DIR}/lint-report.json"

JSPCD_THRESHOLD_ARGS=()
JSPCD_THRESHOLD_LABEL="configured"
if [[ "${MODE}" == "--report" ]]; then
  JSPCD_THRESHOLD_ARGS=(--threshold 100)
  JSPCD_THRESHOLD_LABEL="100%"
fi

echo "==> jscpd: production duplication (threshold ${JSPCD_THRESHOLD_LABEL})"
jscpd app components lib tools/wechat-bridge \
  --config .jscpd.json \
  --output "${REPORT_DIR}/jscpd/production" \
  "${JSPCD_THRESHOLD_ARGS[@]}" \
  --no-tips \
  --no-colors

echo "==> jscpd: test duplication (report only)"
jscpd tests \
  --config .jscpd.json \
  --output "${REPORT_DIR}/jscpd/tests" \
  --threshold 100 \
  --no-tips \
  --no-colors

echo "==> knip: dead-code report"
bash scripts/dead-code-report.sh

echo "==> coverage: tests"
pnpm run test:coverage

echo "==> gitleaks: repository history"
bash scripts/secret-scan.sh "${MODE}"

node scripts/code-quality-summary.mjs "${REPORT_DIR}"

echo "Quality report: ${REPORT_DIR}/summary.md"
