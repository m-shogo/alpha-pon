# Research Orphan Human Review — Batch 006 (proposal-only research items)

Status: `AI_PROPOSAL_ONLY_NOT_CANONICAL`
Base main: `9d4c37de7caa3ad4a67b195b0e3d107f0a8b4f39`
Canonical triage authority: `research/orphan_triage/decisions.jsonl`
Canonical decisions written by this batch: **0**

## Purpose

Give stable review candidates to early, distinct research questions without prematurely declaring them formal Edges.

The canonical ResearchItem contract is intentionally designed for this boundary: it is an early-to-resolved research identity and does not require formal Edge fields. A ResearchItem may later resolve to `existing_edge`, `component_candidate`, `new_edge_candidate`, `case_only`, `duplicate`, `insufficient_evidence`, or other terminal/continuation states.

Therefore documents that introduce a distinct unresolved research question, mechanism or candidate signal but explicitly say alpha/promotion is unproven are proposed as `research_item_candidate`, not `new_edge_candidate`.

A proposal is valid only while the listed source blob SHA matches. At actual human review time, use the current `candidateKey + candidateFingerprint` from `pnpm research:orphans --json`.

## Batch 006

| # | Candidate key | Source blob SHA | AI proposal | Rationale |
| --- | --- | --- | --- | --- |
| 1 | `unregistered_asset:document:docs/research/remediation-reverification-recurrence-cohort-2026-08-04.md` | `388023ddda95371f73701a7c20881e79ac1fd78b` | `research_item_candidate` | Despite `cohort` in the filename, the document asks a distinct question about second/later remediation verification, develops competing hypotheses and a niche Edge candidate, and explicitly says evidence is insufficient for standalone promotion. This is broader than a reusable cohort component but earlier than an Edge. |
| 2 | `unregistered_asset:document:docs/research/remediation-specificity-gap-edge-2026-08-03.md` | `4c2d666c4808ce98800942fffc5bc2867739b4b8` | `research_item_candidate` | Explicit `IDEA / SHADOW RESEARCH ONLY`; asks whether remediation-plan specificity and later verified execution add information beyond existing clock research. It calls itself a valid new research candidate but not a tradable Edge and may ultimately merge back into existing remediation research. |
| 3 | `unregistered_asset:document:docs/research/edge-improvement-report-content-delta-2026-08-04.md` | `e3a4b24e4518622e33da1eaefe6c50cac378158d` | `research_item_candidate` | Defines a distinct content-delta hypothesis and event-study contract but states market/execution data have not yet been joined and calls itself a research candidate, not a production Edge. The unresolved semantic research unit should exist before any Edge decision. |
| 4 | `unregistered_asset:document:docs/research/edge-organizational-breadth-escalation-2026-08-04.md` | `a30312f1c616c8b74352680eb9903c069c883582` | `research_item_candidate` | Explicit `IDEA / pre-registration`; asks whether organizational breadth predicts regulatory escalation beyond monetary magnitude. It says this is not a directional trade rule and current evidence is only plausibility, making ResearchItem the conservative identity. |
| 5 | `unregistered_asset:document:docs/research/improvement-report-submission-timing-edge-2026-08-04.md` | `29ef26ee581991b6c6f0d91dbf638dbf80bea811` | `research_item_candidate` | Explicit `SHADOW_RESEARCH / CLASSIFICATION_CANDIDATE`; investigates deadline slack as a remediation-readiness feature and says the likely value is classification/tail-risk ranking rather than standalone event-date alpha. |

## Why not `new_edge_candidate` yet

A filename containing `edge` is not Edge authority. These sources all contain one or more of the following:

- `IDEA`, `SHADOW_RESEARCH`, `pre-registration`, or `CLASSIFICATION_CANDIDATE` status;
- explicit statement that directional alpha is unproven;
- requirement to collect more historical observations;
- requirement to freeze holdout before tuning;
- requirement to test costs, liquidity, borrow or confounders;
- explicit possibility that the candidate should be merged into an existing research line.

The ResearchItem layer exists precisely so Alpha Pon can remember these questions without polluting the Edge Registry.

A later human/governed resolution may choose `new_edge_candidate`, but this batch does not make that decision.

## Why not `component_candidate`

These five sources are not merely reusable filters, cohorts or calibration constants. Each centers on an unresolved semantic question/mechanism:

- re-verification recurrence;
- remediation specificity-to-execution gap;
- remediation content delta;
- organizational breadth as an escalation feature;
- submission timing as a remediation-readiness feature.

Some may ultimately resolve to a Component/subsignal of an existing Edge. That is a valid ResearchItem resolution, but it should be decided after the research question is tracked explicitly rather than assumed from the document name.

## Why not `study_candidate`

The documents describe intended designs, hypotheses and future tests, but the durable object here is the **research question/mechanism**, not one specific execution of a study.

A Study should be created separately when a concrete design/run is identifiable (for example a pilot coding exercise, a locked calibration run, a holdout evaluation, or an event study with explicit population/metrics/cutoff).

This prevents the common failure mode where every evolving research note becomes both the research identity and the empirical study result.

## Human review contract

For each candidate, a human reviewer should decide whether:

1. it deserves a ResearchItem identity;
2. it is actually documentation for an existing ResearchItem/Edge and only needs a relation;
3. it is narrow enough to be a ResearchComponent instead;
4. it is duplicate/superseded/insufficient and should be resolved without new identity;
5. after stronger evidence, it should later resolve toward `new_edge_candidate`.

The AI proposal must not canonically choose among those outcomes.

If a human accepts `research_item_candidate`, that triage decision still does **not** create the ResearchItem. Catalog persistence remains a separate explicit action.

## Explicit non-actions

- no canonical ledger append
- no AI-authored `human_review`
- no ResearchItem persistence
- no ResearchComponent / Study / Case / Edge creation
- no Relation creation
- no duplicate merge
- no orphan resolution
- no BUY/SELL / Edge Gate / Learning / notification / backtest changes

## Next safe direction

Review concrete pilot/event-study execution documents separately as `study_candidate` proposals. Do not merge a study run into its parent ResearchItem identity. Then inspect issuer/event-specific documents as possible `case_candidate` records and registered-but-unlinked assets as deterministic `existing_research_link_missing` work.
