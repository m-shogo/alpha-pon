#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== alpha-pon must-watch audit =="
echo "repo: $(pwd)"

node --import tsx/esm src/must-watch-audit.ts

echo "\nGenerated:"
ls -lh reports/must_watch_audit_latest.md reports/must_watch_audit_latest.json

echo "\nTip: open reports/must_watch_audit_latest.md and check missingEntities / missingJapanLinks / missingQuestions."
