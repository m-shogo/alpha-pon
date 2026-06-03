#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== alpha-pon listing event watch =="
echo "repo: $(pwd)"

node --import tsx/esm src/listing-event-watch-report.ts

echo "\nGenerated:"
ls -lh reports/listing_event_watch_latest.md reports/listing_event_watch_latest.json

echo "\nTip: check listing_day / first_earnings / lockup_expiry notification levels."
