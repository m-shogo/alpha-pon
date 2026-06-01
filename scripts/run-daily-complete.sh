#!/bin/bash
# 完全版 daily ラッパー
# - critical: run-daily.sh が失敗したら即停止する（古いデータで続行しない）
# - noncritical: Pro補助レポート・ユニバーススキャン・Next.js JSON は失敗してもログに残す
# - design/ には出力しない（pnpm ui:data は --legacy-design なし）
#
# 利用ステップ:
#   1. run-daily.sh        ... critical / 失敗で停止
#   2. Pro補助レポート群   ... noncritical / 失敗を FAILED_COMPLETE_STEPS に記録
#   3. scan:universe       ... noncritical
#   4. candidate:hypothesis ... noncritical
#   5. review:hypotheses   ... noncritical
#   6. pnpm ui:data        ... noncritical（Next.js JSON のみ生成）
#   7. 履歴化・知識レビュー ... noncritical

set -u

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1

DOW="$(date '+%u')"   # 1=Mon ... 7=Sun
DOM="$(date '+%d')"   # 01..31
MONTH="$(date '+%m')" # 01..12

# ── critical ──────────────────────────────────────────────────────────────────
# run-daily.sh が失敗したら complete pipeline を停止する。
# 失敗日に古い/不完全な JSON を成功扱いで生成しないため。
echo "---- [run-daily.sh] start ----"
if ! bash "$DIR/scripts/run-daily.sh"; then
  echo "---- [run-daily.sh] FAILED. stopping complete pipeline. ----"
  exit 1
fi
echo "---- [run-daily.sh] ok ----"

# ── noncritical ヘルパー ──────────────────────────────────────────────────────
# run_optional_step <name> <command...>
# 失敗してもスクリプト全体は止まらないが、FAILED_COMPLETE_STEPS に記録する。
FAILED_COMPLETE_STEPS=""

run_optional_step() {
  local name="$1"
  shift

  echo ""
  echo "---- [$name] start ----"
  if "$@"; then
    echo "---- [$name] ok ----"
    return 0
  else
    local code=$?
    echo "---- [$name] failed($code) ----"
    FAILED_COMPLETE_STEPS="$FAILED_COMPLETE_STEPS $name($code)"
    return "$code"
  fi
}

# ── Pro補助レポート ────────────────────────────────────────────────────────────
run_optional_step "proposal-history"          node --import "tsx/esm" "$DIR/src/proposal-history-run.ts"
run_optional_step "persona-audit"             node --import "tsx/esm" "$DIR/src/persona-audit.ts"
run_optional_step "valuation-range"           node --import "tsx/esm" "$DIR/src/valuation-range.ts"
run_optional_step "primary-disclosure-sub"    node --import "tsx/esm" "$DIR/src/primary-disclosure-subtypes.ts"
run_optional_step "regime-scenario"           node --import "tsx/esm" "$DIR/src/regime-scenario-report.ts"
run_optional_step "pro-knowledge-refresh"     node --import "tsx/esm" "$DIR/src/pro-knowledge-refresh-report.ts"
run_optional_step "company-onboarding"        node --import "tsx/esm" "$DIR/src/company-onboarding-audit.ts"
run_optional_step "stock-pro-quality"         node --import "tsx/esm" "$DIR/src/stock-pro-quality-audit.ts"
run_optional_step "stock-pro-roadmap"         node --import "tsx/esm" "$DIR/src/stock-pro-improvement-roadmap.ts"
run_optional_step "stock-pro-committee"       node --import "tsx/esm" "$DIR/src/stock-pro-committee-report.ts"
run_optional_step "stock-pro-agent"           node --import "tsx/esm" "$DIR/src/stock-pro-agent-report.ts"
run_optional_step "stock-pro-summary"         node --import "tsx/esm" "$DIR/src/stock-pro-summary.ts"
run_optional_step "company-hypothesis"        node --import "tsx/esm" "$DIR/src/company-hypothesis-report.ts"
run_optional_step "company-network"           node --import "tsx/esm" "$DIR/src/company-network-report.ts"
run_optional_step "company-coverage"          node --import "tsx/esm" "$DIR/src/company-coverage-audit.ts"
run_optional_step "regime-hypothesis-align"   node --import "tsx/esm" "$DIR/src/regime-hypothesis-alignment.ts"
run_optional_step "stale-hypothesis"          node --import "tsx/esm" "$DIR/src/stale-hypothesis-report.ts"
run_optional_step "pipeline-health-summary"   node --import "tsx/esm" "$DIR/src/pipeline-health-summary.ts"
run_optional_step "pipeline-health-alert"     node --import "tsx/esm" "$DIR/src/pipeline-health-alert.ts"
run_optional_step "strategic-advice"          node --import "tsx/esm" "$DIR/src/strategic-advice-report.ts"

# ── 履歴化 ───────────────────────────────────────────────────────────────────
run_optional_step "regime-history"            node --import "tsx/esm" "$DIR/src/regime-history.ts"
run_optional_step "source-health-history"     node --import "tsx/esm" "$DIR/src/source-health-history.ts"
run_optional_step "company-non-move-sync"     node --import "tsx/esm" "$DIR/src/company-non-move-sync.ts"

# ── 知識蓄積レビュー（週次/月次/年次） ──────────────────────────────────────
if [ "$DOW" = "1" ]; then
  run_optional_step "knowledge-weekly"        node --import "tsx/esm" "$DIR/src/knowledge-review.ts" --weekly
fi
if [ "$DOM" = "01" ]; then
  run_optional_step "knowledge-monthly"       node --import "tsx/esm" "$DIR/src/knowledge-review.ts" --monthly
fi
if [ "$MONTH" = "01" ] && [ "$DOM" = "01" ]; then
  run_optional_step "knowledge-yearly"        node --import "tsx/esm" "$DIR/src/yearly-knowledge-review.ts"
fi

# ── ユニバーススキャン・仮説生成・検証 ──────────────────────────────────────
# J-Quants設定済み: 本番API / 未設定: エラー（mockを使うなら --mock を明示）
#
# scan:universe が失敗した場合、古い universe_candidates_latest.json を元に
# 新規仮説を作らないよう candidate:hypothesis をスキップする。
SCAN_UNIVERSE_OK=0

if run_optional_step "scan:universe" node --env-file="$DIR/.env" --import "tsx/esm" "$DIR/src/scan-stock-universe.ts"; then
  SCAN_UNIVERSE_OK=1
fi

if [ "$SCAN_UNIVERSE_OK" = "1" ]; then
  run_optional_step "candidate:hypothesis" node --import "tsx/esm" "$DIR/src/stock-candidate-hypothesis.ts"
else
  echo ""
  echo "---- [candidate:hypothesis] skipped: scan:universe failed ----"
  FAILED_COMPLETE_STEPS="$FAILED_COMPLETE_STEPS candidate:hypothesis(skipped_scan_failed)"
fi

# review:hypotheses は既存仮説の期限レビューなので scan失敗時も実行する
# （stock-candidate-hypothesis.ts の generatedAt チェックにより、
#   仮に古いファイルでも hypothesis 側でエラー終了する）
run_optional_step "review:hypotheses"         node --env-file="$DIR/.env" --import "tsx/esm" "$DIR/src/review-hypothesis-outcomes.ts"

# ── Next.js JSON 更新（最終ステップ） ───────────────────────────────────────
# 出力先: apps/web/public/generated/alpha-pon-data.json のみ（design/ には出力しない）
run_optional_step "ui:data"                   node --import "tsx/esm" "$DIR/src/report-ui-data.ts"

# ── 失敗ステップのサマリー ────────────────────────────────────────────────────
echo ""
if [ -n "$FAILED_COMPLETE_STEPS" ]; then
  echo "[complete-wrapper] WARNING: 以下のステップが失敗しました: $FAILED_COMPLETE_STEPS"

  # pipeline_status_latest.json に completeWrapperFailedSteps を追記する（存在する場合）
  PIPELINE_STATUS="$DIR/reports/pipeline_status_latest.json"
  if [ -f "$PIPELINE_STATUS" ]; then
    # Node.js で JSON にフィールドを追加
    node -e "
      const fs = require('fs');
      try {
        const data = JSON.parse(fs.readFileSync('$PIPELINE_STATUS', 'utf8'));
        data.completeWrapperFailedSteps = '$FAILED_COMPLETE_STEPS'.trim().split(' ').filter(Boolean);
        data.completeWrapperRunAt = new Date().toISOString();
        fs.writeFileSync('$PIPELINE_STATUS', JSON.stringify(data, null, 2));
      } catch(e) { process.exit(0); }  // pipeline_status が壊れていても続行
    " 2>/dev/null || true
  fi
else
  echo "[complete-wrapper] All optional steps succeeded."
fi

echo ""
echo "complete daily wrapper finished"
