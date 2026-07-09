#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMPLATE_PATH="${REPO_ROOT}/wrangler.toml"
LOCAL_CONFIG_PATH="${REPO_ROOT}/wrangler.local.toml"
DB_NAME="${CF_D1_NAME:-leyang-blog-db}"
R2_NAME="${CF_R2_NAME:-leyang-blog-images}"
KV_NAME="${CF_KV_NAME:-leyang-blog-cache}"
SITE_URL="${SITE_URL:-${NEXT_PUBLIC_SITE_URL:-https://your-domain.com}}"
SEED_TEMPLATE_PATH="${REPO_ROOT}/db/seed-template.sql"

for arg in "$@"; do
  case "$arg" in
    --with-kv)
      # Backward-compatible no-op. CACHE is now required by Vinext.
      ;;
    --site-url=*)
      SITE_URL="${arg#*=}"
      ;;
    --db-name=*)
      DB_NAME="${arg#*=}"
      ;;
    --r2-name=*)
      R2_NAME="${arg#*=}"
      ;;
    --kv-name=*)
      KV_NAME="${arg#*=}"
      ;;
    *)
      echo "Unknown argument: ${arg}" >&2
      echo "Usage: pnpm run cf:init -- [--site-url=https://your-domain.com] [--db-name=leyang-blog-db] [--r2-name=leyang-blog-images] [--kv-name=leyang-blog-cache]" >&2
      exit 1
      ;;
  esac
done

binding_has_key() {
  local section="$1"
  local binding="$2"
  local key="$3"
  local file="$4"

  awk -v section="${section}" -v binding="${binding}" -v key="${key}" '
    function finish_section() {
      if (in_section && found_binding && found_key) {
        matched = 1
        exit
      }
    }
    $0 == "[[" section "]]" {
      finish_section()
      in_section = 1
      found_binding = 0
      found_key = 0
      next
    }
    in_section && /^\[/ {
      finish_section()
      in_section = 0
      found_binding = 0
      found_key = 0
    }
    in_section && $1 == "binding" {
      gsub(/"/, "", $3)
      if ($3 == binding) {
        found_binding = 1
      }
    }
    in_section && $1 == key {
      gsub(/"/, "", $3)
      if ($3 != "") {
        found_key = 1
      }
    }
    END {
      finish_section()
      if (matched == 1) exit 0
      exit 1
    }
  ' "${file}"
}

strip_array_binding() {
  local section="$1"
  local binding="$2"
  local file="$3"
  local tmp_file

  tmp_file="$(mktemp)"

  awk -v section="${section}" -v binding="${binding}" '
    function flush_candidate() {
      if (!candidate) {
        return
      }
      if (!matched_binding) {
        printf "%s", buffer
      }
      candidate = 0
      matched_binding = 0
      buffer = ""
    }
    $0 == "[[" section "]]" {
      flush_candidate()
      candidate = 1
      matched_binding = 0
      buffer = $0 ORS
      next
    }
    candidate && /^\[/ {
      flush_candidate()
      print
      next
    }
    candidate {
      buffer = buffer $0 ORS
      line = $0
      sub(/[[:space:]]*#.*/, "", line)
      if (line ~ /^[[:space:]]*binding[[:space:]]*=/) {
        split(line, parts, "=")
        value = parts[2]
        gsub(/[[:space:]"]/, "", value)
        if (value == binding) {
          matched_binding = 1
        }
      }
      next
    }
    {
      print
    }
    END {
      flush_candidate()
    }
  ' "${file}" > "${tmp_file}"

  mv "${tmp_file}" "${file}"
}

cd "${REPO_ROOT}"

if ! pnpm exec wrangler whoami >/dev/null 2>&1; then
  echo "❌ 未登录 Cloudflare，请先运行: pnpm exec wrangler login"
  exit 1
fi

if [[ ! -f "${LOCAL_CONFIG_PATH}" ]]; then
  cp "${TEMPLATE_PATH}" "${LOCAL_CONFIG_PATH}"
  echo "==> created local config: ${LOCAL_CONFIG_PATH}"
else
  echo "==> reusing local config: ${LOCAL_CONFIG_PATH}"
fi

site_url_override="${SITE_URL}" perl -0pi -e 's/NEXT_PUBLIC_SITE_URL = ".*?"/NEXT_PUBLIC_SITE_URL = "$ENV{site_url_override}"/g' "${LOCAL_CONFIG_PATH}"

if ! binding_has_key "d1_databases" "DB" "database_id" "${LOCAL_CONFIG_PATH}"; then
  strip_array_binding "d1_databases" "DB" "${LOCAL_CONFIG_PATH}"

  pnpm exec wrangler d1 create "${DB_NAME}" \
    --binding DB \
    --use-remote \
    --update-config \
    -c "${LOCAL_CONFIG_PATH}"
fi

if ! binding_has_key "r2_buckets" "IMAGES" "bucket_name" "${LOCAL_CONFIG_PATH}"; then
  strip_array_binding "r2_buckets" "IMAGES" "${LOCAL_CONFIG_PATH}"

  pnpm exec wrangler r2 bucket create "${R2_NAME}" \
    --binding IMAGES \
    --update-config \
    -c "${LOCAL_CONFIG_PATH}"
fi

if ! binding_has_key "kv_namespaces" "CACHE" "id" "${LOCAL_CONFIG_PATH}"; then
  strip_array_binding "kv_namespaces" "CACHE" "${LOCAL_CONFIG_PATH}"

  pnpm exec wrangler kv namespace create "${KV_NAME}" \
    --binding CACHE \
    --update-config \
    -c "${LOCAL_CONFIG_PATH}"
fi

pnpm exec wrangler d1 execute DB \
  --remote \
  --file="${REPO_ROOT}/db/schema.sql" \
  -c "${LOCAL_CONFIG_PATH}"

if [[ -f "${SEED_TEMPLATE_PATH}" ]]; then
  pnpm exec wrangler d1 execute DB \
    --remote \
    --file="${SEED_TEMPLATE_PATH}" \
    -c "${LOCAL_CONFIG_PATH}"
fi

cat <<EOF
✅ Cloudflare 基础资源初始化完成

当前配置文件:
  ${LOCAL_CONFIG_PATH}

下一步:
  1. 配置本地环境变量: cp .env.example .env.local
  2. 设置线上 secrets:
     pnpm exec wrangler secret put ADMIN_PASSWORD -c ${LOCAL_CONFIG_PATH}
     pnpm exec wrangler secret put ADMIN_TOKEN_SALT -c ${LOCAL_CONFIG_PATH}
     pnpm exec wrangler secret put AI_CONFIG_ENCRYPTION_SECRET -c ${LOCAL_CONFIG_PATH}
     pnpm exec wrangler secret put AI_API_KEY -c ${LOCAL_CONFIG_PATH}   # 如果你要启用 AI
  3. 首次初始化已写入默认主题、字体、导航和 CACHE KV
  4. 生成类型: pnpm run cf-typegen
  5. 部署: pnpm run deploy
EOF
