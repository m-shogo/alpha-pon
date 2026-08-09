# Alpha Pon Current Roadmap — 2026-08-09

Status: `ACTIVE_CANONICAL_ROADMAP`
Updated: 2026-08-09 JST
Production trading use: `PROHIBITED_UNTIL_VALIDATED`

This file remains the canonical cross-track roadmap despite its historical filename. Older dated roadmaps and handoffs are evidence of prior state, not current authority. When status conflicts, current `main`, Research OS checkpoint/queue, the latest explicit clean-state handoff, and this roadmap take precedence.

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
  -> governed change proposal / shadow evaluation / human adoption
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

### Completed / merged software foundations

- Market Event Calendar v1 and public read-only Cloudflare runtime.
- D1 market-event contracts and GET-only public boundary.
- LINE consolidated notification foundation.
- Research OS v1: Registry, Queue, Checkpoint, PIT guards, immutable history, Backtest framework, Net Alpha, Holdout, Decay, Gate, Dashboard and CI.
- Data Source Governance and Technology Edge catalog contracts.
- PIT Price Store v1: append-only issuer / benchmark record contracts, content hashes, revisions, first-executable boundary and validation.
- J-Quants Free PriceProvider and local-only retrieval hardening:
  - Free entitlement boundary;
  - conservative delayed-observation boundary;
  - strict date/instant parsing;
  - provider-side query cutoff;
  - canonical Price Store conformance;
  - actual retrieval-completion timestamp boundary;
  - raw-value console redaction;
  - local-only filesystem permissions and link rejection;
  - price-store metadata/read-only audit path.
- Security Master foundation and PIT hardening:
  - historical revision preservation;
  - future-observed revision exclusion from past snapshots;
  - endpoint-integrity sanitization;
  - strict `asOf` date;
  - ticker -> market and provider-code -> provider namespaces;
  - core Security Master suite wired into normal CI aggregation.
- EDINET configured acquisition/review/fidelity/parity/foundation-readiness chain, with local-only real evidence boundary.
- Bitemporal Evidence / Claim Graph / Document Revision / Security Master contracts and governed snapshots.
- Reviewed EDINET Foundation preview and mapping paths with strict explicit-timezone instant boundaries.
- Foundation structural-status, hash-witness, conformance and human replay-proof contracts.
- Foundation Decision integration and direct assessor fail-closed temporal preflight.
- Recommendation Persistence v1 (#110).
- Recommendation issuer/TOPIX/sector baseline provenance hardening (#111).
- PIT Quantitative Outcome Persistence v1 (#112).
- Evidence-backed Corporate Action Clearance v1 (#113).
- Corporate Action gate for raw/unadjusted quantitative Outcomes (#114).
- Governed Semantic Outcome Review v1 (#116).
- Deterministic Outcome Review Due orchestration v1 (#117).
- Governed Outcome Learning Proposal v1 (#118/#119).
- Governed Human Learning Decision v1 (#120/#124).
- Governed Shadow Evaluation v1 (#121).
- Final Human Adoption Decision v1 (#122).
- Governed Change Preparation Manifest v1 (#123).
- Deterministic Learning Status read model v1 (#125).
- Subsequent PIT/strict-instant hardening for Recommendation, Outcome, Semantic Review, Review Due and learning-chain boundaries.

### Important non-completed real boundaries

- First real Sanrio/Foundation package is not complete. GitHub/CI fixtures cannot satisfy it.
- Real J-Quants Free edge-case measurement remains local-only:
  - exact delayed availability behavior;
  - rolling historical boundary behavior;
  - real missing/no-trade/suspension patterns;
  - real code exceptions and entitlement changes.
- Free J-Quants does not by itself establish the rights-verified TOPIX/general and sector benchmark path needed for the complete real Foundation pilot.
- A real unadjusted issuer Outcome is blocked until a real Tier A/B evidence-backed Corporate Action Clearance covers the full measurement window.
- Real EDINET reviewed progression remains local-only and human-reviewed; no GitHub fixture may substitute for it.
- First real Recommendation -> Quantitative Outcome -> Semantic Review cycle is pending real Foundation inputs.
- First real Learning Proposal -> Human Decision -> Shadow -> Adoption -> Change Preparation cycle is pending real upstream records and human actions.
- No Edge has Production eligibility merely because software contracts are green.
- No automatic order placement, proof promotion, Edge promotion or learned-rule mutation is authorized.

## 3. Operating priority

Work in this order unless a same-day P0 material-risk event overrides it.

### P0 — Material official-source safety scan

Status: `ONGOING_BOUNDED`.

- Prioritize official/public primary sources for misconduct, governance, accounting, sanctions, lawsuits, executive exits, corrections and named-watch transitions.
- Distinguish new facts from previously known facts before stock conclusions.
- Notify only material changes.
- Do not use anonymous/social sentiment as confirmation evidence.

### P1 — Foundation integrity and anti-hindsight controls

Status: `SOFTWARE_GREEN_FOR_MEASURED_DEFECTS_REAL_INPUTS_PENDING`.

The common foundation has been hardened through the concrete defects reproduced to date. The current rule is **not** to keep creating synthetic governance slices merely because more code can be changed.

Continue GitHub-side hardening only when one of these is measured:

1. a reproducible fail-open / identity / provenance / PIT defect;
2. a CI/runtime regression;
3. local preflight/readiness output exposing a concrete validator or read-only operability gap;
4. real price/benchmark/corporate-action measurement exposing a contract mismatch.

Do not mechanically replace remaining `Date.parse` calls when participating inputs are already schema/strict-parser validated. Do not weaken a fail-closed rule merely to make a real pilot pass.

Current clean-state authority:

`docs/handoffs/2026-08-09-foundation-local-gate-clean-state.md`

### P2 — First real Foundation pilot

Status: `IMPLEMENTATION_READY_REAL_LOCAL_INPUTS_PENDING`.

Canonical local resume from repo root:

```bash
bash scripts/run-sanrio-real-pilot-preflight-local.sh
```

Operating rule:

1. treat preflight output as the authoritative local stage;
2. execute only the printed `nextCommand`;
3. rerun preflight after every successful stage;
4. never guess timestamped artifact paths;
5. preserve integrity failures rather than editing/copying evidence to make lineage pass;
6. stop mutating progression at `parity_complete_foundation_gate_pending`;
7. at that stage only the printed read-only Foundation readiness/remediation path is allowed.

Required before calling the real pilot complete:

- exact human-reviewed primary-source documents;
- governed issuer/listed-security identity at the correct PIT cutoff;
- explicit Evidence / Document Revision / correction lineage;
- PIT-safe issuer price baseline and outcome series;
- rights-verified TOPIX/general benchmark series;
- rights-verified sector benchmark series;
- corporate-action clearance for unadjusted issuer measurement;
- exact Evidence / revision / price / benchmark hashes;
- deterministic replay artifacts and human replay confirmation;
- independently replayable review lineage.

Do not substitute synthetic records for real-pilot completion.

### P3 — First real Recommendation / Outcome / Semantic Review cycle

Status: `SOFTWARE_IMPLEMENTED_REAL_FOUNDATION_PACKAGE_PENDING`.

The old software TODOs for Semantic Review, review-due orchestration and governed learning are complete. The next material milestone is a real cycle:

```text
real Foundation package
  -> issue-time Recommendation
  -> PIT Quantitative Outcome
  -> governed Semantic Outcome Review
  -> current Review Due state
```

Requirements:

- all Recommendation and Outcome hashes must pin the actual real Foundation/price objects;
- no post-cutoff Evidence;
- corporate-action clearance must cover the measured window when using raw issuer prices;
- invalidation and lessons must reference explicit Evidence;
- AI/provisional semantic review remains proposal-only;
- no original Recommendation or Outcome record may be rewritten by later knowledge.

### P4 — First real governed learning cycle

Status: `SOFTWARE_IMPLEMENTED_REAL_HUMAN_CYCLE_PENDING`.

After one real human-confirmed Semantic Review:

```text
Semantic Review
  -> Learning Proposal
  -> Human Learning Decision
  -> independent Shadow Evaluation
  -> Final Human Adoption Decision
  -> Change Preparation Manifest
  -> manual PR for human review
```

This chain is implemented through #125. The next work is **not** another lifecycle layer. It is the first real governed cycle and, only if supported by the evidence, the first real manually reviewed change PR.

No stage authorizes automatic code/rule/Gate mutation or trading.

### P5 — Known-Bad Event first real evidence package

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

### P6 — Signal Store and executable event study

Status: `NOT_COMPLETE_AFTER_REAL_PACKAGE`.

- Persist signal generation/public observation/first executable timestamps.
- Freeze direction, entry/exit rule, blocking reason, confounders and train/holdout split.
- Measure event windows only when their execution path is reproducible.
- Separate gross return from net alpha.
- Include fees, spread, slippage, liquidity and, when applicable, borrow availability/cost.
- Never silently mix different source/provider series.

Do not let Signal Store work bypass the real Foundation package dependency.

### P7 — Research scale-up

Status: `AFTER_FIRST_REAL_FOUNDATION_AND_OUTCOME_CYCLE`.

- Confounder candidate automation.
- Historical Analog backfill.
- Exchange Sanction Ladder overlap decision.
- External Incident Venue negative controls.
- Edge diversity/correlation monitoring.
- Opportunity-cost scoring.
- Automated Decay calculation.
- Heavy archive/backtest runner contracts.

Do not scale data volume before lineage and replayability are proven on one real package.

### P8 — Technology Commercialization Graph

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

### P9 — Technology Edge / Production discipline

Technology Edge lifecycle remains:

```text
catalog -> candidate -> active-research -> shadow -> validated / rejected / dormant
```

No direct catalog -> active-research, catalog -> BUY, or software-green -> Production shortcut.

Production discipline:

- freeze discovery and confirmatory samples;
- keep untouched Holdout;
- include realistic costs and execution failure;
- require issuer/event/year diversity and bounded tail risk;
- reject weak Edges instead of preserving them narratively;
- Production requires all Gate criteria plus a separate human decision;
- no automatic live trading.

## 4. Data-source status

### J-Quants Free

Implemented adapter and software hardening; real edge-case measurement pending.

Use for issuer-price validation only within verified entitlement and local-only boundaries. Do not infer TOPIX/sector capability that Free does not establish.

### EDINET

Configured acquisition/review/fidelity/parity/readiness contracts are implemented with fail-closed review boundaries. Real evidence remains local-only and human-reviewed. The preflight `nextCommand` is authoritative for progression.

### Benchmark data

A rights-verified real TOPIX/general benchmark and sector benchmark source remains required before the first real Recommendation/Outcome package can be declared complete.

Do not manufacture benchmark completeness from an unrelated or unverified provider series.

### Corporate actions

Unadjusted issuer returns require evidence-backed Corporate Action Clearance. Discovery-only evidence cannot establish `clear`.

## 5. Recommendation / Outcome / Learning milestones

Software milestones completed:

1. `RECOMMENDATION_PERSISTENCE_V1_GREEN` — #110
2. `RECOMMENDATION_BENCHMARK_PROVENANCE_GREEN` — #111
3. `QUANTITATIVE_OUTCOME_PERSISTENCE_V1_GREEN` — #112
4. `CORPORATE_ACTION_CLEARANCE_V1_GREEN` — #113
5. `OUTCOME_CORPORATE_ACTION_GATE_GREEN` — #114
6. `OUTCOME_SEMANTIC_REVIEW_CONTRACT_GREEN` — #116
7. `OUTCOME_REVIEW_DUE_ORCHESTRATION_GREEN` — #117
8. governed Learning Proposal — #118/#119
9. governed Human Learning Decision — #120/#124
10. governed Shadow Evaluation — #121
11. Final Human Adoption Decision — #122
12. governed Change Preparation Manifest — #123
13. deterministic Learning Status read model — #125

Real milestones still pending:

14. `FIRST_REAL_FOUNDATION_PACKAGE_REPLAYABLE`
15. `FIRST_REAL_RECOMMENDATION_PACKAGE_REPLAYABLE`
16. `FIRST_REAL_OUTCOME_REPLAYABLE`
17. `FIRST_REAL_HUMAN_SEMANTIC_REVIEW_COMPLETE`
18. `FIRST_REAL_GOVERNED_LEARNING_CYCLE_COMPLETE`
19. `FIRST_REAL_GOVERNED_CHANGE_PR_REVIEWED`

A milestone is complete only from committed or deliberately local-only governed artifacts plus applicable green checks and required human confirmation, never from narrative evidence.

## 6. Immediate next queue

1. **Local Sanrio real-pilot preflight** using `bash scripts/run-sanrio-real-pilot-preflight-local.sh`; follow only its printed `nextCommand`.
2. **Complete the read-only Foundation readiness/remediation measurement** only when parity is actually complete locally; do not synthesize missing fields.
3. **Resolve rights-verified real benchmark inputs and real Corporate Action evidence** required by the first quantitative package.
4. **Produce the first real Foundation package** with replayable identity/Evidence/revision/price hashes.
5. **Run the first real Recommendation -> Quantitative Outcome -> human Semantic Review cycle.**
6. **Run the first real governed learning cycle** through Change Preparation only if the human review and independent shadow evidence support it.
7. **Prepare the first governed manual PR** from a validated ready change manifest; no automatic apply.
8. Only after those real cycles, broaden Historical Analog / Confounder / Edge discovery volume and Signal Store/event-study scale.

GitHub-only work should not invent completion for items 1-7. When local credentials, real licensed data or human review are required, preserve the blocker explicitly and advance another genuinely independent task instead of fabricating evidence.

## 7. Scheduling model

Use one bounded research orchestrator rather than one schedule per Edge.

Each cycle:

1. perform bounded P0 official-source scan;
2. read current Research OS checkpoint/queue;
3. advance one highest-value unblocked research slice;
4. persist Research Log + checkpoint;
5. when a task requires local credentials/runner/human review, leave an explicit blocker rather than fabricating completion;
6. notify only for material events, decisive falsification, meaningful Gate movement, severe CI/data failure or required human action.

The schedule is an orchestrator, not a substitute for a local shell, Cloudflare Dashboard, real API credentials or human review.

## 8. Explicit anti-duplication rule

Before implementing a roadmap item, search current `main`, recent merged PRs and the canonical contracts. If a lifecycle/validator already exists, do not create a second implementation merely because this historical-filename roadmap once listed it as pending.

In particular, do not recreate:

- Semantic Outcome Review;
- Review Due orchestration;
- Learning Proposal;
- Human Learning Decision;
- Shadow Evaluation;
- Final Human Adoption Decision;
- Change Preparation Manifest;
- Learning Status read model;
- the recent Foundation strict-instant/direct-API hardening chain.

Improve those areas only for a measured defect or a requirement revealed by the first real governed cycles.