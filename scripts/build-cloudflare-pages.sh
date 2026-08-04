#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/alpha-pon-pages-build.XXXXXX")"
DB_PATH="$TEMP_DIR/market-events.db"
trap 'rm -rf "$TEMP_DIR"' EXIT

run_ts() {
  node --import tsx/esm "$@"
}

echo "[1/10] Verify market event contracts"
run_ts scripts/verify-market-event-foundation.ts
run_ts scripts/verify-market-event-schema.ts
run_ts scripts/verify-market-event-end-to-end.ts
run_ts scripts/verify-pages-market-event-function.ts

echo "[2/10] Verify append-only revision guards"
run_ts scripts/verify-market-event-revision-guards.ts

echo "[3/10] Verify deterministic D1 bootstrap"
run_ts scripts/verify-d1-bootstrap-export.ts

echo "[4/10] Verify pre-Cloudflare readiness"
run_ts scripts/verify-cloudflare-calendar-readiness.ts

echo "[5/10] Build isolated market event snapshot"
run_ts scripts/market-events.ts init --db "$DB_PATH" --write >/dev/null
shopt -s nullglob
EVENT_FILES=(config/market-events/*.json)
for event_file in "${EVENT_FILES[@]}"; do
  run_ts scripts/market-events.ts add --db "$DB_PATH" --file "$event_file" --write >/dev/null
done

run_ts scripts/market-events.ts audit --db "$DB_PATH"
run_ts scripts/market-events.ts generate \
  --db "$DB_PATH" \
  --json apps/web/public/generated/alpha-pon-events.json \
  --ics apps/web/public/generated/alpha-pon-events.ics \
  --write

echo "[6/10] Generate existing Alpha Pon web data"
pnpm ui:data

echo "[7/10] Typecheck web"
pnpm web:typecheck

echo "[8/10] Lint web"
pnpm --filter @alpha-pon/web lint

echo "[9/10] Build Next.js static export"
pnpm web:build

echo "[10/10] Verify Pages output"
test -f apps/web/out/index.html
test -f apps/web/out/calendar/index.html
test -f apps/web/out/_routes.json
test -f apps/web/out/_headers
test -f apps/web/out/generated/alpha-pon-events.json
test -f apps/web/out/generated/alpha-pon-events.ics
test -f apps/web/out/sw.js

echo "cloudflare-pages-build: ok"
