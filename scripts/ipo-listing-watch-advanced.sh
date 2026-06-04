#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== alpha-pon IPO / listing watch advanced =="
echo "repo: $(pwd)"

echo "\n[1/20] readiness"
node --import tsx/esm src/listing-automation-readiness.ts

echo "\n[2/20] IPO theme watch"
node --import tsx/esm src/ipo-theme-watch-report.ts

echo "\n[3/20] JPX listing sync dry-run"
node --import tsx/esm src/sync-jpx-listings.ts

echo "\n[4/20] listing event watch"
node --import tsx/esm src/listing-event-watch-report.ts

echo "\n[5/20] listing event sync preview"
node --import tsx/esm src/sync-listing-events.ts

echo "\n[6/20] first earnings estimate"
node --import tsx/esm src/estimate-first-earnings.ts

echo "\n[7/20] prospectus lockup candidate extraction"
node --import tsx/esm src/extract-lockup-from-prospectus.ts

echo "\n[8/20] lockup event extraction"
node --import tsx/esm src/extract-lockup-events.ts

echo "\n[9/20] listing event alerts"
node --import tsx/esm src/listing-event-alerts.ts

echo "\n[10/20] listing event message preview"
node --import tsx/esm src/listing-event-message-preview.ts

echo "\n[11/20] listing event alert sender dry-run"
node --import tsx/esm src/listing-event-alert-sender.ts

echo "\n[12/20] policy-aware alert sender dry-run"
node --import tsx/esm src/listing-event-alert-sender-policy.ts

echo "\n[13/20] J-Quants listing review prices dry-run"
node --import tsx/esm src/jquants-fetch-listing-review-prices.ts

echo "\n[14/20] listing review price import preview"
node --import tsx/esm src/update-listing-review-prices.ts

echo "\n[15/20] TOPIX relative return preview"
node --import tsx/esm src/calc-listing-topix-relative.ts

echo "\n[16/20] listing event review"
node --import tsx/esm src/listing-event-review.ts

echo "\n[17/20] listing performance review"
node --import tsx/esm src/review-listing-performance.ts

echo "\n[18/20] must-watch audit"
node --import tsx/esm src/must-watch-audit.ts

echo "\n[19/20] operation docs reminder"
echo "See docs/ipo-listing-operations.md and docs/ipo-listing-input-examples.md"

echo "\n[20/20] generated files"
ls -lh reports/*.md reports/*.json 2>/dev/null || true

echo "\nOK: advanced IPO / listing watch dry-run completed"
