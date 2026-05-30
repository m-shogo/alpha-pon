#!/bin/bash
# launchd から呼ばれるラッパースクリプト
# 毎朝: 世界ニュース取得 → 銘柄daily → 類推レビュー → 学習集計 → 週次/月次レビュー → DBメンテ まで実行する

set -u

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1

if [ -f "$DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$DIR/.env"
  set +a
fi

mkdir -p "$DIR/logs" "$DIR/tmp"

TODAY="$(date '+%Y-%m-%d')"
DOW="$(date '+%u')"   # 1=Mon ... 7=Sun
DOM="$(date '+%d')"   # 01..31
FAILED_STEPS=""
LOCK_DIR="$DIR/tmp/run-daily.lock"

notify_pipeline() {
  local kind="$1"
  local title="$2"
  local detail="$3"
  node --import "tsx/esm" "$DIR/src/pipeline-message.ts" "$kind" "$title" "$detail" >/dev/null 2>&1 || true
}

cleanup() {
  rm -rf "$LOCK_DIR"
}

if mkdir "$LOCK_DIR" 2>/dev/null; then
  trap cleanup EXIT INT TERM
  echo $$ > "$LOCK_DIR/pid"
  date '+%Y-%m-%d %H:%M:%S' > "$LOCK_DIR/started_at"
else
  echo "another alpha-pon daily pipeline is already running: $LOCK_DIR"
  notify_pipeline "alert" "alpha-pon pipeline skipped" "another run-daily.sh is already running. date=$TODAY lock=$LOCK_DIR"
  exit 0
fi

run_step() {
  local name="$1"
  local critical="$2"
  shift 2

  echo ""
  echo "---- [$name] start: $(date '+%Y-%m-%d %H:%M:%S') ----"
  if "$@"; then
    echo "---- [$name] ok: $(date '+%Y-%m-%d %H:%M:%S') ----"
  else
    local code=$?
    local message="step=$name code=$code date=$TODAY"
    echo "---- [$name] failed($code): $(date '+%Y-%m-%d %H:%M:%S') ----"
    FAILED_STEPS="$FAILED_STEPS $name($code)"
    notify_pipeline "alert" "alpha-pon pipeline failed" "$message"

    if [ "$critical" = "critical" ]; then
      echo "critical step failed: $name"
      return "$code"
    fi
  fi

  return 0
}

run_if_monday() {
  local name="$1"
  shift
  if [ "$DOW" = "1" ]; then
    run_step "$name" "noncritical" "$@" || true
  else
    echo "skip [$name]: weekly job runs on Monday"
  fi
}

run_if_month_start() {
  local name="$1"
  shift
  if [ "$DOM" = "01" ]; then
    run_step "$name" "noncritical" "$@" || true
  else
    echo "skip [$name]: monthly job runs on day 01"
  fi
}

echo "========================================"
echo "alpha-pon daily pipeline start: $(date '+%Y-%m-%d %H:%M:%S')"
echo "DIR=$DIR"
echo "========================================"

# 1. 世界ニュースを取得し、重要トピックを考察DBへ保存。失敗しても銘柄dailyは止めない。
run_step "scan:world" "noncritical" node --import "tsx/esm" "$DIR/src/scan-world-events.ts" || true

# 2. 銘柄スコア・詳細レポート・類推使用DB・予想DBを保存。ここだけは最重要。
if ! run_step "daily" "critical" node --import "tsx/esm" "$DIR/src/daily.ts"; then
  notify_pipeline "alert" "alpha-pon daily failed" "daily failed. pipeline stopped. date=$TODAY failed_steps=$FAILED_STEPS"
  exit 1
fi

# 3. 期限到来した1日/1週/1か月後レビュー候補をoutcome DBへ保存。失敗しても止めない。
run_step "review:analogies:write" "noncritical" node --import "tsx/esm" "$DIR/src/review-analogies.ts" --write || true

# 4. 学習集計。失敗してもdaily自体は成功扱いにする。
run_step "learn" "noncritical" node --import "tsx/esm" "$DIR/src/learn.ts" || true

# 5. 週次レビュー。月曜だけ実行。
run_if_monday "review:weekly" node --import "tsx/esm" "$DIR/src/periodic-review.ts" --weekly

# 6. 月次レビュー。毎月1日だけ実行。
run_if_month_start "review:monthly" node --import "tsx/esm" "$DIR/src/periodic-review.ts" --monthly

# 7. DB肥大化チェック。実アーカイブは安全側で毎日実行。失敗しても止めない。
run_step "maintain:data:write" "noncritical" node --import "tsx/esm" "$DIR/src/maintain-data.ts" --write || true

if [ -n "$FAILED_STEPS" ]; then
  notify_pipeline "summary" "alpha-pon pipeline completed with warnings" "date=$TODAY failed_steps=$FAILED_STEPS reports=reports/latest.md reports/learning_latest.md"
else
  notify_pipeline "summary" "alpha-pon pipeline completed" "date=$TODAY all steps ok reports=reports/latest.md reports/learning_latest.md"
fi

echo ""
echo "========================================"
echo "alpha-pon daily pipeline end: $(date '+%Y-%m-%d %H:%M:%S')"
echo "failed_steps:${FAILED_STEPS:- none}"
echo "========================================"
