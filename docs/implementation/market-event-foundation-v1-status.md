# Market Event Foundation v1 — current status

Updated: 2026-08-03 JST
Status: `PHASE_0_IMPLEMENTED_UNVERIFIED_IN_REPO`

## Completed

- market event/event revision/source/outbox TypeScript contracts
- stable deterministic IDs
  - stable across postponements
  - stable across issuer display-name changes when a security code exists
  - independent from which source first discovered the event
- exact/date-only/window/unknown time precision contract
- unknown-date anti-fabrication guard
- append-only local JSONL ledger
- malformed-record fail-closed validation
- current event projection builder
- D1-compatible SQLite schema
- transactional delivery outbox tables
- calendar sync state tables
- standalone contract verification script
- standalone schema verification script

## Validation performed in this session

- SQL migration executed successfully against an in-memory SQLite database outside the repo runtime.
- All expected tables were created.
- No Cloudflare resources, secrets, calendars, notifications, or production databases were changed.

## Validation not yet evidenced

- repo dependency installation and `pnpm typecheck`
- execution of `scripts/verify-market-event-foundation.ts`
- execution of `scripts/verify-market-event-schema.ts`
- integration with the existing `pnpm check` chain
- CI execution evidence

Do not call Phase 0 fully green until those commands run in the real checkout.

## Next slice

1. run typecheck and both verification scripts in the actual repository;
2. fix any errors before adding integration;
3. add a local registration CLI that writes event + first revision + source + outbox atomically to a temporary ledger;
4. generate a read-only `alpha-pon-events.json` projection;
5. build `/calendar` against the generated projection before D1 provisioning.
