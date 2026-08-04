#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

exec node --import tsx/esm scripts/sync-cloudflare-d1-market-events.ts "$@"
