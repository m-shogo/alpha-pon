#!/bin/bash
# launchd から呼ばれるラッパースクリプト
# 毎朝: 世界ニュース取得 → 銘柄daily → 類推レビュー → 学習集計 → 一次情報学習 → 情報源ヘルス → ルール診断 → 改善提案 → company memory → 週次/月次レビュー → DBメンテ まで実行する

set -u

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1

if [ -f "$DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$DIR/.env"
  set +a
fi

mkdir -p "$DIR/logs" "$DIR/tmp" "$DIR/reports"

TODAY="$(date '+%Y-%m-%d')"
STARTED_AT="$(date '+%Y-%m-%d %H:%M:%S')"
DOW="$(date '+%u')"   # 1=Mon ... 7=Sun
DOM="$(date '+%d')"   # 01..31
FAILED_STEPS=""
PIPELINE_STEPS_JSON="[]"
LOCK_DIR="$DIR/tmp/run-daily.lock"

json_escape() {
  node -e 'let s=""; process.stdin.on("data", c => s += c); process.stdin.on("end", () => console.log(JSON.stringify(s.trim())));'
}

write_status() {
  local status="$1"
  local ended_at
  ended_at="$(date '+%Y-%m-%d %H:%M:%S')"
  local failed_json
  failed_json="$(printf '%s' "$FAILED_STEPS" | json_escape)"
  cat > "$DIR/reports/pipeline_status_latest.json" <<EOF
{
  "date": "$TODAY",
  "status": "$status",
  "startedAt": "$STARTED_AT",
  "endedAt": "$ended_at",
  "failedSteps": $failed_json,
  "steps": $PIPELINE_STEPS_JSON,
  "reports": {
    "daily": "reports/latest.md",
    "learning": "reports/learning_latest.md",
    "primaryDisclosureLearning": "reports/primary_disclosure_learning_latest.md",
    "primaryDisclosureCategoryLearning": "reports/primary_disclosure_category_learning_latest.md",
    "sourceHealth": "reports/source_health_latest.md",
    "ruleDiagnostics": "reports/rule_diagnostics_latest.md",
    "proposals": "reports/proposals_latest.md",
    "companyMemory": "reports/company_memory_latest.md",
    "maintenance": "reports/maintenance_latest.md"
  }
}
EOF
}

append_step_status() {
  local name="$1"
  local critical="$2"
  local status="$3"
  local code="$4"
  local started_at="$5"
  local ended_at="$6"
  local duration_sec="$7"

  local name_json critical_json status_json started_json ended_json
  name_json="$(printf '%s' "$name" | json_escape)"
  critical_json="$(printf '%s' "$critical" | json_escape)"
  status_json="$(printf '%s' "$status" | json_escape)"
  started_json="$(printf '%s' "$started_at" | json_escape)"
  ended_json="$(printf '%s' "$ended_at" | json_escape)"

  PIPELINE_STEPS_JSON="$(PIPELINE_STEPS_JSON="$PIPELINE_STEPS_JSON" NAME_JSON="$name_json" CRITICAL_JSON="$critical_json" STATUS_JSON="$status_json" STARTED_JSON="$started_json" ENDED_JSON="$ended_json" STEP_CODE="$code" DURATION_SEC="$duration_sec" node - <<'NODE'
const steps = JSON.parse(process.env.PIPELINE_STEPS_JSON ?? '[]');
steps.push({
  name: JSON.parse(process.env.NAME_JSON ?? '"unknown"'),
  criticality: JSON.parse(process.env.CRITICAL_JSON ?? '"unknown"'),
  status: JSON.parse(process.env.STATUS_JSON ?? '"unknown"'),
  code: Number(process.env.STEP_CODE ?? '0'),
  startedAt: JSON.parse(process.env.STARTED_JSON ?? '""'),
  endedAt: JSON.parse(process.env.ENDED_JSON ?? '""'),
  durationSec: Number(process.env.DURATION_SEC ?? '0'),
});
console.log(JSON.stringify(steps));
NODE
  )"
  write_status "running"
}

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
  write_status "running"
else
  echo "another alpha-pon daily pipeline is already running: $LOCK_DIR"
  notify_pipeline "alert" "alpha-pon pipeline skipped" "another run-daily.sh is already running. date=$TODAY lock=$LOCK_DIR"
  write_status "skipped_locked"
  exit 0
fi

run_step() {
  local name="$1"
  local critical="$2"
  shift 2

  local step_started_at step_started_epoch step_ended_at step_ended_epoch duration
  step_started_at="$(date '+%Y-%m-%d %H:%M:%S')"
  step_started_epoch="$(date '+%s')"

  echo ""
  echo "---- [$name] start: $step_started_at ----"
  if "$@"; then
    step_ended_at="$(date '+%Y-%m-%d %H:%M:%S')"
    step_ended_epoch="$(date '+%s')"
    duration=$((step_ended_epoch - step_started_epoch))
    append_step_status "$name" "$critical" "ok" "0" "$step_started_at" "$step_ended_at" "$duration"
    echo "---- [$name] ok: $step_ended_at ----"
  else
    local code=$?
    step_ended_at="$(date '+%Y-%m-%d %H:%M:%S')"
    step_ended_epoch="$(date '+%s')"
    duration=$((step_ended_epoch - step_started_epoch))
    append_step_status "$name" "$critical" "failed" "$code" "$step_started_at" "$step_ended_at" "$duration"
    local message="step=$name code=$code date=$TODAY"
    echo "---- [$name] failed($code): $step_ended_at ----"
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
    append_step_status "$name" "noncritical" "skipped" "0" "$(date '+%Y-%m-%d %H:%M:%S')" "$(date '+%Y-%m-%d %H:%M:%S')" "0"
  fi
}

run_if_month_start() {
  local name="$1"
  shift
  if [ "$DOM" = "01" ]; then
    run_step "$name" "noncritical" "$@" || true
  else
    echo "skip [$name]: monthly job runs on day 01"
    append_step_status "$name" "noncritical" "skipped" "0" "$(date '+%Y-%m-%d %H:%M:%S')" "$(date '+%Y-%m-%d %H:%M:%S')" "0"
  fi
}

echo "========================================"
echo "alpha-pon daily pipeline start: $STARTED_AT"
echo "DIR=$DIR"
echo "========================================"

# 1. 世界ニュースを取得し、重要トピックを考察DBへ保存。失敗しても銘柄dailyは止めない。
run_step "scan:world" "noncritical" node --import "tsx/esm" "$DIR/src/scan-world-events.ts" || true

# 2. 銘柄スコア・詳細レポート・類推使用DB・予想DBを保存。ここだけは最重要。
if ! run_step "daily" "critical" node --import "tsx/esm" "$DIR/src/daily.ts"; then
  notify_pipeline "alert" "alpha-pon daily failed" "daily failed. pipeline stopped. date=$TODAY failed_steps=$FAILED_STEPS"
  write_status "failed"
  exit 1
fi

# 3. 期限到来した1日/1週/1か月後レビュー候補をoutcome DBへ保存。失敗しても止めない。
run_step "review:analogies:write" "noncritical" node --import "tsx/esm" "$DIR/src/review-analogies.ts" --write || true

# 4. 学習集計。失敗してもdaily自体は成功扱いにする。
run_step "learn" "noncritical" node --import "tsx/esm" "$DIR/src/learn.ts" || true

# 5. 一次情報学習。TDnet/EDINET判定ごとの成績とカテゴリ別成績を見る。失敗しても止めない。
run_step "learn:primary" "noncritical" node --import "tsx/esm" "$DIR/src/primary-disclosure-learning.ts" || true

# 6. 情報源ヘルス。J-Quants/TDnet/EDINET/レポート生成の抜け漏れを見える化する。
run_step "health:sources" "noncritical" node --import "tsx/esm" "$DIR/src/source-health.ts" || true

# 7. ルール診断。自動でrules.ymlは変更せず、改善候補だけ出す。
run_step "diagnose:rules" "noncritical" node --import "tsx/esm" "$DIR/src/rule-diagnostics.ts" || true

# 8. 改善提案。source health / rule diagnostics / score logs を統合して優先順位を出す。
run_step "proposals" "noncritical" node --import "tsx/esm" "$DIR/src/proposals.ts" || true

# 9. 銘柄ごとの反省ノート。スコア加点には使わず、company memory として保存する。
run_step "memory:companies" "noncritical" node --import "tsx/esm" "$DIR/src/update-company-memory.ts" || true

# 10. 週次レビュー。月曜だけ実行。
run_if_monday "review:weekly" node --import "tsx/esm" "$DIR/src/periodic-review.ts" --weekly

# 11. 月次レビュー。毎月1日だけ実行。
run_if_month_start "review:monthly" node --import "tsx/esm" "$DIR/src/periodic-review.ts" --monthly

# 12. DB肥大化チェック。実アーカイブは安全側で毎日実行。失敗しても止めない。
run_step "maintain:data:write" "noncritical" node --import "tsx/esm" "$DIR/src/maintain-data.ts" --write || true

if [ -n "$FAILED_STEPS" ]; then
  write_status "completed_with_warnings"
else
  write_status "completed"
fi

echo ""
echo "========================================"
echo "alpha-pon daily pipeline end: $(date '+%Y-%m-%d %H:%M:%S')"
echo "failed_steps:${FAILED_STEPS:- none}"
echo "status: reports/pipeline_status_latest.json"
echo "========================================"
