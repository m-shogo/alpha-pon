#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== alpha-pon IPO / listing watch all =="
echo "repo: $(pwd)"

echo "\n[1/14] IPO theme watch"
node --import tsx/esm src/ipo-theme-watch-report.ts

echo "\n[2/14] JPX listing sync dry-run"
node --import tsx/esm src/sync-jpx-listings.ts

echo "\n[3/14] listing event watch"
node --import tsx/esm src/listing-event-watch-report.ts

echo "\n[4/14] listing event sync preview"
node --import tsx/esm src/sync-listing-events.ts

echo "\n[5/14] first earnings estimate"
node --import tsx/esm src/estimate-first-earnings.ts

echo "\n[6/14] prospectus lockup candidate extraction"
node --import tsx/esm src/extract-lockup-from-prospectus.ts

echo "\n[7/14] lockup event extraction"
node --import tsx/esm src/extract-lockup-events.ts

echo "\n[8/14] listing event alerts"
node --import tsx/esm src/listing-event-alerts.ts

echo "\n[9/14] listing event message preview"
node --import tsx/esm src/listing-event-message-preview.ts

echo "\n[10/14] listing event alert sender dry-run"
node --import tsx/esm src/listing-event-alert-sender.ts

echo "\n[11/14] listing review price import preview"
node --import tsx/esm src/update-listing-review-prices.ts

echo "\n[12/14] listing event review"
node --import tsx/esm src/listing-event-review.ts

echo "\n[13/14] listing performance review"
node --import tsx/esm src/review-listing-performance.ts

echo "\n[14/14] must-watch audit"
node --import tsx/esm src/must-watch-audit.ts

echo "\nGenerated:"
ls -lh \
  reports/ipo_theme_watch_latest.md \
  reports/ipo_theme_watch_latest.json \
  reports/jpx_listing_sync_latest.md \
  reports/jpx_listing_sync_latest.json \
  reports/listing_event_watch_latest.md \
  reports/listing_event_watch_latest.json \
  reports/listing_event_sync_preview_latest.md \
  reports/listing_event_sync_preview_latest.json \
  reports/first_earnings_estimate_latest.md \
  reports/first_earnings_estimate_latest.json \
  reports/prospectus_lockup_extract_latest.md \
  reports/prospectus_lockup_extract_latest.json \
  reports/lockup_event_extract_latest.md \
  reports/lockup_event_extract_latest.json \
  reports/listing_event_alerts_latest.md \
  reports/listing_event_alerts_latest.json \
  reports/listing_event_message_preview_latest.md \
  reports/listing_event_message_preview_latest.json \
  reports/listing_event_alert_sender_latest.md \
  reports/listing_event_alert_sender_latest.json \
  reports/listing_review_price_import_latest.md \
  reports/listing_review_price_import_latest.json \
  reports/listing_event_review_latest.md \
  reports/listing_event_review_latest.json \
  reports/listing_performance_review_latest.md \
  reports/listing_performance_review_latest.json \
  reports/must_watch_audit_latest.md \
  reports/must_watch_audit_latest.json

echo "\nOK: IPO / listing watch reports generated"
