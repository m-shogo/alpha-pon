#!/bin/bash
# 既存 run-daily.sh の後に、Pro運用向けの補助監査を追加実行する完全版ラッパー
# 最後に Next.js 用 JSON (apps/web/public/generated/alpha-pon-data.json) を必ず更新する。
# design/ には出力しない。

set -u

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1

DOW="$(date '+%u')"   # 1=Mon ... 7=Sun
DOM="$(date '+%d')"   # 01..31
MONTH="$(date '+%m')" # 01..12

bash "$DIR/scripts/run-daily.sh"

# run-daily.sh が完了した後だけ、補助レポートを作る。
# ここはnoncritical扱い。失敗しても既存dailyの成果は消さない。
node --import "tsx/esm" "$DIR/src/proposal-history-run.ts" || true
node --import "tsx/esm" "$DIR/src/persona-audit.ts" || true
node --import "tsx/esm" "$DIR/src/valuation-range.ts" || true
node --import "tsx/esm" "$DIR/src/primary-disclosure-subtypes.ts" || true
node --import "tsx/esm" "$DIR/src/regime-scenario-report.ts" || true
node --import "tsx/esm" "$DIR/src/pro-knowledge-refresh-report.ts" || true
node --import "tsx/esm" "$DIR/src/company-onboarding-audit.ts" || true
node --import "tsx/esm" "$DIR/src/stock-pro-quality-audit.ts" || true
node --import "tsx/esm" "$DIR/src/stock-pro-improvement-roadmap.ts" || true
node --import "tsx/esm" "$DIR/src/stock-pro-committee-report.ts" || true
node --import "tsx/esm" "$DIR/src/stock-pro-agent-report.ts" || true
node --import "tsx/esm" "$DIR/src/stock-pro-summary.ts" || true
node --import "tsx/esm" "$DIR/src/company-hypothesis-report.ts" || true
node --import "tsx/esm" "$DIR/src/company-network-report.ts" || true
node --import "tsx/esm" "$DIR/src/company-coverage-audit.ts" || true
node --import "tsx/esm" "$DIR/src/regime-hypothesis-alignment.ts" || true
node --import "tsx/esm" "$DIR/src/stale-hypothesis-report.ts" || true
node --import "tsx/esm" "$DIR/src/pipeline-health-summary.ts" || true
node --import "tsx/esm" "$DIR/src/pipeline-health-alert.ts" || true
node --import "tsx/esm" "$DIR/src/strategic-advice-report.ts" || true

# 履歴化。後から「いつから壊れたか」「いつ情勢判断を変えたか」を追えるようにする。
node --import "tsx/esm" "$DIR/src/regime-history.ts" || true
node --import "tsx/esm" "$DIR/src/source-health-history.ts" || true
node --import "tsx/esm" "$DIR/src/company-non-move-sync.ts" || true

# 知識蓄積レビュー。週次/月次/年次で、メモ止まりになっていないか確認する。
if [ "$DOW" = "1" ]; then
  node --import "tsx/esm" "$DIR/src/knowledge-review.ts" --weekly || true
fi

if [ "$DOM" = "01" ]; then
  node --import "tsx/esm" "$DIR/src/knowledge-review.ts" --monthly || true
fi

if [ "$MONTH" = "01" ] && [ "$DOM" = "01" ]; then
  node --import "tsx/esm" "$DIR/src/yearly-knowledge-review.ts" || true
fi

# ── ユニバーススキャン・仮説生成・検証（noncritical） ───────────────────────────
# J-Quants未設定時はモックで動く。失敗しても全体は止まらない。
node --env-file="$DIR/.env" --import "tsx/esm" "$DIR/src/scan-stock-universe.ts" || true
node --import "tsx/esm" "$DIR/src/stock-candidate-hypothesis.ts" || true
node --env-file="$DIR/.env" --import "tsx/esm" "$DIR/src/review-hypothesis-outcomes.ts" || true

# ── Next.js 用 JSON 更新（最後に必ず実行） ──────────────────────────────────────
# 出力先: apps/web/public/generated/alpha-pon-data.json
# design/ には出力しない（--legacy-design は付けない）。
node --import "tsx/esm" "$DIR/src/report-ui-data.ts" || true

echo "complete daily wrapper finished"
