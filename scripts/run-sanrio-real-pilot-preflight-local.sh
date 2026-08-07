#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

exec node --import tsx/esm src/research/cli/check-sanrio-real-pilot-preflight.ts "$@"
