# Research Orphan Human Review Runbook v1

Status: `OPERATIONAL_GUIDANCE_NOT_RESEARCH_AUTHORITY`
Base main: `6ff8cdce4f497da655919a0af043967fa80ce9b4`
Canonical review memory: `research/orphan_triage/decisions.jsonl`

## Purpose

Define the safe handoff from proposal-only orphan triage to genuine human review without allowing AI proposals, filenames, stale fingerprints, or batch momentum to become canonical decisions by accident.

This runbook does **not** approve any candidate and does not create a writer that can impersonate human review.

## Authority boundary

Three layers must remain distinct:

1. **Discovery candidate** — deterministic current orphan state from `discoverResearchOrphans()`.
2. **AI proposal** — noncanonical decision support in `docs/operations/research-orphan-triage-batch-*.md`.
3. **Human decision** — append-only canonical memory in `research/orphan_triage/decisions.jsonl`, with `decisionSource: human_review` and the exact current candidate fingerprint.

An AI proposal is never upgraded merely because it passed CI, appears in Coverage Audit, or has existed for a long time.

## Current readiness snapshot

Coverage Audit v1 records 58 Markdown paths in the current discovery surface:

- 56 exact paths have proposal-only review preparation in Batches 001–015;
- 2 are already represented by proven Research Asset + Catalog Relation;
- 0 Markdown paths are uncovered at that snapshot;
- canonical AI-authored human decisions remain 0.

Coverage means **ready to review**, not **reviewed**.

## Review unit

The atomic review unit is one exact pair:

```text
candidateKey + current candidateFingerprint
```

A path, title, filename, batch number or previous fingerprint alone is insufficient canonical identity.

Before every human decision:

1. read current latest `main`;
2. run/read `pnpm research:orphans --json` from that exact revision;
3. locate the exact `candidateKey`;
4. copy the current `candidateFingerprint` only from generated discovery output;
5. re-read the current source content;
6. compare it with the proposal packet and source blob snapshot;
7. if the content materially changed, treat the proposal as stale and review from scratch.

Never reconstruct or guess a candidate fingerprint manually.

## Safe review batch size

Review **5–10 candidates maximum** in one human decision batch.

Why:

- preserves attention on semantic differences;
- makes accidental blanket approval easier to detect;
- keeps rationales candidate-specific;
- limits blast radius if source content changes;
- keeps append-only ledger diffs auditable.

A batch may contain fewer than five candidates when duplicate/Study/Case semantics require deeper judgment.

## Recommended review order

Start with low-ambiguity semantics and move toward identity-merging questions later.

### Phase A — infrastructure acknowledgements

Review Batches 001–003 first.

These are architecture, semantic contracts, adapters, storage/governance infrastructure and protocol documents. Confirm they are genuinely infrastructure rather than semantic Research identities.

### Phase B — reusable non-Edge components

Review Batches 004, 005, 007 and 010.

Typical component kinds:

- `guard`
- `filter`
- `cohort`
- `calibration`
- `fixture`

Confirm that each item is reusable machinery/input and not a completed Study or independent ResearchItem.

### Phase C — exact existing-identity documentation

Review Batch 008 and the existing-link item in Batch 014.

For `existing_research_link_missing`, verify the exact target identity exists **now**. Do not accept a relation merely because titles are similar.

Classification acceptance does not create the Asset or Relation.

### Phase D — Cases and Studies

Review Batches 009, 013 and the Study item from Batch 007.

Case questions:

- is this one bounded real-world episode rather than an issuer identity?
- are dates/event boundaries explicit enough?
- would creating it duplicate an existing Case?

Study questions:

- is this a specific empirical design/execution rather than the parent research question?
- is its mode honestly `exploratory`, `calibration`, `confirmatory`, `holdout`, `out_of_sample` or `revalidation`?
- are sample/result claims no stronger than the source supports?

### Phase E — ResearchItem candidates

Review Batches 006, 012, 013, 014 and 015.

A ResearchItem is appropriate for a durable research identity that may remain unresolved. It does not require Edge-level evidence, confidence or sample completion.

Do not promote to `new_edge_candidate` just because the source filename contains `edge`.

### Phase F — duplicate candidates last

Review Batches 011 and 015 duplicate proposals only after both sides have been re-read from current main.

`duplicate_candidate` means only:

> human review should decide whether two identities/documents represent the same durable semantic research object.

It does **not** authorize:

- deletion;
- merge;
- rename;
- canonical winner selection;
- lineage rewrite;
- evidence reassignment.

Those are separate governed persistence decisions after human review.

## What counts as explicit human approval

A human instruction must clearly identify the candidate(s) and intended classification.

Examples of sufficiently explicit intent:

```text
Batch 001の5件を、現在のmainで再確認した上で、提案どおり infrastructure として承認する。
```

or

```text
この3件だけ承認:
- <candidate key A> -> component_candidate
- <candidate key B> -> research_item_candidate
- <candidate key C> -> not_research
```

A generic instruction such as:

```text
進めて
どんどんやって
全部いい感じにして
```

is **not** sufficient authority to create `decisionSource: human_review` rows.

When batch-level approval is used, the implementation agent must still expand the batch to the exact current candidate keys and fingerprints before appending ledger rows.

## Rationale contract

Every canonical decision requires a candidate-specific nonblank rationale.

Bad rationale:

```text
提案どおり。
```

Better rationale:

```text
The source defines a reusable absence-claim validation guard applied across multiple research lines and explicitly disclaims standalone trading-edge status; classify as component_candidate rather than ResearchItem or Edge.
```

Rationale should state the semantic reason for the classification, not merely repeat the filename or proposal label.

## Append-only ledger procedure

After explicit human approval:

1. re-read latest main;
2. verify open PRs and avoid stacking on a stale base;
3. refresh `pnpm research:orphans --json`;
4. fail if the candidate is absent or fingerprint changed from the reviewed snapshot;
5. prepare one JSONL row per approved candidate;
6. use `decisionSource: human_review` only because a human explicitly approved that candidate/classification;
7. use a unique deterministic-readable `decisionId`;
8. set `reviewedAt` to the actual review instant with an explicit timezone offset;
9. append only — never rewrite previous rows;
10. validate schema and triage history;
11. inspect the derived review manifest;
12. run Draft CI;
13. mark Ready and run full CI;
14. recheck latest main and `behind 0`;
15. squash merge only when exact head CI is green.

If any validation fails, do not partially append or repair history by editing an old decision.

## Stale review behavior

The ledger is fingerprint-bound.

If source content changes after review:

```text
reviewed_current -> review_stale
```

The old decision remains historical provenance. It must not be deleted or silently updated.

The candidate must return to human review with its new fingerprint.

## Classification does not equal persistence

After an approved triage row merges, keep a second gate before creating semantic objects.

Examples:

- `research_item_candidate` does not immediately create a ResearchItem;
- `component_candidate` does not immediately create a ResearchComponent;
- `study_candidate` does not immediately create Study/SampleManifest/StudyResult;
- `case_candidate` does not immediately create a Case;
- `existing_research_link_missing` does not immediately register an Asset or create a Relation;
- `duplicate_candidate` does not immediately merge anything;
- `new_edge_candidate` would not create or promote a Formal Edge.

Persistence should be a separate, small PR with its own schema/semantic validation and exact target checks.

## Actionable versus acknowledged reviews

Current triage semantics distinguish classifications that imply possible follow-up from acknowledgements.

Potentially actionable:

- `existing_research_link_missing`
- `research_item_candidate`
- `component_candidate`
- `study_candidate`
- `new_edge_candidate`
- `case_candidate`
- `duplicate_candidate`

Typically acknowledged/no automatic persistence action:

- `infrastructure`
- `not_research`

Even actionable classification only means **follow-up may be appropriate**; it is not permission to mutate canonical Research entities automatically.

## Fail-closed stop conditions

Stop the review/appending process if any of these is true:

- latest main differs from the reviewed base and the candidate was not rechecked;
- candidate no longer exists;
- candidate fingerprint changed;
- source path/identity is ambiguous;
- proposed existing target no longer exists;
- source blob does not match the proposal snapshot and content has not been re-reviewed;
- duplicate counterpart changed materially;
- triage schema/ledger reports an issue;
- ledger tail is partial;
- `reviewedAt` would be in the future or non-monotonic for the candidate;
- rationale is blank/generic;
- human approval is generic rather than candidate/classification-specific;
- the requested action would implicitly create/merge/promote a Research entity in the same step.

## First recommended human-review slice

The safest first slice is **Batch 001 only (5 infrastructure candidates)** because it has low semantic ambiguity and no downstream Catalog persistence requirement if accepted.

After that, proceed to Batch 002 or 003 rather than jumping immediately to duplicate or Edge-like research candidates.

This recommendation does not constitute approval.

## Explicit non-actions of this runbook

- no canonical ledger append
- no AI-authored human decision
- no automatic review acceptance
- no Research Asset/Catalog persistence
- no Relation/Lineage creation
- no duplicate merge/delete/rename
- no Formal Edge registration/promotion
- no BUY/SELL / position / LINE / Learning / backtest / runtime mutation
