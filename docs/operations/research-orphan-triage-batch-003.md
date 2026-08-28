# Research Orphan Human Review — Batch 003 (proposal-only)

Status: `AI_PROPOSAL_ONLY_NOT_CANONICAL`
Base main: `19afabae8c4ffe5ed5da594cb254a4f73a467a5d`
Canonical triage authority: `research/orphan_triage/decisions.jsonl`
Canonical decisions written by this batch: **0**

## Purpose

Finish the low-ambiguity infrastructure pass before moving into documents that may instead be Research Components, Studies, Cases, or existing-research link gaps.

Only two candidates are included because the remaining `docs/research/**` material becomes materially more ambiguous. A small batch is preferable to forcing a classification merely to reduce the orphan count.

A proposal is valid only while its listed source blob SHA matches. At actual human review time, use the current `candidateKey + candidateFingerprint` from `pnpm research:orphans --json`.

## Batch 003

| # | Candidate key | Source blob SHA | AI proposal | Rationale |
| --- | --- | --- | --- | --- |
| 1 | `unregistered_asset:document:docs/research/data-source-and-technology-edge-foundation.md` | `624bbbc805fec96f0c1072f83c2ff74583bd469b` | `infrastructure` | Defines Data Source adoption states, authority locations, PIT-safe evidence sourcing, licensing/source hierarchy, and the system-level boundary between Discovery and Evidence. It is foundation architecture for research inputs rather than a specific reusable market mechanism. |
| 2 | `unregistered_asset:document:docs/research/information-state-verification-protocol.md` | `2ccf9f11c792f61586ad922128e3030cfefbb205` | `infrastructure` | Declares a current authority applying to all Alpha Pon company-event and trade-timing research, defining mandatory information-state classes, source order, freshness gates, and PIT reconstruction requirements. It is a cross-cutting research safety protocol rather than one Edge or Study. |

## Why Batch 003 stops at two

Several remaining documents have names such as `*-guard.md`, `*-cohort.md`, `*-calibration-*.md`, `*-edge.md`, or issuer/event-specific reports. Under the Research Knowledge Architecture, those names do not determine identity:

- a guard may deserve `component_candidate` rather than `infrastructure`;
- a cohort/calibration document may be a `study_candidate` or supporting Research Component;
- an `*-edge.md` file is not automatically a formal Edge;
- an old report may need `existing_research_link_missing` rather than a new identity;
- apparent duplicates require causal/semantic comparison and human judgment.

Therefore this proposal pass intentionally stops before those categories.

## Source evidence summary

### Data Source & Technology Edge Foundation v1

The source says its purpose is not to attach every available API. It defines a governed adoption boundary based on whether a source improves discrimination or falsification for existing research, separates Discovery from Evidence, and points to canonical Data Source / schema / Edge-family authorities.

### Point-in-Time Information-State Verification Protocol

The source declares itself `CURRENT_AUTHORITY` and applies to all relevant Alpha Pon research. It requires reconstruction of what was knowable at the answer timestamp, separates new facts / prior facts / inference / opinion, mandates source ordering, and fails confident recommendations when the latest official state cannot be verified.

## Human review contract

A human reviewer must independently accept or reject each `infrastructure` proposal using the current source and exact current fingerprint.

Do not copy this proposal into `research/orphan_triage/decisions.jsonl` while simply relabeling it as `human_review`. The canonical rationale must reflect an actual human judgment.

## Explicit non-actions

- no canonical ledger append
- no AI-authored `human_review`
- no Research Asset registration
- no ResearchItem / Study / Case / Component / Edge creation
- no Research Relation creation
- no duplicate merge
- no orphan resolution
- no BUY/SELL / Edge Gate / Learning / notification / backtest changes

## Boundary reached

After this batch, the next safe triage work is not another bulk `infrastructure` pass. It should inspect ambiguous candidates in small groups and propose one of:

- `existing_research_link_missing`
- `component_candidate`
- `study_candidate`
- `research_item_candidate`
- `case_candidate`
- `duplicate_candidate`
- `new_edge_candidate`

without automatically resolving or promoting them.
