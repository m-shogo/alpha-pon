#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

node --env-file=.env --import tsx/esm src/run-configured-edinet-acquisition.ts "$@"
