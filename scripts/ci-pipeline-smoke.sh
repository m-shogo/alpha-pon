#!/bin/bash
# CI用: 外部通知を止め、モックデータで run-daily.sh 全体を軽く実行する
# 目的: daily単体ではなく、lock / pipeline_status / レポート導線まで壊れていないか確認する

set -u

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1

rm -rf "$DIR/tmp/run-daily.lock"

USE_MOCK=true NOTIFY_MODE=off bash "$DIR/scripts/run-daily.sh"

test -f "$DIR/reports/pipeline_status_latest.json"
test -f "$DIR/reports/latest.md"
test -f "$DIR/reports/primary_disclosure_learning_latest.md"
test -f "$DIR/reports/primary_disclosure_category_learning_latest.md"

node -e 'const fs = require("fs"); const s = JSON.parse(fs.readFileSync("reports/pipeline_status_latest.json", "utf8")); if (!s.status) process.exit(1); if (!Array.isArray(s.steps)) process.exit(1); console.log(`pipeline smoke status=${s.status} steps=${s.steps.length}`);'
