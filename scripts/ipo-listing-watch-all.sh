#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== alpha-pon IPO / listing watch all =="
echo "repo: $(pwd)"

echo "\n[1/6] IPO theme watch"
node --import tsx/esm src/ipo-theme-watch-report.ts

echo "\n[2/6] listing event watch"
node --import tsx/esm src/listing-event-watch-report.ts

echo "\n[3/6] listing event sync preview"
node --import tsx/esm src/sync-listing-events.ts

echo "\n[4/6] listing event alerts"
node --import tsx/esm src/listing-event-alerts.ts

echo "\n[5/6] listing event review"
node --import tsx/esm src/listing-event-review.ts

echo "\n[6/6] must-watch audit"
node --import tsx/esm src/must-watch-audit.ts

echo "\nGenerated:"
ls -lh \
  reports/ipo_theme_watch_latest.md \
  reports/ipo_theme_watch_latest.json \
  reports/listing_event_watch_latest.md \
  reports/listing_event_watch_latest.json \
  reports/listing_event_sync_preview_latest.md \
  reports/listing_event_sync_preview_latest.json \
  reports/listing_event_alerts_latest.md \
  reports/listing_event_alerts_latest.json \
  reports/listing_event_review_latest.md \
  reports/listing_event_review_latest.json \
  reports/must_watch_audit_latest.md \
  reports/must_watch_audit_latest.json

echo "\nOK: IPO / listing watch reports generated"
