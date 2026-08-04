# Cloudflare production verification

Updated: 2026-08-04 22:53 JST
Status: `PRODUCTION_TECHNICAL_VERIFICATION_PASS`
Scope: Alpha Pon public read-only Worker / D1 / calendar production verification

## Verification result

Canonical production verification completed successfully on 2026-08-04 22:53 JST.

```text
RESULT: PASS
```

Verified against production after merge commit:

```text
e7f69e0875917c3bfe1224c2f4fa3f17f41eea64
```

Production origin:

```text
https://alpha-pon.m-shogo-0409.workers.dev
```

No Secret value was printed, committed, or recorded.

## Confirmed production facts

- `/healthz`: HTTP 200
- `accessConfigured: false`
- `apiAccessMode: public-read-only`
- `calendarFeedConfigured: true`
- `databaseBound: true`
- `/api/market-events`: HTTP 200
- source: `cloudflare-d1`
- events: 3
- `summary.total`: 3
- no obvious Token, email, or API-key leakage in the public market-events response
- individual existing event: HTTP 200
- missing event: HTTP 404
- `POST /api/market-events`: HTTP 405 with `Allow: GET`
- `/api/calendar-feed-url`: HTTP 404
- spoofed `Cf-Access-Authenticated-User-Email`: still HTTP 404
- `/calendar.ics` without token: HTTP 404
- `/calendar.ics?token=wrong`: HTTP 404
- authenticated `/calendar.ics`: HTTP 200
- authenticated ICS content type: `text/calendar`
- authenticated ICS events: 3 `VEVENT` entries
- `/calendar/`: HTTP 200
- remote D1 mode remains `READ_ONLY_NO_TRIGGERS`
- remote triggers remain 0
- legacy guard marker remains 0
- no public write API was added
- Cloudflare Access and Zero Trust remain unused

## Remaining visual QA boundary

The canonical verifier confirms that `/calendar/` returns HTTP 200. It does not prove visual layout quality.

The following remain manual browser checks and must not be inferred from this technical PASS:

- LIVE D1 is displayed rather than fallback or snapshot data
- event source, dates, state, and primary-information links render correctly
- desktop and mobile layouts do not break
- browser console has no errors

These visual checks do not block the Worker, D1 API, Secret protection, or authenticated ICS technical verification recorded above.

## Authenticated ICS diagnostic history

The Worker handler returns only these authenticated-ICS outcomes:

- invalid or missing token: 404
- valid token with missing DB binding: 503
- valid token with DB binding: 200 `text/calendar`
- unhandled Worker exception: 500

The Worker does not generate HTTP 403.

Earlier production checks made with Python `urllib` returned an unstyled Cloudflare HTTP 403 before a Worker response could be observed. The canonical verifier therefore uses `curl` with a browser-compatible User-Agent. The same stored Secret then returned HTTP 200 with three `VEVENT` entries.

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

## Completion rule

A future production verification is successful only when the canonical verifier reports:

```text
RESULT: PASS
```

Authenticated ICS must specifically confirm:

- HTTP 200
- `content-type: text/calendar`
- `BEGIN:VCALENDAR`
- expected `VEVENT` count

The token value itself must never be committed, printed in CI, pasted into GitHub, or recorded in this document.
