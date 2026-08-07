# Alpha Pon Current Roadmap — 2026-08-07

Status: `ACTIVE_CANONICAL_ROADMAP`
Updated: 2026-08-07 JST
Production trading use: `PROHIBITED_UNTIL_VALIDATED`

This file remains the canonical cross-track roadmap despite its historical filename. Older dated roadmaps and handoffs are evidence of prior state, not current authority. When status conflicts, current `main`, Research OS checkpoint/queue, and this roadmap take precedence.

## 1. Product objective

Alpha Pon exists to discover and test investable company hypotheses from world events, structural changes, special situations and company-specific evidence.

The intended chain is:

```text
world / policy / technology / company event
  -> causal theme / bottleneck
  -> candidate company
  -> explicit hypothesis and invalidation
  -> PIT-safe Evidence + prices + benchmarks
  -> historical analog / counterfactual / confounder
  -> executable signal / event study
  -> measured net alpha after costs
  -> governed BUY candidate / WATCH / WAIT / AVOID
  -> immutable answer-check
  -> human-reviewed lessons
  -> better next research rule
```

The system may support a BUY candidate when evidence genuinely supports it, but it is not an automatic-trading system. Brokerage orders require explicit user action and no persisted record grants automatic trading authority.

Every stock conclusion must separate:

```text
new facts
previously known facts
assumptions / inference
forecasts
opinion
```

Never treat conversation memory as the source of truth for current stock facts.

## 2. Current foundation state

### Completed / merged foundations

- Market Event Calendar v1 and public read-only Cloudflare runtime.
- D1 market-event contracts and GET-only public boundary.
- LINE consolidated notification foundation.
- Research OS v1: Registry, Queue, Checkpoint, PIT guards, immutable history, Backtest framework, Net Alpha, Holdout, Decay, Gate, Dashboard and CI.
- Data Source Governance and Technology Edge catalog contracts.
- PIT Price Store v1: append-only issuer / benchmark record contracts, content hashes, revisions, first-executable boundary and validation.
- J-Quants Free PriceProvider implementation and hardening:
  - Free entitlement boundary;
  - conservative 84-day delayed observation boundary;
  - V2 date-cap PIT fix;
  - canonical Price Store schema conformance;
  - default raw-value console redaction;
  - local-only filesystem boundary with 0700/0600 permissions and symlink rejection.
- EDINET v2/foundation implementation has advanced well beyond the old migration placeholder: configured acquisition/review/fidelity/foundation-preview contracts and extensive fixture/structural checks exist on `main`. Real reviewed append remains a separate local/runner gate.
- Bitemporal Evidence / Document Revision / Security Master foundation contracts and reviewed EDINET preview path.
- Recommendation Persistence v1 (#110).
- Recommendation issuer/TOPIX/sector baseline provenance hardening (#111).
- PIT Quantitative Outcome Persistence v1 (#112).
- Evidence-backed Corporate Action Clearance v1 (#113).
- Corporate Action gate for raw/unadjusted quantitative Outcomes (#114).

### Important non-completed boundaries

- Real J-Quants Free edge-case measurement remains local-only:
  - exact intraday delayed availability;
  - rolling two-year boundary behavior;
  - real missing/no-trade/suspension patterns;
  - real code exceptions and entitlement changes.
- Free J-Quants does not supply the benchmark path needed for the full real Foundation pilot; use a separately rights-verified source rather than inventing one.
- A real unadjusted issuer Outcome is blocked until a real Tier A/B evidence-backed CorporateActionClearanceRecord covers the full measurement window.
- Real EDINET reviewed append remains blocked until exact documents are acquired/reviewed in the allowed local/runner path.
- No Edge has Production eligibility. Narrative plausibility does not move Production Gate items.
- Recommendation/Outcome human semantic review is not yet implemented.
- No automatic order placement is authorized.

## 3. Operating priority

Work in this order unless a same-day P0 material-risk event overrides it.

### P0 — Material official-source safety scan

- Prioritize official/public primary sources for misconduct, governance, accounting, sanctions, lawsuits, executive exits, corrections and named-watch transitions.
- Distinguish new facts from previously known facts before stock conclusions.
- Notify only material changes.
- Do not use anonymous/social sentiment as confirmation evidence.

### P1 — Foundation integrity and anti-hindsight controls

Status: `ACTIVE`.

Continue hardening the common data/research foundation before scaling Edge discovery.

Priorities:

1. immutable Evidence / price / benchmark provenance;
2. publication / observation / first-executable boundaries;
3. revision / withdrawal / correction lineage;
4. rights and local-only storage boundaries;
5. corporate-action / benchmark / missing-data fail-closed rules;
6. recommendation / outcome non-rewrite guarantees;
7. explicit human-review boundary before lessons can change research rules.

Do not weaken a fail-closed rule merely to make a real pilot pass.

### P2 — First real Foundation pilot

Status: `IMPLEMENTATION_READY_REAL_INPUTS_PENDING`.

Use one bounded real company/event package to prove that the merged foundation works end-to-end without hindsight.

Required before calling the pilot complete:

- exact reviewed primary-source documents;
- canonical issuer identity;
- PIT-safe issuer price baseline and outcome series;
- rights-verified TOPIX/general benchmark series;
- rights-verified sector benchmark series;
- corporate-action clearance for unadjusted issuer price measurement;
- exact Evidence / revision / price hashes;
- review artifacts that can be replayed independently.

Do not substitute synthetic records for real-pilot completion.

### P3 — Known-Bad Event first evidence package

Status: `ACTIVE_RESEARCH_FOUNDATION_PENDING_REAL_PACKAGE`.

For `known-bad-event-repricing`:

1. reconstruct one calibration timeline from primary/authoritative sources;
2. classify every fact as new / known / assumption / opinion;
3. preserve publication, observation, event and first-executable time separately;
4. add immutable Historical Analogs;
5. add explicit Counterfactual and Confounder records;
6. join PIT issuer/TOPIX/sector series;
7. keep previous-close / next-open / first-executable entry routes separate;
8. leave Production Gate items unknown until real evidence supports movement.

The Edge remains research, not Production.

### P4 — Signal Store and executable event study

Status: `NOT_COMPLETE`.

- Persist signal generation/public observation/first executable timestamps.
- Freeze direction, entry/exit rule, blocking reason, confounders and train/holdout split.
- Measure event windows only when their execution path is reproducible.
- Separate gross return from net alpha.
- Include fees, spread, slippage, liquidity and, when applicable, borrow availability/cost.
- Never silently mix different source/provider series.

### P5 — Recommendation & Outcome learning loop

Status: `QUANTITATIVE_IMPLEMENTED_HUMAN_REVIEW_PENDING`.

Canonical contract: `docs/research/recommendation-outcome-contract.md`.

Merged implementation:

```text
#110 issue-time Recommendation persistence
#111 issuer/TOPIX/sector baseline PIT provenance
#112 quantitative PIT Outcome persistence
#113 Corporate Action Clearance
#114 raw/unadjusted Outcome corporate-action gate
```

Next work:

1. implement separate semantic/human review record;
2. pin Recommendation + Quantitative Outcome hashes;
3. assess invalidation with explicit Evidence refs;
4. persist correct/incorrect assumptions, missing evidence and confounders;
5. persist lessons and proposed rule changes;
6. forbid provisional/AI review from silently mutating production rules;
7. add review-due / expiry orchestration;
8. preserve failed forecasts and weak/rejected Edge evidence.

Quantitative Outcome remains:

```text
reviewStage = quantitative_measurement
invalidationAssessment = not_assessed
verdict = inconclusive
```

until the separate semantic review exists.

### P6 — Research scale-up

Status: `AFTER_FIRST_REAL_FOUNDATION_PACKAGE`.

- Confounder candidate automation.
- Historical Analog backfill.
- Exchange Sanction Ladder overlap decision.
- External Incident Venue negative controls.
- Edge diversity/correlation monitoring.
- Opportunity-cost scoring.
- Automated Decay calculation.
- Heavy archive/backtest runner contracts.

Do not scale data volume before lineage and replayability are proven on one real package.

### P7 — Technology Commercialization Graph

Model:

```text
research -> reproduction -> grant -> patent family -> joint research ->
standardization -> prototype -> customer sample -> certification -> pilot line ->
capex -> long-term supply -> mass production -> revenue/profit
```

Represent beneficiary layers explicitly:

```text
final / platform / tier1 / tier2 / material / equipment /
inspection / infrastructure / service
```

Guiding principle: do not merely pick the hero product; find what must become scarce or indispensable if the system scales.

### P8 — Technology Edge promotion

Lifecycle remains:

```text
catalog -> candidate -> active-research -> shadow -> validated / rejected / dormant
```

No direct catalog -> active-research or catalog -> BUY shortcut.

### P9 — Shadow validation / Production discipline

- Freeze discovery and confirmatory samples.
- Keep untouched Holdout.
- Include realistic costs and execution failure.
- Require issuer/event/year diversity and bounded tail risk.
- Reject weak Edges instead of preserving them narratively.
- Production requires all Gate criteria plus a separate human decision.
- No automatic live trading.

## 4. Data-source status

### J-Quants Free

Implemented adapter; real edge-case measurement pending.

Use for issuer price validation only within verified entitlement and local-only boundaries. Do not infer TOPIX/sector capability that Free does not provide.

### EDINET

Configured acquisition/review/fidelity/foundation-preview contracts are implemented with fail-closed review boundaries. Real reviewed append requires configured credentials/local execution and exact human-reviewed documents.

### Benchmark data

A rights-verified real TOPIX/general benchmark and sector benchmark source remains required before the first real Recommendation/Outcome package can be declared complete.

### Corporate actions

Unadjusted issuer returns require evidence-backed Corporate Action Clearance. Discovery-only evidence cannot establish `clear`.

## 5. Recommendation / Outcome milestones

Completed:

1. `RECOMMENDATION_PERSISTENCE_V1_GREEN` — #110
2. `RECOMMENDATION_BENCHMARK_PROVENANCE_GREEN` — #111
3. `QUANTITATIVE_OUTCOME_PERSISTENCE_V1_GREEN` — #112
4. `CORPORATE_ACTION_CLEARANCE_V1_GREEN` — #113
5. `OUTCOME_CORPORATE_ACTION_GATE_GREEN` — #114

Next:

6. `OUTCOME_SEMANTIC_REVIEW_CONTRACT_GREEN`
7. `OUTCOME_REVIEW_DUE_ORCHESTRATION_GREEN`
8. `FIRST_REAL_RECOMMENDATION_PACKAGE_REPLAYABLE`
9. `FIRST_REAL_OUTCOME_REPLAYABLE`

A milestone is complete only from committed artifacts plus applicable green checks, never from narrative evidence.

## 6. Immediate next queue

1. Semantic/human Outcome Review record that references immutable Recommendation + Quantitative Outcome hashes.
2. Fail-closed review authority: AI/provisional review may propose lessons but cannot mutate production rules or Edge gates automatically.
3. Explicit invalidation Evidence refs and as-of-time checks.
4. Review-due / expiry state derivation without rewriting original Recommendation.
5. Real Foundation pilot preparation that clearly lists which inputs require local credentials or rights-verified benchmark data.
6. Only then broaden Historical Analog / Confounder / Edge discovery volume.

## 7. Scheduling model

Use one bounded research orchestrator rather than one schedule per Edge.

Each cycle:

1. perform bounded P0 official-source scan;
2. read current Research OS checkpoint/queue;
3. advance one highest-value research slice;
4. persist Research Log + checkpoint;
5. when a task requires local credentials/runner/human review, leave an explicit blocker rather than fabricating completion;
6. notify only for material events, decisive falsification, meaningful Gate movement, severe CI/data failure or required human action.

The schedule is an orchestrator, not a substitute for a local shell, Cloudflare Dashboard, real API credentials or human review.
