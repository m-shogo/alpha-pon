# Research Orphan Human Review — Batch 002 (proposal-only)

Status: `AI_PROPOSAL_ONLY_NOT_CANONICAL`
Base main: `170869bcc9ac60d384f6dec95e64a7a7899c1b12`
Canonical triage authority: `research/orphan_triage/decisions.jsonl`
Canonical decisions written by this batch: **0**

## Purpose

Continue small-batch orphan review preparation without impersonating a human reviewer.

Batch 002 is restricted to documents whose primary purpose is data infrastructure, persistence/learning governance, decision-system governance, provider adaptation, or foundation hardening. None is being promoted into Research Knowledge or resolved automatically.

A proposal is valid only while its listed source blob SHA matches. At actual review time, use the current `candidateKey + candidateFingerprint` from `pnpm research:orphans --json`.

## Batch 002

| # | Candidate key | Source blob SHA | AI proposal | Rationale |
| --- | --- | --- | --- | --- |
| 1 | `unregistered_asset:document:docs/research/pit-price-store.md` | `7e060f2d06aec94756af328b0a71382d35773473` | `infrastructure` | Defines the append-only point-in-time price data substrate, schema/runtime authorities, provider timing fields, and data-boundary guarantees used by studies, recommendations, outcomes, and backtests. |
| 2 | `unregistered_asset:document:docs/research/recommendation-outcome-contract.md` | `f19642d874a2f5f45750b72063a93737a60066d6` | `infrastructure` | Defines governed persistence and authority boundaries for Recommendation → Outcome → Learning, including human decision and shadow-evaluation stages. It is decision/learning governance, not a market Edge. |
| 3 | `unregistered_asset:document:docs/research/stock-pro-council-v2.md` | `9518be2e891702ddcb33c901533ccee8ca8fc4fe` | `infrastructure` | Defines a governed investment-committee contract, jurisdictions, veto/abstention behavior, and calibration boundaries. It is a decision-system design document rather than a reusable market mechanism. |
| 4 | `unregistered_asset:document:docs/research/jquants-free-adapter-next-slice.md` | `4b5160cf0fbee27bd9509131cf20bfb029107cd5` | `infrastructure` | Defines the J-Quants Free `PriceProvider` adapter, entitlement constraints, local-only licensing, PIT behavior, and implementation chain. It explicitly says J-Quants is infrastructure for verification rather than the source of Edge discovery. |
| 5 | `unregistered_asset:document:docs/research/pre-edge-foundation-hardening-review.md` | `43ef4f9a4d272924de47356b28b1424ca79a4b07` | `infrastructure` | Reviews identity, time, evidence, execution, replay, and decision-governance controls required before expanding active Edges. Its findings are foundation hardening requirements, not a market study result. |

## Source evidence summary

### PIT Price Store v1

The source describes an append-only substrate supplying point-in-time-safe security and benchmark prices to Event Study, Recommendation, Quantitative Outcome, and Backtest layers. It distinguishes implementation green from real-market pilot green.

### Recommendation & Outcome Persistence Contract v2

The source deliberately separates Recommendation, quantitative Outcome, semantic review, learning proposal, human learning decision, shadow evaluation, final adoption, and change preparation. It explicitly denies automatic trading, automatic Production promotion, silent Edge Gate mutation, and automatic learned-rule application.

### Stock Pro Council v2

The source is a contract draft for a jurisdictional investment committee. Its core concerns are evidence normalization, veto authority, abstention, calibration, and preventing pseudo-consensus. Those are governance/runtime decision controls.

### J-Quants Free PriceProvider Adapter

The source explicitly states that J-Quants is not the protagonist of Edge discovery; it is a point-in-time verification substrate for price reaction and prediction outcomes. It records provider-plan and licensing boundaries.

### Pre-Edge Foundation Hardening Review

The source reviews the software foundation before expanding active Edges and enumerates controls against PIT leakage, identity collision, price-basis ambiguity, survivorship bias, non-executability, overfitting, and untraceable AI output.

## Human review contract

A human reviewer must independently confirm or reject each `infrastructure` proposal using the current source and current candidate fingerprint.

If a human accepts `infrastructure`, the canonical ledger may acknowledge only that exact fingerprint. If the file changes later, stale re-review must reopen it.

Do not copy this proposal into `research/orphan_triage/decisions.jsonl` while changing only `decisionSource` to `human_review`. Human review requires an actual human judgment and rationale.

## Explicit non-actions

- no canonical ledger append
- no AI-authored `human_review`
- no Research Asset registration
- no ResearchItem / Study / Case / Component / Edge creation
- no Research Relation creation
- no duplicate merge
- no orphan resolution
- no BUY/SELL / Edge Gate / Learning / notification / backtest changes

## Next safe step

Once an actual human review exists for a proposal batch, append only the approved exact-fingerprint decisions in a dedicated small PR and verify that stale/content-changed candidates remain visible.
