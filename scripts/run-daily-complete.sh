#!/bin/bash
# 既存 run-daily.sh の後に、Pro運用向けの補助監査を追加実行する完全版ラッパー

set -u

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1

bash "$DIR/scripts/run-daily.sh"

# run-daily.sh が完了した後だけ、補助レポートを作る。
# ここはnoncritical扱い。失敗しても既存dailyの成果は消さない。
node --import "tsx/esm" "$DIR/src/proposal-history-run.ts" || true
node --import "tsx/esm" "$DIR/src/persona-audit.ts" || true
node --import "tsx/esm" "$DIR/src/valuation-range.ts" || true
node --import "tsx/esm" "$DIR/src/primary-disclosure-subtypes.ts" || true
node --import "tsx/esm" "$DIR/src/company-hypothesis-report.ts" || true

echo "complete daily wrapper finished"
