# Handoff — Document Revision / Diff v1

Status: `IMPLEMENTED_AWAITING_FULL_VALIDATION`
Updated: 2026-08-06 JST
Parent branch: `feat/claim-contradiction-graph-v1`
Branch: `feat/document-revision-diff-v1`

## Purpose

Preserve official document revisions and structured semantic changes without
overwriting the original disclosure, leaking future corrections into historical
research or converting raw text differences directly into investment facts.

## Implemented

- DocumentRevisionRecord schema;
- DocumentDiffRecord schema;
- governed DocumentRevisionDiffSnapshot schema;
- deterministic revision / diff / snapshot hashes;
- document and revision stable IDs;
- source Evidence hash and timestamp linkage;
- section title/content hash maps;
- revision sequence and kind validation;
- added / removed / modified / reclassified / moved changes;
- numeric / text / date / entity / reference / structure / accounting-policy /
  guidance / risk-factor / governance semantic types;
- informational / material / binding materiality;
- auto-detected / reviewed / confirmed / rejected review lifecycle;
- primary-Evidence requirement for binding changes;
- Security Master entity validation;
- Bitemporal Evidence `system_replay` dependency;
- exact PIT cutoff filtering;
- rejected-row audit retention without snapshot promotion;
- document type / language / entity continuity checks;
- adjacent revision diff enforcement;
- append-only row revision chains and terminal-state protection;
- owner-token writer, cross-file transaction journal and fsync;
- local repository scanner and focused CLI;
- synthetic core, PIT, writer, repository, snapshot and integrity fixtures;
- Research OS validation/test integration;
- local-only runtime boundary and README.

## Authoritative APIs

```text
validateDocumentRevisionDiffAtCutoff
buildDocumentRevisionDiffSnapshotAtCutoff
buildGovernedDocumentRevisionDiffSnapshot
claimEligibleDocumentChangesAtCutoff
appendDocumentRevisionDiffRecordsAtCutoffGoverned
validateDocumentRevisionDiffRepository
validateGovernedDocumentRevisionDiffSnapshot
```

Downstream Claim or Decision code must not consume raw parser diffs directly.

## Revision identity

A usable revision pins:

- stable `documentId`;
- unique `documentRevisionId`;
- exact `evidenceId` and source content hash;
- Security Master entity set;
- document type and language;
- revision sequence and revision kind;
- published / observed / retrieved / effective timestamps;
- parser and normalization versions;
- normalized structure hash;
- section title/content hashes;
- storage-policy boundary.

For one document, type, language and entity set cannot silently change between
usable revisions.

## Revision sequence

- initial revision uses sequence 0;
- non-initial revision cannot use sequence 0;
- usable sequences are contiguous;
- each sequence has one logical revision;
- one revision is active, unless the latest revision is a withdrawal;
- a diff connects adjacent sequences only;
- diff kind must equal the target revision kind;
- target revision Evidence must be included in diff source Evidence.

## Rejected rows

Rejected parser/review rows remain append-only audit records. They are still
schema/hash/identity/time validated, but they do not:

- fill a sequence gap;
- become current document revisions;
- appear in governed snapshots;
- produce Claim-eligible changes.

Rejected rows cannot change their parent revision identity, create cycles or
reuse record/hash identities.

## Structured changes

A change records path, change type, semantic type, materiality, direction and
before/after hashes.

Hash rules:

```text
added        -> afterHash only
removed      -> beforeHash only
modified     -> different beforeHash + afterHash
reclassified -> different beforeHash + afterHash
moved        -> beforeHash + afterHash
```

Material/binding changes cannot remain auto-detected. Binding changes require a
confirmed diff and primary-authoritative or primary-company Evidence.

## PIT and Evidence boundary

Historical snapshots use exact `system_replay` Evidence and only revision/diff
records available by the same cutoff.

The governed snapshot pins:

- exact cutoff;
- Document Revision/Diff snapshot hash;
- full Evidence Snapshot hash, including correction/retraction relations;
- exact sorted revision IDs;
- exact sorted diff IDs;
- exact sorted Evidence IDs;
- final deterministic content hash.

Future corrections are invisible before publication/retrieval and cannot be
appended against an older Evidence Snapshot.

## Claim boundary

Only confirmed material/binding changes whose complete source Evidence set is
Recommendation-eligible are returned as Claim candidates.

A confirmed change is not automatically a fact. The Claim / Contradiction Graph
must still classify it as fact, assumption, forecast, opinion or unknown and
attach falsification/contradiction context.

No output from this slice means Recommendation, BUY, target price or order.

## Persistence safety

Runtime files:

```text
research/document_revisions/revisions.jsonl
research/document_revisions/diffs.jsonl
```

The authoritative writer validates existing + incoming history inside one lock
and writes:

```text
prepared
revisions_appended
committed
```

It uses append + fsync. A remaining journal is an explicit operations incident;
do not auto-resume or delete it.

Real document revision/diff rows are ignored by Git.

## Activation gate

`DOCUMENT_REVISION_DIFF_V1_GREEN` remains unproven until:

1. exact latest HEAD passes full typecheck and tests;
2. GitHub Actions executes real runner steps and passes;
3. Security Master and Bitemporal Evidence local pilots are green;
4. at least one real disclosure + correction pair is normalized;
5. before/after cutoff snapshots reproduce expected revision visibility;
6. the same inputs reproduce the same governed snapshot hash;
7. corrected/withdrawn Evidence cannot leak into Claim support;
8. Claim Graph consumes only confirmed governed changes;
9. synthetic changes do not move active Edge or Production Gate state.

Code and synthetic fixtures alone do not mark the milestone green.

## Validation commands

```bash
pnpm typecheck
pnpm typecheck:tests
pnpm research:validate
pnpm research:test
node --import tsx/esm src/research/cli/validate-document-revision-diff.ts
node --import tsx/esm tests/research/document-revision-diff.test.ts
node --import tsx/esm tests/research/document-revision-diff-pit.test.ts
node --import tsx/esm tests/research/document-revision-diff-writer.test.ts
node --import tsx/esm tests/research/document-revision-diff-repository.test.ts
node --import tsx/esm tests/research/document-revision-diff-snapshot.test.ts
node --import tsx/esm tests/research/document-revision-diff-integrity.test.ts
```

These commands are documented but have not been run against the exact latest
HEAD in this session. The isolated clone attempt failed due outbound DNS, and
GitHub Actions has not completed real runner steps.

## Protected boundaries

- no real document content committed to Git;
- no automatic Claim creation;
- no Recommendation / BUY / target-price generation;
- no automatic order placement;
- no active Edge / Production Gate movement;
- no live LINE send;
- no secrets, Cloudflare, D1 or billing changes.

## Next slice

1. Evidence Package manifest pinning Evidence, Claim and Document snapshots;
2. Testable Hypothesis and Scenario records;
3. Decision Firewall integration through immutable hashes only;
4. real pilot using a disclosure/correction pair;
5. structured numeric/table diff expansion after baseline validation.
