#!/bin/bash
# 既存 run-daily.sh の後に、Pro運用向けの補助監査を追加実行する完全版ラッパー

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
node --import "tsx/esm" "$DIR/src/stock-pro-agent-report.ts" || true
node --import "tsx/esm" "$DIR/src/company-hypothesis-report.ts" || true
node --import "tsx/esm" "$DIR/src/company-network-report.ts" || true
node --import "tsx/esm" "$DIR/src/company-coverage-audit.ts" || true
node --import "tsx/esm" "$DIR/src/regime-hypothesis-alignment.ts" || true
node --import "tsx/esm" "$DIR/src/stale-hypothesis-report.ts" || true
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

echo "complete daily wrapper finished"
