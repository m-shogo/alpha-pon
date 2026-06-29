#!/usr/bin/env bash
set -euo pipefail

node --env-file=.env --import tsx/esm src/test-line-notify.ts
