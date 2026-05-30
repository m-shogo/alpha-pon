#!/bin/bash
# launchd から呼ばれるラッパースクリプト
# 毎朝: 世界ニュース取得 → 銘柄daily → 類推レビュー → 学習集計 まで実行する

set -u

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1

if [ -f "$DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$DIR/.env"
  set +a
fi

mkdir -p "$DIR/logs"

echo "========================================"
echo "alpha-pon daily pipeline start: $(date '+%Y-%m-%d %H:%M:%S')"
echo "DIR=$DIR"
echo "========================================"

run_step() {
  local name="$1"
  shift
  echo ""
  echo "---- [$name] start: $(date '+%Y-%m-%d %H:%M:%S') ----"
  if "$@"; then
    echo "---- [$name] ok: $(date '+%Y-%m-%d %H:%M:%S') ----"
  else
    local code=$?
    echo "---- [$name] failed($code): $(date '+%Y-%m-%d %H:%M:%S') ----"
    return "$code"
  fi
}

# 1. 世界ニュースを取得し、重要トピックを考察DBへ保存
run_step "scan:world" node --import "tsx/esm" "$DIR/src/scan-world-events.ts" || true

# 2. 銘柄スコア・詳細レポート・類推使用DB・予想DBを保存
run_step "daily" node --import "tsx/esm" "$DIR/src/daily.ts" || exit 1

# 3. 期限到来した1日/1週/1か月後レビュー候補をoutcome DBへ保存
run_step "review:analogies:write" node --import "tsx/esm" "$DIR/src/review-analogies.ts" --write || true

# 4. 学習集計。失敗してもdaily自体は成功扱いにする
run_step "learn" node --import "tsx/esm" "$DIR/src/learn.ts" || true

echo ""
echo "========================================"
echo "alpha-pon daily pipeline end: $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
