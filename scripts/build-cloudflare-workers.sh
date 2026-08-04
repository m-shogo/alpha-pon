#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/3] Build verified Next.js static export"
bash scripts/build-cloudflare-pages.sh

echo "[2/3] Verify Workers Static Assets prerequisites"
test -f apps/web/out/404.html
test -f apps/web/out/_headers
test -f apps/web/out/generated/alpha-pon-events.json
test -f apps/web/out/generated/alpha-pon-events.ics

echo "[3/3] Verify Worker routing and configuration"
node --import tsx/esm scripts/verify-workers-static-assets.ts

echo "cloudflare-workers-build: ok"
