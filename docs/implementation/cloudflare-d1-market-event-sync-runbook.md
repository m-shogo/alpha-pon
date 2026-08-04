# Cloudflare D1 market-event sync runbook

Status: `MANUAL_DISPATCH_ONLY`
Updated: 2026-08-04 JST

## Purpose

Canonical market-event JSON under `config/market-events/` is synchronized to the remote D1 database without adding a public write API to the Worker.

The initial version is intentionally conservative:

- default is dry-run
- remote writes require explicit `--apply`
- GitHub Actions apply requires `apply=true` and `confirmation=APPLY`
- production apply uses the GitHub `production` environment
- remote D1 is exported before apply
- remote state is re-queried after apply, including when the apply command reports an error
- destructive delete is not generated
- rows that exist only in remote D1 are reported as `removedCandidates` and preserved
- revision/source/decision ID collisions are blockers
- remote trigger count must remain `0`
- legacy guard marker count must remain `0`
- no Access, Zero Trust, public POST/PUT/PATCH/DELETE API, or billing setup is introduced

## Canonical source

The CLI rebuilds a temporary SQLite database from every sorted JSON file under:

```text
config/market-events/*.json
```

It then runs the existing market-event database audit before comparing with D1. The temporary database is removed at the end of the process.

Only the public projection foundation tables are synchronized in v1:

```text
market_events
event_sources
event_revisions
decision_snapshots
```

Delivery outbox, calendar provider state, source checkpoints, and review tasks are not modified by this sync.

## Local dry-run

Authentication must already be available to Wrangler. Do not paste a token into the command or shell history.

```bash
bash scripts/sync-cloudflare-d1-market-events.sh \
  --database alpha-pon-market-events
```

Artifacts are written under:

```text
artifacts/cloudflare-d1-sync/
```

Review at minimum:

- `market-events-sync-plan.json`
- `market-events-sync.sql`
- `canonical-snapshot.json`
- `remote-before.json`

Expected terminal marker:

```text
DRY_RUN_ONLY: no Cloudflare state changed.
```

## Local apply

Run only after reviewing the dry-run artifact from the same current branch and canonical source.

```bash
bash scripts/sync-cloudflare-d1-market-events.sh \
  --database alpha-pon-market-events \
  --apply
```

The CLI performs these steps:

1. rebuild and audit canonical state
2. query remote D1 and calculate the diff
3. block on validation errors, immutable collisions, non-zero triggers, or the legacy marker
4. export remote D1 to `remote-backup-*.sql`
5. apply append/upsert SQL
6. re-query remote D1
7. verify no canonical added/updated/collision rows remain
8. record pre/post snapshots and the result artifact

An apply error does not prove rollback. The CLI re-queries the remote database and reports the observed post-state. If that re-query also fails, preserve the backup and inspect D1 directly before retrying.

## GitHub Actions manual dispatch

Workflow:

```text
.github/workflows/sync-cloudflare-d1-market-events.yml
```

It has no `schedule` trigger. Do not add one until manual executions have demonstrated safe idempotency and the user has approved cadence, free-tier impact, and operational risk.

Required GitHub secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

The API token must have only the Cloudflare permissions required to read/export/execute against the target D1 database. Never store it in repository variables, workflow inputs, artifacts, logs, Issues, PR text, or chat.

Create or verify the GitHub environment:

```text
production
```

Recommended protection:

- required reviewer: repository owner
- deployment branches: protected branches only
- no self-bypass when a second trusted reviewer becomes available

The dry-run job always runs first. The apply job starts only when all of the following are true:

```text
apply = true
confirmation = APPLY
dry-run = success
production environment approval = granted
```

GitHub workflow failure notifications are the canonical initial failure alert. No email address or public webhook is added to the repository.

## Diff semantics

### added

Canonical primary key is absent from remote D1. The generated SQL inserts it.

### updated

Only `market_events` may be updated in place. A canonical event older than the remote `updated_at` is blocked.

### unchanged

Canonical and remote rows match across the complete synchronized column list.

### removedCandidates

Remote primary key is absent from canonical state. Initial v1 does not delete it.

### collisions

An append-only revision, source, or decision uses an existing primary key with different content. Apply is blocked. Resolve the canonical identity/revision problem rather than overwriting history.

## Post-apply checks

The result must show:

- `added = 0`
- `updated = 0`
- `collisions = 0`
- `triggers = 0`
- `legacyGuardMarker = 0`

`removedCandidates` may be non-zero because v1 preserves remote-only rows.

Then run the canonical production verifier without exposing the ICS token:

```bash
bash scripts/verify-cloudflare-production.sh
```

Confirm the public API and Calendar UI still use LIVE D1 data. Do not claim successful production synchronization from the apply command alone.

## Recovery

The apply artifact contains a remote SQL export created before the write. Do not immediately import it as a reflex.

1. inspect `remote-before.json`, `remote-after.json`, and `market-events-sync-result.json`
2. query remote counts, current revisions, trigger count, and legacy marker
3. identify whether the state is unchanged, partially applied, or fully applied but verification failed
4. prefer a forward idempotent correction when safe
5. use the backup/import or D1 Time Travel only after the exact restore point and impact are understood
6. re-run all audits and the production verifier after recovery

Never state that D1 rolled back solely because Wrangler printed an error.
