# Storage Foundation Current State

Status: `PLANNING_COMPLETE_IMPLEMENTATION_NOT_STARTED`
Updated: 2026-08-03 JST

## Adopted

- GitHub = Knowledge/Contract
- D1 = Operational append-only ledger + current projection
- R2 = Private evidence/export/backup
- Mac DuckDB = Heavy research warehouse
- KV = Disposable cache only
- Google Calendar = One-way delivery projection
- Pages = Static shell; latest state comes from authenticated Worker API

## Current evidence

- Existing app uses Next.js and generated JSON.
- Existing runtime uses local Node SQLite for job and hypothesis outcome data.
- Existing runtime DB and high-volume generated files are gitignored.

## Next safe slice

Implement Phase 0 contracts and tests only. Do not create Cloudflare resources or migrate production data until the contract, inventory, dual-read, and rollback gates exist.
