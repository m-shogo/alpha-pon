# Storage Foundation Checklist

Authority: `docs/decisions/2026-08-03-alpha-pon-storage-architecture-v1.md`
Phase plan: `docs/implementation/storage-foundation-phase-0.md`

## Phase 0 — Contract

- [ ] storage/license/environment/knowledge-stage enums
- [ ] event/decision ledger interfaces
- [ ] deterministic IDs and source fingerprints
- [ ] outbox states and retry contract
- [ ] freshness/staleness contract
- [ ] D1-compatible schema v1
- [ ] local SQLite adapter contract
- [ ] current data inventory command
- [ ] tests

## Phase 1 — Local compatibility

- [ ] existing SQLite/JSONL inventory baseline
- [ ] append-only local ledger
- [ ] generated snapshot v2
- [ ] dual-read audit
- [ ] rollback evidence

## Phase 2 — Cloudflare prototype

- [ ] Cloudflare Free account resources documented
- [ ] D1 prod/shadow created
- [ ] Cloudflare Access private policy
- [ ] Worker health endpoint
- [ ] one low-volume official source adapter
- [ ] D1 readback and quota metrics
- [ ] outbox dry-run

## Phase 3 — Evidence and recovery

- [ ] R2 private bucket
- [ ] license guard
- [ ] permitted official snapshot writer
- [ ] D1 export manifest
- [ ] restore drill

## Phase 4 — UI and Calendar

- [ ] static shell + Worker API
- [ ] generated JSON fallback
- [ ] mobile decision queue
- [ ] PC cockpit layout
- [ ] calendar page
- [ ] Google Calendar idempotent upsert

## Completion guard

No phase may delete or replace current runtime data until dual-read, counts, hashes, semantic comparison, and rollback evidence pass.
