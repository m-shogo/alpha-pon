# Alpha Pon Public Read-Only Runtime Amendment

Status: `ADOPTED`
Date: 2026-09-03 JST
Amends: `docs/decisions/2026-08-03-alpha-pon-storage-architecture-v1.md`
Runtime authority: `docs/implementation/cloudflare-workers-static-assets-runbook.md`

## Decision

The storage responsibility split from Storage Architecture v1 remains adopted.

This amendment changes only the **Owner Web / Worker runtime access model** where the 2026-08-03 document assumed a private application protected by Cloudflare Access.

The current production runtime is intentionally **public read-only**.

- static Owner UI may be public;
- approved operational GET APIs may be public;
- browser-facing write/admin APIs must not be exposed;
- secret-bearing routes remain disabled or token-protected as appropriate;
- R2 evidence/private backups remain private;
- licensed/local-only market data must not be published merely because the Owner shell is public;
- future private/write/admin/evidence surfaces must be deny-by-default using Cloudflare Access or an equivalent authenticated boundary.

## Why the original Access requirement changed

The first architecture assumed:

- private Owner Web;
- Cloudflare Access in front of the application;
- owner-email allowlisting.

The implemented Worker runtime instead proved a smaller public attack surface:

- public static assets;
- explicit GET-only market-event routes;
- no public browser write API;
- disabled secret-disclosure endpoint;
- tokenized ICS separated from public API reads;
- D1 runtime binding used through server-side Worker code;
- secrets remain outside Git/client/generated outputs.

For this runtime, adding Access/Zero Trust would add account/configuration complexity without protecting a browser write capability, because no such public capability exists.

## Superseded statements

Where `2026-08-03-alpha-pon-storage-architecture-v1.md` says any of the following as a blanket requirement for the current Owner runtime, this amendment takes precedence:

- "Alpha Pon Webは個人用private applicationを初期状態とする"
- "Cloudflare Accessを前段に置く"
- owner-email allowlisting as a prerequisite for the current public read-only UI
- Definition of Done requiring the current Web itself to be private
- Phase 4 wording that requires an authenticated Worker API for data that is explicitly approved as public read-only

These statements remain valid design options for future private/write/admin/evidence surfaces.

## What does not change

This amendment does **not** weaken:

- GitHub / D1 / R2 / local research responsibility separation;
- append-only operational history;
- Production / Shadow / local separation;
- PIT and provenance contracts;
- secret handling;
- license boundaries;
- R2 private evidence requirement;
- transactional outbox goals;
- backup/restore goals;
- no automatic billing/resource expansion;
- no public write API policy.

## Acceptance rule

Security acceptance is capability-based, not product-name-based.

A public read-only route is acceptable only when:

1. it exposes no secret/private/licensed payload;
2. it cannot mutate operational or research state;
3. unsupported methods fail closed;
4. missing backend bindings do not fall through as false success;
5. generated fallback is not mislabeled as LIVE;
6. any token-protected route validates the token before revealing backend state.

Any future capability that writes, administers, or serves private evidence requires an authenticated deny-by-default boundary before production use.
