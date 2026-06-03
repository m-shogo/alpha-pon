#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== alpha-pon IPO / listing watch all =="
echo "repo: $(pwd)"

echo "\n[1/4] IPO theme watch"
node --import tsx/esm src/ipo-theme-watch-report.ts

echo "\n[2/4] listing event watch"
node --import tsx/esm src/listing-event-watch-report.ts

echo "\n[3/4] listing event alerts"
node --import tsx/esm src/listing-event-alerts.ts

echo "\n[4/4] must-watch audit"
node --import tsx/esm src/must-watch-audit.ts

echo "\nGenerated:"
ls -lh \
  reports/ipo_theme_watch_latest.md \
  reports/ipo_theme_watch_latest.json \
  reports/listing_event_watch_latest.md \
  reports/listing_event_watch_latest.json \
  reports/listing_event_alerts_latest.md \
  reports/listing_event_alerts_latest.json \
  reports/must_watch_audit_latest.md \
  reports/must_watch_audit_latest.json

echo "\nOK: IPO / listing watch reports generated"
