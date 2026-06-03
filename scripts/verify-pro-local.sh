#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== alpha-pon local pro verification =="
echo "repo: $(pwd)"

echo "\n[1/5] generate stock pro data"
pnpm pro:all

echo "\n[2/5] generate UI data"
pnpm ui:data

echo "\n[3/5] run pro safety tests"
node --import tsx/esm tests/pro-disagreement.test.ts
node --import tsx/esm tests/pro-generated-data-shape.test.ts

echo "\n[4/5] inspect generated pro output"
node scripts/inspect-pro-output.mjs

echo "\n[5/5] show generated files"
ls -lh \
  reports/stock_pro_committee_latest.md \
  reports/stock_pro_committee_latest.json \
  data/buffett_quality_latest.json \
  data/valuation_snapshot_latest.json \
  data/ir_event_evidence_latest.json \
  apps/web/public/generated/alpha-pon-data.json

echo "\nOK: pro verification completed"
