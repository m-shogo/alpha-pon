# Document Revision / Diff v1

This directory stores local append-only DocumentRevisionRecord and
DocumentDiffRecord JSONL files. Real rows are ignored by Git. Schemas,
validators, synthetic fixtures and this README remain versioned.

## Purpose

Track what changed between official document revisions without overwriting the
original disclosure or treating a raw text diff as an investment conclusion.

Examples:

- corrected earnings release;
- amended statutory filing;
- restated financial statement;
- replaced investigation report;
- withdrawn exchange disclosure;
- updated meeting material.

## Runtime files

```text
research/document_revisions/revisions.jsonl
research/document_revisions/diffs.jsonl
```

Do not commit real document hashes, section maps, extracted values, licensed
content or portfolio data.

## Revision model

Each document revision pins:

- stable `documentId`;
- unique `documentRevisionId`;
- Security Master `entityIds`;
- exact source `evidenceId`;
- source content hash;
- normalized structure hash;
- revision sequence and kind;
- published / observed / retrieved / effective timestamps;
- parser and normalization versions;
- section title/content hashes;
- storage-policy boundary.

Rejected parser/review rows may be retained for audit, but are excluded from
usable revision sequences and governed snapshots.

## Diff model

A diff connects adjacent revision sequences only.

```text
initial sequence 0
-> correction/restatement/amendment sequence 1
-> later revision sequence 2
```

Each change records:

- structured path;
- added / removed / modified / reclassified / moved;
- semantic type;
- informational / material / binding materiality;
- positive / negative / mixed / neutral / unknown direction;
- before/after hashes where applicable;
- exact source Evidence IDs.

No raw licensed text is required in the Git-managed contract.

## Review boundary

- `auto_detected`: machine candidate only;
- `reviewed`: inspected but not Claim-eligible;
- `confirmed`: may produce material/binding Claim inputs;
- `rejected`: retained for audit, excluded from snapshots.

Material or binding changes cannot remain `auto_detected`.
Binding changes require:

- `reviewStatus=confirmed`;
- primary-authoritative or primary-company Evidence;
- Recommendation-eligible Evidence at the same cutoff;
- source Evidence availability before the diff;
- target revision Evidence included in the diff source set.

## PIT rules

Official snapshots use:

- Security Master entities valid at the requested date;
- Bitemporal Evidence `system_replay` at the exact cutoff;
- revision/diff records observed, retrieved and effective by that cutoff;
- full Evidence correction/retraction relations in the snapshot hash.

Future corrections are invisible before publication/retrieval. An old Evidence
Snapshot cannot be used to append a future revision or diff.

## Identity continuity

Inside one `documentId`, usable revisions must keep:

- document type;
- language;
- entity set.

Revision sequences must begin at 0, remain contiguous and have one current
active revision, unless the latest revision is a withdrawal. Diffs must connect
adjacent sequences and match the target revision kind.

## Claim boundary

Only confirmed material/binding changes with eligible Evidence are returned by:

```text
claimEligibleDocumentChangesAtCutoff
```

These are inputs for the Claim / Contradiction Graph. They are not facts by
themselves and do not authorize Recommendation, BUY, target price or order.

## Persistence safety

Use only the authoritative writer:

```text
appendDocumentRevisionDiffRecordsAtCutoffGoverned
```

It validates existing + incoming history inside one owner-token lock, then
writes a cross-file journal:

```text
prepared
revisions_appended
committed
```

It performs append + fsync. If `revisions.jsonl.batch-journal.json` remains, do
not auto-resume or delete it. Inspect both JSONL tails and perform an explicit
versioned repair.

## Validation

```bash
node --import tsx/esm src/research/cli/validate-document-revision-diff.ts
pnpm research:validate
pnpm research:test
pnpm typecheck
pnpm typecheck:tests
```

No local revision record means the contracts can validate, but the milestone
remains unproven.
