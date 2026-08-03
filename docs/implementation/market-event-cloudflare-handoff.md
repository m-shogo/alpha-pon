# Market Event Calendar — Cloudflare handoff

Status: `IMPLEMENTATION_IN_PROGRESS`
Updated: 2026-08-03 JST

## Goal

Reach the point where the remaining external blocker is only Cloudflare account/resource registration and credentials.

## Implemented without Cloudflare registration

- Market-event contracts and stable IDs
- Append-only local ledger
- Initial registration bundle builder
- Dry-run/write CLI
- D1-compatible migration
- Web projection generator
- ICS generator
- Mobile `/calendar` page
- Staleness/fallback handling
- Dedicated GitHub Actions validation workflow
- Cloudflare Wrangler template

## External actions that must not be fabricated

The repository cannot supply these values until the account owner registers or selects Cloudflare resources:

- Cloudflare account ID
- Pages project
- D1 database ID
- R2 bucket, if enabled
- Access application/policy
- Worker deployment credentials
- production hostname

Google Calendar write sync additionally requires Google OAuth credentials and target calendar ID. The ICS file can be generated before that registration.

## Final pre-registration engineering slices

1. Make CI green and fix all type/build failures.
2. Add a home-page next-event card.
3. Add local event update/postpone/complete CLI.
4. Add projection and ICS regression tests.
5. Add D1 adapter with a local SQLite compatibility test.
6. Add Worker read-only API and deny-by-default configuration.
7. Add deployment smoke script that fails clearly when IDs or secrets are placeholders.
8. Produce a one-command local demo runbook.

## Registration-time actions

1. Create/select Cloudflare account.
2. Create Pages project and D1 database.
3. Copy `cloudflare/wrangler.toml.example` to the deployment config and insert the real database ID.
4. Apply migrations first to a preview/shadow D1 database.
5. Run contract parity and row-count/hash audit.
6. Configure Cloudflare Access before exposing private investment data.
7. Deploy Worker API and Pages UI.
8. Only then configure Google Calendar OAuth and delivery outbox worker.

No production cutover is allowed from an unverified migration or a failed CI state.
