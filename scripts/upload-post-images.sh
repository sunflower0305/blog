#!/usr/bin/env bash
# 上传本地图片到博客 R2，并输出 URL 映射
# 用法: bash scripts/upload-post-images.sh <博客URL> <管理员密码> <图片目录>
# 示例: bash scripts/upload-post-images.sh https://blog.zhangleyang.com 你的密码 /path/to/article-assets/ai-job-assistant

set -euo pipefail

BLOG_URL="${1:?请传入博客 URL，如 https://blog.zhangleyang.com}"
PASSWORD="${2:?请传入管理员密码}"
IMG_DIR="${3:?请传入图片目录}"

COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

echo "==> 登录..."
LOGIN_RESP=$(curl -s -c "$COOKIE_JAR" -X POST "${BLOG_URL}/api/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"${PASSWORD}\"}")

if ! echo "$LOGIN_RESP" | grep -q '"success":true'; then
  echo "登录失败: $LOGIN_RESP"
  exit 1
fi
echo "==> 登录成功"
echo ""

for IMG_PATH in "${IMG_DIR}"/*.{png,jpg,jpeg,webp,gif} 2>/dev/null; do
  [[ -f "$IMG_PATH" ]] || continue
  FILENAME="$(basename "$IMG_PATH")"

  UPLOAD_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "${BLOG_URL}/api/uploads" \
    -F "file=@${IMG_PATH}")

  if echo "$UPLOAD_RESP" | grep -q '"success":true'; then
    REL_URL=$(echo "$UPLOAD_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['url'])")
    FULL_URL="${BLOG_URL}${REL_URL}"
    echo "${FILENAME} => ${FULL_URL}"
  else
    echo "上传失败 ${FILENAME}: ${UPLOAD_RESP}"
  fi
done
