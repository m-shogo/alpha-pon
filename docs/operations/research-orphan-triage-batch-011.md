# Research Orphan Human Review — Batch 011 (proposal-only duplicate review)

Status: `AI_PROPOSAL_ONLY_NOT_CANONICAL`
Base main: `08a91dc85b6891ec81e56d66be74b78145420aa0`
Canonical triage authority: `research/orphan_triage/decisions.jsonl`
Canonical decisions written by this batch: **0**

## Purpose

Flag one strong predecessor/successor overlap for human duplicate review without deleting, merging, rewriting or choosing a canonical source automatically.

`duplicate_candidate` means only: two discovered documents appear to represent substantially the same semantic research identity and a human should decide whether they are duplicates, revisions, complementary documents, or separate research objects.

## Batch 011

### Candidate under review

- Candidate key: `unregistered_asset:document:docs/research/remediation-specificity-gap-edge.md`
- Source blob SHA: `0964b27ad80b7b03fbc9a276538566222e9ec4a9`
- AI proposal: `duplicate_candidate`
- Possible counterpart candidate: `unregistered_asset:document:docs/research/remediation-specificity-gap-edge-2026-08-03.md`
- Counterpart blob SHA: `4c2d666c4808ce98800942fffc5bc2867739b4b8`
- Counterpart prior triage proposal: Batch 006 `research_item_candidate`

## Evidence for duplicate review

### 1. Same semantic title

Both documents are titled `Remediation Specificity Gap Edge` and ask whether the specificity/verifiability of a JPX improvement report predicts later remediation quality, governance outcome and market response.

### 2. Creation order is explicit

Repository history shows:

- 2026-08-01: `Add remediation specificity gap edge research` created the undated source;
- 2026-08-03: `Add remediation specificity gap edge hypothesis` created the dated source.

The later file is therefore chronologically capable of being a refinement/rewrite, although chronology alone does not prove supersession.

### 3. Core mechanism overlaps

Both sources separate document quality from generic language sentiment and focus on concrete remediation promises such as:

- named owners;
- deadlines/milestones;
- evidence/verification;
- root-cause/control mapping;
- subsidiary scope;
- independent assurance;
- subsequent observed execution.

The dated source sharpens the same concept into:

`promised_specificity - subsequently_verified_execution`

and explicitly calls the useful feature the content-to-execution divergence.

### 4. Validation design overlaps

Both require:

- PIT-safe official documents;
- improvement report and improvement-status follow-up;
- manual/reproducible labeling before automation;
- controls for distress, report length, correction severity and concurrent events;
- untouched holdout;
- realistic execution costs;
- rejection/merge if incremental information does not survive controls.

### 5. Both deny production authority

Neither source is a production Edge. The undated document says `RESEARCH CANDIDATE, not a trading signal`; the dated source says `IDEA / SHADOW RESEARCH ONLY` and `valid new research candidate but not yet a tradable edge`.

## Why this is not an automatic merge

Meaningful differences remain:

- the undated file has a broader `Remediation Specificity Index` framing;
- the dated file emphasizes `specificity_gap` between promises and later verified execution;
- cohort/examples and exact proposed fields differ;
- neither source contains an explicit `supersedes:` declaration.

A human may reasonably decide that the undated document is a broader parent note and the dated document is a narrower child hypothesis. Therefore this batch proposes only `duplicate_candidate`, not `not_research`, deletion, replacement or automatic consolidation.

## Human review questions

A human reviewer should answer:

1. Do both files represent one durable ResearchItem identity?
2. If yes, which source is the best primary description and which is supporting/history?
3. If no, what exact semantic boundary separates them?
4. Should the broader index become a Component/subsignal while the content-to-execution gap remains the ResearchItem?
5. Is an explicit lineage/supersession relation needed later, rather than deleting historical provenance?

## Explicit non-actions

- no canonical triage ledger append
- no AI-authored `human_review`
- no file deletion or rename
- no duplicate merge
- no canonical winner selection
- no ResearchItem / Component / Study / Case / Edge creation
- no Asset registration or Relation creation
- no orphan resolution
- no BUY/SELL / Edge Gate / Learning / notification / backtest changes

## Next safe direction

Continue classifying independent unresolved research questions as `research_item_candidate`, but keep near-duplicate remediation/audit variants out of bulk batches until their semantic boundary is reviewed explicitly.
