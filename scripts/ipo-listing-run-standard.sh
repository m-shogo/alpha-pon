#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== alpha-pon IPO / listing standard runner =="
echo "repo: $(pwd)"

echo "\n[1/3] smoke audit"
bash scripts/listing-smoke-audit.sh

echo "\n[2/3] advanced dry-run"
bash scripts/ipo-listing-watch-advanced.sh

echo "\n[3/3] summary"
bash scripts/listing-summary.sh

echo "\nNext:"
echo "  cat reports/listing_automation_summary_latest.md"
echo "  pnpm check"
echo "  pnpm verify:pro:local"
echo "  pnpm health"
echo "  pnpm backup"

echo "\nOK: standard IPO / listing runner completed"
