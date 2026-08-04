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
- dry-run and apply use separate least-privilege Cloudflare tokens
- workflow inputs are passed through environment variables and validated before shell use
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

### Required GitHub secrets

Repository secret:

```text
CLOUDFLARE_ACCOUNT_ID
```

Dry-run repository secret:

```text
CLOUDFLARE_D1_READ_API_TOKEN
```

This token should be restricted to the Alpha Pon Cloudflare account and D1 read access. It is only used to query the four synchronized tables and the trigger/marker audit state.

Apply secret:

```text
CLOUDFLARE_D1_EDIT_API_TOKEN
```

This token must be restricted to the Alpha Pon Cloudflare account and D1 edit access. Prefer storing it as a secret of the `production` GitHub environment when the current GitHub plan supports environment secrets for this private repository. Otherwise it may be a repository secret with the same exact name; do not upgrade a GitHub plan solely for this workflow.

Never store either token in repository variables, workflow inputs, artifacts, logs, Issues, PR text, screenshots, or chat. Do not reuse the global API key. Rotate and revoke these tokens when no longer needed.

### Production environment

Create or verify the GitHub environment:

```text
production
```

Enable the protection rules available on the repository's current GitHub plan. Do not add billing or upgrade a plan solely to enable a protection rule. The workflow still requires explicit `apply=true` and `confirmation=APPLY` even when reviewer protection is unavailable.

Where available, recommended protection is:

- required reviewer: repository owner or another trusted reviewer
- deployment branches: protected branches only
- prevent self-review when a second trusted reviewer is available

### Input safety

The database workflow input accepts only:

```text
A-Z a-z 0-9 _ -
```

The first character must be alphanumeric and the maximum length is 64 characters. The input is copied into `DATABASE_NAME`, quoted when passed to the CLI, and never interpolated directly into a shell command.

The dry-run job always runs first. The apply job starts only when all of the following are true:

```text
apply = true
confirmation = APPLY
dry-run = success
production environment gate = satisfied when configured
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
