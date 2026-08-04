# Cloudflare production verification

Updated: 2026-08-04 JST
Status: `AUTHENTICATED_ICS_RECHECK_PENDING`
Scope: Alpha Pon public read-only Worker / D1 / calendar production verification

## Confirmed production facts

Production origin:

```text
https://alpha-pon.m-shogo-0409.workers.dev
```

Confirmed by direct production requests after merge commit:

```text
9bf3ae3490a4b08c4cf1f7916bf73c5867a06fb1
```

- `/healthz`: HTTP 200
- `accessConfigured: false`
- `apiAccessMode: public-read-only`
- `calendarFeedConfigured: true`
- `databaseBound: true`
- `/api/market-events`: HTTP 200
- source: `cloudflare-d1`
- events: 3
- `summary.total`: 3
- individual existing event: HTTP 200
- missing event: HTTP 404
- `POST /api/market-events`: HTTP 405 with `Allow: GET`
- `/api/calendar-feed-url`: HTTP 404
- spoofed `Cf-Access-Authenticated-User-Email`: still HTTP 404
- `/calendar.ics` without token: HTTP 404
- `/calendar.ics?token=wrong`: HTTP 404
- `/calendar/`: HTTP 200
- remote D1 mode remains `READ_ONLY_NO_TRIGGERS`
- no public write API was added

## Authenticated ICS diagnostic

The Worker handler returns only these authenticated-ICS outcomes:

- invalid or missing token: 404
- valid token with missing DB binding: 503
- valid token with DB binding: 200 `text/calendar`
- unhandled Worker exception: 500

The Worker does not generate HTTP 403.

A production check made with Python `urllib` returned an unstyled Cloudflare HTTP 403 before a Worker response could be observed. Cloudflare Browser Integrity Check is enabled by default and may challenge or deny requests with a missing or non-standard User-Agent. Python's default network User-Agent is therefore not used by the canonical production verifier.

Do not disable Cloudflare security globally for this diagnosis. Do not add Cloudflare Access or Zero Trust.

## Canonical verification command

Run from the repository root:

```bash
bash scripts/verify-cloudflare-production.sh
```

The verifier:

- uses `curl` with a browser-compatible User-Agent
- reads `CALENDAR_FEED_TOKEN` from the environment, macOS Keychain, or hidden input
- never prints the token
- does not put the token value in the shell command line
- checks health, public D1 API, individual event, missing event, POST rejection, hidden feed URL, invalid-token ICS, authenticated ICS, and calendar UI HTTP status
- expects three production events by default

macOS Keychain service name:

```text
Alpha Pon CALENDAR_FEED_TOKEN
```

Override examples:

```bash
ALPHA_PON_EXPECTED_EVENTS=4 bash scripts/verify-cloudflare-production.sh
bash scripts/verify-cloudflare-production.sh --skip-authenticated-ics
```

`--skip-authenticated-ics` is diagnostic only and does not complete production verification.

## Completion requirement

Do not mark the Cloudflare migration complete until the canonical verifier reports:

```text
RESULT: PASS
```

Authenticated ICS must specifically confirm:

- HTTP 200
- `content-type: text/calendar`
- `BEGIN:VCALENDAR`
- expected `VEVENT` count

The token value itself must never be committed, printed in CI, pasted into GitHub, or recorded in this document.
