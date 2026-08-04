#!/usr/bin/env bash
set -euo pipefail

ORIGIN="${ALPHA_PON_ORIGIN:-https://alpha-pon.m-shogo-0409.workers.dev}"
EXPECTED_EVENTS="${ALPHA_PON_EXPECTED_EVENTS:-3}"
KEYCHAIN_SERVICE="${ALPHA_PON_TOKEN_KEYCHAIN_SERVICE:-Alpha Pon CALENDAR_FEED_TOKEN}"
USER_AGENT="${ALPHA_PON_VERIFY_USER_AGENT:-Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15}"
SKIP_AUTHENTICATED_ICS=false

usage() {
  cat <<'EOF'
Usage: bash scripts/verify-cloudflare-production.sh [--skip-authenticated-ics]

Environment overrides:
  ALPHA_PON_ORIGIN
  ALPHA_PON_EXPECTED_EVENTS
  ALPHA_PON_TOKEN_KEYCHAIN_SERVICE
  ALPHA_PON_VERIFY_USER_AGENT
  CALENDAR_FEED_TOKEN

Token lookup order:
  1. CALENDAR_FEED_TOKEN environment variable
  2. macOS Keychain item named "Alpha Pon CALENDAR_FEED_TOKEN"
  3. hidden terminal prompt

The token value is never printed. Authenticated ICS is requested with curl,
not Python urllib, so Cloudflare Browser Integrity Check does not reject a
non-standard Python User-Agent before the Worker executes.
EOF
}

while (($#)); do
  case "$1" in
    --skip-authenticated-ics)
      SKIP_AUTHENTICATED_ICS=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

TMP_DIR="$(mktemp -d)"
TOKEN=""
FAILURES=0

# Invoked indirectly by trap.
# shellcheck disable=SC2317
cleanup() {
  rm -rf "$TMP_DIR"
  TOKEN=""
  unset CALENDAR_FEED_TOKEN || true
}
trap cleanup EXIT

pass() {
  printf '✅ %s\n' "$1"
}

fail() {
  printf '❌ %s\n' "$1"
  FAILURES=$((FAILURES + 1))
}

status_from_headers() {
  awk 'toupper($1) ~ /^HTTP/ { code=$2 } END { print code }' "$1"
}

request() {
  local name="$1"
  shift
  curl \
    --silent \
    --show-error \
    --user-agent "$USER_AGENT" \
    --dump-header "$TMP_DIR/$name.headers" \
    --output "$TMP_DIR/$name.body" \
    "$@"
}

load_token() {
  if [[ -n "${CALENDAR_FEED_TOKEN:-}" ]]; then
    TOKEN="$CALENDAR_FEED_TOKEN"
    return
  fi

  if [[ "$(uname -s)" == "Darwin" ]] && command -v security >/dev/null 2>&1; then
    TOKEN="$(security find-generic-password \
      -a "${USER:-$(id -un)}" \
      -s "$KEYCHAIN_SERVICE" \
      -w 2>/dev/null || true)"
  fi

  if [[ -z "$TOKEN" ]]; then
    printf 'CALENDAR_FEED_TOKENを非表示で入力してください: '
    IFS= read -r -s TOKEN
    printf '\n'
  fi

  if [[ -z "$TOKEN" ]]; then
    fail 'authenticated ICS: Tokenを取得できません'
    return 1
  fi
}

echo '=== Alpha Pon production verification ==='

request health "$ORIGIN/healthz"
STATUS="$(status_from_headers "$TMP_DIR/health.headers")"
if [[ "$STATUS" == "200" ]] \
  && grep -q '"apiAccessMode":"public-read-only"' "$TMP_DIR/health.body" \
  && grep -q '"calendarFeedConfigured":true' "$TMP_DIR/health.body" \
  && grep -q '"databaseBound":true' "$TMP_DIR/health.body"; then
  pass 'healthz: public-read-only / calendar configured / DB bound'
else
  fail "healthz: HTTP=${STATUS:-unknown}"
fi

request events "$ORIGIN/api/market-events"
STATUS="$(status_from_headers "$TMP_DIR/events.headers")"
EVENT_ID="$(grep -o '"eventId":"[^"]*"' "$TMP_DIR/events.body" | head -1 | cut -d'"' -f4 || true)"
if [[ "$STATUS" == "200" ]] \
  && grep -q '"source":"cloudflare-d1"' "$TMP_DIR/events.body" \
  && grep -q "\"total\":$EXPECTED_EVENTS" "$TMP_DIR/events.body" \
  && [[ -n "$EVENT_ID" ]]; then
  pass "market-events: LIVE D1 / total $EXPECTED_EVENTS"
else
  fail "market-events: HTTP=${STATUS:-unknown}"
fi

if grep -Eqi 'CALENDAR_FEED_TOKEN|OWNER_EMAIL|api[_-]?key|bearer[[:space:]]+[A-Za-z0-9._-]+' "$TMP_DIR/events.body"; then
  fail 'market-events: private-data-like value detected'
else
  pass 'market-events: no obvious Token/email/API-key leakage'
fi

if [[ -n "$EVENT_ID" ]]; then
  request event "$ORIGIN/api/market-events/$EVENT_ID"
  STATUS="$(status_from_headers "$TMP_DIR/event.headers")"
  if [[ "$STATUS" == "200" ]] && grep -q "\"eventId\":\"$EVENT_ID\"" "$TMP_DIR/event.body"; then
    pass 'individual event: 200'
  else
    fail "individual event: HTTP=${STATUS:-unknown}"
  fi
fi

request missing "$ORIGIN/api/market-events/evt_missing"
STATUS="$(status_from_headers "$TMP_DIR/missing.headers")"
if [[ "$STATUS" == "404" ]] && grep -q '"error":"not found"' "$TMP_DIR/missing.body"; then
  pass 'missing event: 404'
else
  fail "missing event: HTTP=${STATUS:-unknown}"
fi

request post --request POST "$ORIGIN/api/market-events"
STATUS="$(status_from_headers "$TMP_DIR/post.headers")"
if [[ "$STATUS" == "405" ]] && grep -Eqi '^allow:[[:space:]]*GET' "$TMP_DIR/post.headers"; then
  pass 'POST rejected: 405 / Allow GET'
else
  fail "POST rejection: HTTP=${STATUS:-unknown}"
fi

request feed-url "$ORIGIN/api/calendar-feed-url"
STATUS="$(status_from_headers "$TMP_DIR/feed-url.headers")"
if [[ "$STATUS" == "404" ]] && grep -q '"error":"not found"' "$TMP_DIR/feed-url.body"; then
  pass 'calendar-feed-url: hidden with 404'
else
  fail "calendar-feed-url: HTTP=${STATUS:-unknown}"
fi

request spoofed-feed-url \
  --header 'Cf-Access-Authenticated-User-Email: owner@example.com' \
  "$ORIGIN/api/calendar-feed-url"
STATUS="$(status_from_headers "$TMP_DIR/spoofed-feed-url.headers")"
if [[ "$STATUS" == "404" ]]; then
  pass 'spoofed Access identity: still 404'
else
  fail "spoofed Access identity: HTTP=${STATUS:-unknown}"
fi

request ics-none "$ORIGIN/calendar.ics"
STATUS="$(status_from_headers "$TMP_DIR/ics-none.headers")"
if [[ "$STATUS" == "404" ]]; then
  pass 'ICS without Token: 404'
else
  fail "ICS without Token: HTTP=${STATUS:-unknown}"
fi

request ics-wrong --get --data-urlencode 'token=wrong' "$ORIGIN/calendar.ics"
STATUS="$(status_from_headers "$TMP_DIR/ics-wrong.headers")"
if [[ "$STATUS" == "404" ]]; then
  pass 'ICS with wrong Token: 404'
else
  fail "ICS with wrong Token: HTTP=${STATUS:-unknown}"
fi

if [[ "$SKIP_AUTHENTICATED_ICS" == true ]]; then
  pass 'authenticated ICS: skipped explicitly'
elif load_token; then
  printf '%s' "$TOKEN" | curl \
    --silent \
    --show-error \
    --get \
    --data-urlencode 'token@-' \
    --user-agent "$USER_AGENT" \
    --dump-header "$TMP_DIR/ics-valid.headers" \
    --output "$TMP_DIR/ics-valid.body" \
    "$ORIGIN/calendar.ics"

  STATUS="$(status_from_headers "$TMP_DIR/ics-valid.headers")"
  CONTENT_TYPE="$(awk 'BEGIN { IGNORECASE=1 } /^content-type:/ { sub(/\r$/, ""); value=$0 } END { print value }' "$TMP_DIR/ics-valid.headers")"
  VEVENTS="$(grep -c '^BEGIN:VEVENT' "$TMP_DIR/ics-valid.body" 2>/dev/null || true)"

  if [[ "$STATUS" == "200" ]] \
    && grep -qi 'text/calendar' <<<"$CONTENT_TYPE" \
    && grep -q '^BEGIN:VCALENDAR' "$TMP_DIR/ics-valid.body" \
    && [[ "$VEVENTS" == "$EXPECTED_EVENTS" ]]; then
    pass "authenticated ICS: HTTP 200 / VEVENT $EXPECTED_EVENTS"
  else
    fail "authenticated ICS: HTTP=${STATUS:-unknown} VEVENT=${VEVENTS:-unknown}"
    grep -Ei '^(HTTP/|server:|cf-ray:|cf-mitigated:|content-type:|location:)' \
      "$TMP_DIR/ics-valid.headers" || true
  fi
fi

request calendar "$ORIGIN/calendar/"
STATUS="$(status_from_headers "$TMP_DIR/calendar.headers")"
if [[ "$STATUS" == "200" ]]; then
  pass 'calendar UI: HTTP 200'
else
  fail "calendar UI: HTTP=${STATUS:-unknown}"
fi

echo
if ((FAILURES == 0)); then
  echo 'RESULT: PASS'
  echo 'Token値は表示・記録していません。'
  exit 0
fi

echo "RESULT: FAIL ($FAILURES)"
exit 1
