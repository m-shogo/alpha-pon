# Research Orphan Human Review — Batch 005 (proposal-only cohort/calibration components)

Status: `AI_PROPOSAL_ONLY_NOT_CANONICAL`
Base main: `7ac373248b7c0d331a6950640324598abe5c3357`
Canonical triage authority: `research/orphan_triage/decisions.jsonl`
Canonical decisions written by this batch: **0**

## Purpose

Classify the low-ambiguity cohort/calibration documents without turning datasets, monitoring windows, or descriptive calibration into standalone Edges or completed Studies.

The canonical `ResearchComponent` schema explicitly defines a non-Edge component used to prevent Edge proliferation and allows these kinds:

- `cohort`
- `calibration`
- `guard`
- `filter`
- `phase`
- `subsignal`
- `fixture`

Therefore this batch proposes `component_candidate` only where the source itself clearly says it is a validation/seed cohort or a calibration feature for existing research.

A proposal is valid only while the listed source blob SHA matches. At actual human review time, use the current `candidateKey + candidateFingerprint` from `pnpm research:orphans --json`.

## Batch 005

| # | Candidate key | Source blob SHA | AI proposal | Suggested component kind | Rationale |
| --- | --- | --- | --- | --- | --- |
| 1 | `unregistered_asset:document:docs/research/improvement-status-clock-cohort.md` | `69721147af00d26a5c86561685909887dd149892` | `component_candidate` | `cohort` | Explicitly says it is not a separate production Edge and is a calendarable cohort extension of Exchange Sanction Ladder / Remediation Half-Life. The document defines cohort membership, stratification, data fields and forward holdout constraints rather than a completed causal Study. |
| 2 | `unregistered_asset:document:docs/research/special-attention-review-clock-cohort.md` | `3fdfcbe9c387bc802da5ff0eefaa8b08aa3af0bc` | `component_candidate` | `cohort` | Explicitly says `VALIDATION COHORT`, not a signal, and that it exists to test the existing Exchange Sanction Ladder Edge. The reusable object is the PIT-safe cohort/review-clock definition. |
| 3 | `unregistered_asset:document:docs/research/adverse-opinion-live-cohort-snapshot-2026-08-03.md` | `9fea885660909924c603a081fc73853642edfcc6` | `component_candidate` | `cohort` | Explicitly defines a PIT-safe seed cohort for the existing Audit Opinion Recovery Ladder Edge and warns that the cohort itself is not alpha evidence. Its main durable value is cohort/state-history definition plus survivorship guard. |
| 4 | `unregistered_asset:document:docs/research/improvement-status-clock-lag-calibration-2026-08-04.md` | `7f13908eef721ced255865e58492178efdabf56d` | `component_candidate` | `calibration` | Quantifies the observed timing distribution, rejects exact-day scheduling, creates monitoring bands, and explicitly rejects a separate Publication-Lag Edge as duplicate. The durable result is calibration of an existing cohort, not a new Edge. |

## Why these are not proposed as `study_candidate`

A Study should represent a designed empirical test and its result lineage. These four sources are narrower:

- cohort definition / cohort snapshot;
- PIT-safe membership and timing rules;
- monitoring-window calibration;
- forward holdout boundaries.

Some include hypotheses and future event-study plans, but they do not claim that the complete Study contract has been executed or that causal/executable alpha has been established.

Promoting them to Study merely because tables or descriptive statistics appear in the Markdown would collapse `cohort/calibration` into `Study`, despite the ontology explicitly preserving those ResearchComponent kinds.

## Why these are not `new_edge_candidate`

The sources themselves fail that test:

- `improvement-status-clock-cohort.md`: not a separate production Edge yet;
- `special-attention-review-clock-cohort.md`: validation cohort, not a signal;
- `adverse-opinion-live-cohort-snapshot-2026-08-03.md`: cohort is not evidence of alpha;
- `improvement-status-clock-lag-calibration-2026-08-04.md`: explicitly says do not register a separate Publication-Lag Edge because that would duplicate existing hypotheses.

No Edge is created, registered, scored or promoted by this batch.

## Deferred ambiguous cohort

`docs/research/remediation-reverification-recurrence-cohort-2026-08-04.md` is deliberately **not** included here.

Although its filename says cohort, the document opens a distinct research question and a candidate niche Edge (`Remediation Re-Verification Recurrence`). It may ultimately be:

- `component_candidate(kind=cohort)` attached to existing remediation research; or
- `research_item_candidate` for a distinct unresolved question; or
- later, after evidence, an Edge candidate.

That semantic ambiguity is real and should be reviewed separately rather than hidden inside a low-ambiguity cohort batch.

## Human review contract

For each candidate, a human reviewer should decide whether:

1. the cohort/calibration deserves stable reusable `ResearchComponent` identity;
2. it should instead be attached as documentation to an existing Research identity (`existing_research_link_missing`);
3. the document contains enough independent research design/result substance to deserve another classification.

The AI proposal is evidence for review, not the canonical decision.

If a human accepts `component_candidate`, that triage decision still does **not** create a ResearchComponent. Component persistence and relations remain separate explicit Catalog work.

## Explicit non-actions

- no canonical ledger append
- no AI-authored `human_review`
- no ResearchComponent creation
- no ResearchItem / Study / Case / Edge creation
- no Relation creation
- no duplicate merge
- no orphan resolution
- no BUY/SELL / Edge Gate / Learning / notification / backtest changes

## Next safe direction

Review the deferred recurrence cohort together with other documents that contain a distinct research question or candidate mechanism. Treat them as semantic research units first; do not infer `new_edge_candidate` merely from filenames containing `edge` or from the presence of hypotheses.
