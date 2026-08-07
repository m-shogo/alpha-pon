#!/usr/bin/env bash
set -euo pipefail

umask 077
ROOT="${1:-research/prices/jquants-free}"
node --import tsx/esm src/research/cli/audit-jquants-free-price-store.ts --root "$ROOT"
