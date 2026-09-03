# Storage Foundation Acceptance Gates

The storage foundation is not production-ready as a whole until all applicable gates pass.

Current implementation status is tracked in:

- `docs/implementation/storage-foundation-current.md`

Do not infer completion from an unchecked historical plan or from one operational slice being green.

## Scope interpretation — 2026-09-03

The current Owner Web / Market Event runtime is intentionally **public read-only**. Therefore the old blanket requirement "Cloudflare Access deny-by-default" no longer applies to public static/GET-only routes.

The security requirement is now capability-based:

- public read-only static/GET surfaces may remain public;
- browser-facing write/admin APIs must not be exposed;
- future private/write/admin/evidence surfaces must be deny-by-default using Access or an equivalent authenticated boundary;
- R2 private evidence must never become public merely because the Owner shell is public.

Runtime authority for this boundary:

- `docs/implementation/cloudflare-workers-static-assets-runbook.md`

## Contract gates

- [ ] schema and enums reject unknown values for every migrated storage class
- [ ] production/shadow/local separation enforced for each repository/adapter
- [ ] unknown or local-only license data cannot leave permitted local storage
- [ ] append-only revision and decision history proven for each migrated domain

A single domain passing these gates does not automatically certify all Storage Foundation domains.

## Migration gates

- [ ] existing files and DBs inventoried for the domain being migrated
- [ ] dry-run performs zero destructive writes
- [ ] dual-read counts and semantic results match
- [ ] rollback procedure tested

## Reliability gates

- [ ] idempotent event/source/delivery keys for the migrated domain
- [ ] transactional outbox where an external side effect exists
- [ ] retry and dead-letter handling where delivery is enabled
- [ ] stale data surfaced rather than silently presented as current

## Security gates

- [ ] public runtime exposes no browser-facing write/admin endpoint
- [ ] future private/write/admin/evidence surfaces are deny-by-default
- [ ] secrets excluded from Git, client bundle, generated JSON, logs, and artifacts
- [ ] private R2 bucket before permitted evidence/backup is uploaded
- [ ] source/license policy audit before data leaves its allowed storage class

## Research / real-market gates

PIT Price Store software implementation green is not enough for real-market research acceptance.

- [ ] governed real issuer series accepted under the PIT contract
- [ ] permitted/licensed PIT TOPIX benchmark accepted
- [ ] permitted/licensed PIT sector benchmark accepted
- [ ] Corporate Action Evidence / Clearance covers the measured horizon
- [ ] replay/readback proves no future reference, revision ambiguity, or double adjustment
- [ ] Signal Store consumes only accepted PIT/evidence inputs
- [ ] Event Study / Net Alpha records are derived from real accepted inputs before being described as real-market measurements

Canonical PIT detail:

- `docs/research/pit-price-store.md`

## Recovery gates

- [ ] D1 logical export
- [ ] schema/version/row-count/hash manifest
- [ ] restore rehearsal
- [ ] projection rebuild after restore
- [ ] Calendar reconciliation after restore
- [ ] notification dedupe/delivery reconciliation after restore

## Completion guard

No phase may delete or replace current authoritative runtime data until the relevant dual-read, counts, hashes, semantic comparison, licensing, and rollback evidence pass.

No missing real-market or recovery evidence may be replaced by synthetic fixtures and then described as production evidence.
