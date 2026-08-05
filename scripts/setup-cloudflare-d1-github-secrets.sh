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
  unset CLOUDFLARE_D1_READ_API_TOKEN_INPUT
  unset CLOUDFLARE_D1_EDIT_API_TOKEN_INPUT
}
trap restore_terminal EXIT INT TERM

read_hidden_token() {
  local prompt="$1"
  local variable_name="$2"
  local token_value=""
  printf '%s' "$prompt"
  stty -echo
  IFS= read -r token_value
  stty echo
  printf '\n'
  printf -v "$variable_name" '%s' "$token_value"
  export "$variable_name"
}

if [[ "$APPLY" -eq 1 ]]; then
  if [[ "$HAS_ACCOUNT_ID" -eq 0 && -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
    printf 'Cloudflare account ID (32 hex characters): '
    IFS= read -r CLOUDFLARE_ACCOUNT_ID
    export CLOUDFLARE_ACCOUNT_ID
  fi

  if [[ ! -t 0 ]]; then
    echo "Interactive terminal required to read final Cloudflare D1 tokens securely." >&2
    exit 1
  fi

  if [[ -z "${CLOUDFLARE_D1_READ_API_TOKEN_INPUT:-}" ]]; then
    read_hidden_token 'Final Cloudflare D1 Read account token (hidden): ' CLOUDFLARE_D1_READ_API_TOKEN_INPUT
  fi
  if [[ -z "${CLOUDFLARE_D1_EDIT_API_TOKEN_INPUT:-}" ]]; then
    read_hidden_token 'Final Cloudflare D1 Write account token (hidden): ' CLOUDFLARE_D1_EDIT_API_TOKEN_INPUT
  fi
fi

node --import tsx/esm scripts/import-cloudflare-d1-github-secrets.ts "$@"
