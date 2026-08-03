# Market Event Foundation v1 — implementation scope

Status: `IMPLEMENTING_ON_DRAFT_BRANCH`
Date: 2026-08-03 JST
Related: Issue #2, Issue #3

## Slice goal

Create the smallest additive foundation that can represent important market events before Cloudflare resources are provisioned.

This slice must provide:

- stable event, revision, source and delivery contracts;
- deterministic identifiers for idempotent reprocessing;
- append-only revision semantics;
- notification/calendar outbox semantics;
- a D1-compatible SQL schema;
- a local JSONL ledger adapter for development and migration rehearsal;
- contract tests runnable without Cloudflare credentials;
- no changes to production scores, thresholds, notifications or existing databases.

## Out of scope

- Cloudflare account/resource creation;
- D1 production writes;
- R2 uploads;
- Google Calendar OAuth or event creation;
- Pages deployment;
- replacing existing JSONL/SQLite paths;
- automatic investment decisions.

## Initial acceptance

1. Same canonical event facts generate the same `eventId`.
2. A changed event fact generates a new revision while retaining the same event identity.
3. Same channel/event/revision delivery generates the same delivery ID.
4. Unknown event time remains unknown; no invented timestamp.
5. Local ledger rejects malformed records and preserves append-only history.
6. SQL schema can represent event revisions, sources, decision snapshots and delivery outbox.
7. Existing runtime remains untouched.
