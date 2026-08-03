# Market Event Foundation v1 — next implementation slice

## Immediate next actions

1. Run repository-local validation:
   - `pnpm typecheck`
   - `node --import tsx/esm scripts/verify-market-event-foundation.ts`
   - `node --import tsx/esm scripts/verify-market-event-schema.ts`
2. Wire the verification scripts into the repository check chain only after they pass.
3. Add a local atomic registration command for:
   - event current projection
   - first revision
   - official source metadata
   - notification/calendar outbox item
4. Generate a read-only `alpha-pon-events.json` snapshot.
5. Add the mobile-first `/calendar` agenda page and home next-event card.
6. Keep Cloudflare D1/R2/Pages and Google Calendar in dry-run until local parity and rollback evidence exist.

## Parallel-work rule

The hourly Edge research task continues independently. Calendar/storage work must not consume the Edge research schedule or replace research output with infrastructure-only activity.
