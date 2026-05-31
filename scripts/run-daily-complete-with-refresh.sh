#!/bin/bash
set -u

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1

bash "$DIR/scripts/run-daily-complete.sh"
node --import "tsx/esm" "$DIR/src/pro-knowledge-refresh-report.ts" || true
node --import "tsx/esm" "$DIR/src/strategic-advice-report.ts" || true

echo "complete daily with pro knowledge refresh finished"
