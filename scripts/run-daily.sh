#!/bin/bash
# launchd から呼ばれるラッパースクリプト
# .env を読み込んでから daily.ts を実行する

DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ -f "$DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$DIR/.env"
  set +a
fi

exec node --import "tsx/esm" "$DIR/src/daily.ts"
