#!/bin/bash
# proposals_latest.json を履歴化し、継続課題JSONを作る

set -u

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1

node --import "tsx/esm" "$DIR/src/proposals.ts"
node --import "tsx/esm" "$DIR/src/proposal-history-run.ts"

test -f "$DIR/reports/proposals_latest.json"
test -f "$DIR/reports/proposal_streaks_latest.json"

echo "proposal history updated"
