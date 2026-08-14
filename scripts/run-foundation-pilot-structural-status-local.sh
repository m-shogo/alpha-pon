#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

node --import tsx/esm src/research/cli/preflight-foundation-pilot-structural-status-time.ts "$@"
node --import tsx/esm src/research/cli/report-foundation-pilot-structural-status.ts "$@"
