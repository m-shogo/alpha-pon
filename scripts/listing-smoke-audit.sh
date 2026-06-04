#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== alpha-pon listing automation smoke audit =="
echo "repo: $(pwd)"

node --import tsx/esm src/listing-automation-smoke-audit.ts

echo "\nGenerated:"
ls -lh reports/listing_automation_smoke_audit_latest.md reports/listing_automation_smoke_audit_latest.json

echo "\nOK: smoke audit completed"
