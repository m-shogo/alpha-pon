#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

node --import tsx/esm \
  src/research/cli/prepare-sanrio-edinet-pdf-fidelity-review.ts \
  "$@"
