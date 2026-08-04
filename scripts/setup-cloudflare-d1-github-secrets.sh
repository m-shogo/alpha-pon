#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APPLY=0
HAS_ACCOUNT_ID=0
for argument in "$@"; do
  case "$argument" in
    --apply)
      APPLY=1
      ;;
    --account-id|--account-id=*)
      HAS_ACCOUNT_ID=1
      ;;
  esac
done

restore_terminal() {
  stty echo 2>/dev/null || true
  unset CLOUDFLARE_TOKEN_CREATOR_API_TOKEN
}
trap restore_terminal EXIT INT TERM

if [[ "$APPLY" -eq 1 ]]; then
  if [[ "$HAS_ACCOUNT_ID" -eq 0 && -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
    printf 'Cloudflare account ID (32 hex characters): '
    IFS= read -r CLOUDFLARE_ACCOUNT_ID
    export CLOUDFLARE_ACCOUNT_ID
  fi

  if [[ -z "${CLOUDFLARE_TOKEN_CREATOR_API_TOKEN:-}" ]]; then
    if [[ ! -t 0 ]]; then
      echo "Interactive terminal required to read the one-time Cloudflare token securely." >&2
      exit 1
    fi
    printf 'Cloudflare one-time token creator token (hidden): '
    stty -echo
    IFS= read -r CLOUDFLARE_TOKEN_CREATOR_API_TOKEN
    stty echo
    printf '\n'
    export CLOUDFLARE_TOKEN_CREATOR_API_TOKEN
  fi
fi

node --import tsx/esm scripts/setup-cloudflare-d1-github-secrets.ts "$@"
