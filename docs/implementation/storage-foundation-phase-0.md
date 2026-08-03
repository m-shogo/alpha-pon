# Storage Foundation Phase 0

Status: `READY_TO_IMPLEMENT`
Date: 2026-08-03 JST
Authority: `docs/decisions/2026-08-03-alpha-pon-storage-architecture-v1.md`

## Goal

既存Alpha Ponを壊さず、GitHub / local SQLite-DuckDB / Cloudflare D1-R2へ段階移行できる契約を先に作る。

## First implementation slice

1. `StorageClass`, `LicenseClass`, `EnvironmentClass`, `KnowledgeStage` type contract
2. Event / decision append-only ledger interface
3. Local SQLite adapter compatible with Node `node:sqlite`
4. D1-compatible SQL schema v1
5. Deterministic event/source/delivery keys
6. Transactional outbox state machine
7. Existing DB/JSONL inventory report
8. Generated snapshot v2 contract with freshness fields
9. Unit tests and migration dry-run

## Explicit non-goals

- Cloudflare account creation or billing setup
- production D1 migration
- R2 upload
- real notification sending
- Google Calendar write
- existing runtime files deletion
- production score/threshold change

## Required tests

- same source twice creates one event revision
- new source content creates a new revision
- decision snapshots never overwrite history
- production and shadow repositories cannot mix
- unknown license defaults to local-only/no-publication
- outbox retry does not duplicate deliveries
- stale snapshot is visibly marked
- migration dry-run changes no existing file

## Rollback

All Phase 0 additions are additive. Existing JSONL/SQLite/generated JSON remain authoritative until dual-read comparison passes in later phases.
