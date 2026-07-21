#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPORT_DIR="${REPO_ROOT}/reports/code-quality"

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "Missing required command: gitleaks" >&2
  echo "Install it with: brew install gitleaks" >&2
  exit 127
fi

mkdir -p "${REPORT_DIR}"
cd "${REPO_ROOT}"

gitleaks git \
  --redact \
  --report-format json \
  --report-path "${REPORT_DIR}/gitleaks-report.json"

echo "Gitleaks report: ${REPORT_DIR}/gitleaks-report.json"
