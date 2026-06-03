#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== alpha-pon listing event alerts =="
echo "repo: $(pwd)"

node --import tsx/esm src/listing-event-alerts.ts

echo "\nGenerated:"
ls -lh reports/listing_event_alerts_latest.md reports/listing_event_alerts_latest.json

echo "\nTip: open reports/listing_event_alerts_latest.md and check priority / backfill needed."
