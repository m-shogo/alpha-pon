# Storage Foundation Acceptance Gates

The storage foundation is not production-ready until all gates pass.

## Contract gates

- [ ] schema and enums reject unknown values
- [ ] production/shadow separation enforced
- [ ] unknown license data cannot leave local storage
- [ ] append-only revision and decision history proven

## Migration gates

- [ ] existing files and DBs inventoried
- [ ] dry-run performs zero destructive writes
- [ ] dual-read counts and semantic results match
- [ ] rollback procedure tested

## Reliability gates

- [ ] idempotent event/source/delivery keys
- [ ] transactional outbox
- [ ] retry and dead-letter handling
- [ ] stale data surfaced in API/UI

## Security gates

- [ ] Cloudflare Access deny-by-default
- [ ] secrets excluded from Git, client bundle, and generated JSON
- [ ] private R2 bucket
- [ ] source/license policy audit

## Recovery gates

- [ ] D1 logical export
- [ ] hash manifest
- [ ] restore rehearsal
- [ ] Calendar and notification reconciliation after restore
