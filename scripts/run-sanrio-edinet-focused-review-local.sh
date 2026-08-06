#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

node --import tsx/esm \
  src/research/cli/prepare-sanrio-edinet-focused-review-bundle.ts \
  "$@"
