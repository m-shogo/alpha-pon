#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== alpha-pon listing automation summary =="
echo "repo: $(pwd)"

node --import tsx/esm src/listing-automation-summary.ts

echo "\nGenerated:"
ls -lh reports/listing_automation_summary_latest.md reports/listing_automation_summary_latest.json

echo "\nOK: summary generated"
