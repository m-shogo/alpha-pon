#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "ERROR: .env が見つかりません。repo直下に作成してください。" >&2
  exit 2
fi

node --env-file=.env --import tsx/esm src/run-sanrio-edinet-pilot.ts "$@"
