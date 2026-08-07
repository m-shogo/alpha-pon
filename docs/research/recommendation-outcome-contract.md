# Recommendation & Outcome Persistence Contract v1

Status: `IMPLEMENTED_QUANTITATIVE_HUMAN_REVIEW_PENDING`
Updated: 2026-08-07 JST
Depends on: [PIT Price Store v1](pit-price-store.md), Research OS Registry / Backtest / Gate

## 1. Purpose

Alpha Pon may support real investment decisions with BUY candidate / WATCH / WAIT / AVOID calls when evidence genuinely supports them. It is not an automatic-trading system: no brokerage order is authorized by this contract.

Every recommendation must freeze its issue-time conditions, preserve later revisions without rewriting history, and be answer-checked later from point-in-time-safe evidence and price records.

The contract forbids:

- groundless certainty;
- stale facts presented as current facts;
- SNS/anonymous-information-only BUY decisions;
- fabricated confidence, probabilities, ranges or targets;
- mixing information discovered after `informationCutoff` into the original judgment;
- retroactive edits to issued forecasts;
- deletion of failed forecasts or weak Edges;
- BUY from catalog-only Edges;
- hindsight selection of issuer/TOPIX/sector baseline prices;
- fabricated quantitative Outcome values;
- interpreting an unadjusted stock split as a real crash/rally.

## 2. Implemented chain

```text
#110 Recommendation Persistence v1
#111 Recommendation benchmark PIT provenance hardening
#112 Quantitative Outcome Persistence v1
#113 Evidence-backed Corporate Action Clearance v1
#114 Corporate Action gate for raw/unadjusted quantitative Outcomes
```

All five slices were merged only after their applicable checks were green.

Implementation is intentionally split into two layers:

```text
issue-time RecommendationRecord
  -> PIT quantitative Outcome
  -> human / semantic review (NOT YET IMPLEMENTED)
```

The quantitative layer must never invent the human verdict.

## 3. Evidence separation

Every RecommendationRecord persists these buckets separately:

```text
newFacts
knownFacts
assumptions
forecasts
opinions
```

The same statement cannot be stored in multiple buckets.

Evidence tiers usable by RecommendationRecord:

```text
Tier A  IR / TDnet / EDINET / JPX / government / audit / statutory material
Tier B  official/objective exchange, flow, POS, reservation, traffic, demand/supply or capex data
Tier C  confirmed company official SNS/video/presentation supplements
Tier D  general reporting / technical or industry explanation
Discovery only  anonymous/general SNS, boards, rumors, influencer recommendations
```

Discovery-only sources cannot enter `sourceEvidence`. A BUY still requires an eligible Edge and cannot be supported by a catalog-only Edge.

## 4. RecommendationRecord — implemented

Canonical schema:

`research/schemas/recommendation-record.schema.json`

Implementation:

`src/research/recommendation-persistence.ts`

The record freezes:

- `recommendationId`
- `issuedAt`
- `informationCutoff`
- issuer identity
- current price plus exact PIT Price Store hash and first-executable timestamp
- decision
- buy/target ranges and explicit basis refs when present
- time horizon
- confidence and explicit basis refs when present
- bull/base/bear scenarios
- scenario probabilities and explicit basis refs when present
- catalysts / risks / confirmation / invalidation / exit conditions
- separated evidence summary
- canonical evidence refs and tiers
- Edge IDs
- TOPIX/benchmark identity plus exact PIT baseline hash/executable timestamp
- sector benchmark identity plus exact PIT baseline hash/executable timestamp
- outcome review date
- status
- revision lineage
- deterministic SHA-256 `contentHash`
- `automaticTradingAuthorized=false`

### Recommendation invariants

- `informationCutoff <= issuedAt`.
- Every evidence ref must resolve to canonical tier/time metadata; evidence observed after cutoff is rejected.
- Secret/token-looking source refs are rejected.
- Issuer current price must resolve to a canonical traded PIT Price Store record.
- Issuer, TOPIX and sector baseline record hashes are recomputed from the record contents, not trusted by string alone.
- Baseline price records must be observed by cutoff and executable by issue time.
- Unknown price license is rejected.
- BUY requires at least one Edge in `active-research`, `shadow` or `validated`.
- `buyRange`, `targetRange`, `confidence` and `scenarioProbabilities` require explicit basis refs when present.
- Scenario probabilities sum to 1.
- A root Recommendation starts `status=open`.
- Revisions use `supersedesId`, must move forward in time and may not fork.
- Rejected append leaves prior JSONL unchanged.

## 5. Quantitative Outcome — implemented

Canonical schema:

`research/schemas/quantitative-outcome-record.schema.json`

Implementation:

`src/research/quantitative-outcome.ts`

Measurement method:

```text
pit-close-common-date-v1
```

Return basis:

```text
unadjusted-close-price-return-corporate-action-cleared-v1
```

### Baseline rules

Outcome uses only the exact RecommendationRecord baseline hashes for:

- issuer;
- TOPIX/general benchmark;
- sector benchmark.

All three baseline trading dates must be the same. This prevents hindsight or date-misaligned excess-return measurement.

### Post-issue price eligibility

For each series, measurement rows must:

- belong to the same series/source/provider plan as the baseline;
- have `tradingDate > baselineTradingDate`;
- have `firstExecutableAt > recommendation.issuedAt`;
- have `firstExecutableAt <= reviewedAt`;
- have `observedAt <= reviewedAt`;
- be traded OHLC records with valid content hashes and known license.

If revisions exist for one trading date, v1 uses the latest revision that was actually observable by review time.

The terminal comparison date is the latest trading date common to issuer, TOPIX and sector series. An issuer-only later row cannot extend the comparison horizon.

### Quantitative metrics

All returns are decimal returns.

- `maxReturn`: maximum issuer close-to-baseline-close return.
- `maxDrawdown`: running-peak-to-later-close drawdown, baseline close as initial peak candidate.
- `terminalReturn`: issuer terminal close / issuer baseline close - 1.
- `benchmarkReturn`: TOPIX/common-benchmark terminal return.
- `sectorBenchmarkReturn`: sector terminal return.
- `benchmarkExcessReturn`: issuer terminal return minus benchmark return.
- `sectorBenchmarkExcessReturn`: issuer terminal return minus sector return.

The method is deliberately close-to-close. Daily OHLC does not prove whether high occurred before low, so v1 does not invent intraday path ordering.

### Target assessment

If no target range exists:

```text
targetAssessment = not_applicable
```

If a target exists, v1 marks it reached on the first measured trading date whose close is at or above the lower edge of `targetRange`.

Intraday-high target logic requires a separately versioned method.

### Corporate Action gate

Because current J-Quants Free v1 stores unadjusted issuer prices, a raw quantitative Outcome requires an immutable CorporateActionClearanceRecord hash.

Canonical clearance schema:

`research/schemas/corporate-action-clearance.schema.json`

Implementation:

`src/research/corporate-action-clearance.ts`

The referenced clearance must:

- recompute to its stored hash;
- have `status=clear`;
- match issuer code/market/source/providerPlan;
- cover baseline through terminal trading date;
- be assessed no later than Outcome `reviewedAt`.

The issuer price path itself must remain:

```text
adjusted = false
adjustmentFactor = 1
corporateActions = []
```

If adjusted/raw records are mixed or an action is detected, this v1 method refuses the calculation rather than guessing an adjustment.

A real J-Quants Free Outcome remains fail-closed until a real Tier A/B evidence-backed clearance exists. Never fabricate `clear` merely to unblock Outcome generation.

### Price return, not total return

Current quantitative metrics are price returns. Cash dividends or other distributions are not added to the numerator.

Do not describe v1 metrics as dividend-inclusive total shareholder return.

## 6. Quantitative Outcome immutability

Each quantitative Outcome persists:

- Outcome ID;
- Recommendation ID + content hash;
- reviewedAt / measurementCutoff;
- measurement method / return basis;
- Corporate Action Clearance hash;
- issuer/TOPIX/sector baseline hashes;
- issuer/TOPIX/sector terminal hashes;
- complete selected measurement hash paths;
- baseline/terminal trading dates;
- all computed metrics;
- deterministic content hash.

The validator rebuilds the expected Outcome from Recommendation + PIT prices + clearance. Re-hashing manually altered return numbers does not make them valid.

Quantitative revisions are append-only:

- one root Outcome per Recommendation;
- linear `supersedesOutcomeId` chain;
- no forks;
- `reviewedAt` strictly increases;
- terminal date cannot regress;
- once target is reached, later quantitative revisions cannot revert it.

## 7. Human / semantic review — NOT YET IMPLEMENTED

The quantitative record intentionally fixes:

```text
reviewStage = quantitative_measurement
invalidationAssessment = not_assessed
verdict = inconclusive
```

These fields remain empty at the quantitative stage:

- correctAssumptions
- incorrectAssumptions
- missingEvidence
- unexpectedConfounders
- lessons
- nextRuleChanges

A future human/semantic review layer must reference immutable Recommendation and Quantitative Outcome hashes. It may evaluate:

- whether an invalidation rule actually fired;
- whether the thesis was correct / partly correct / incorrect / inconclusive;
- which assumptions held or failed;
- missing evidence and confounders;
- lessons and proposed rule changes.

It must append a new governed record rather than rewriting the quantitative history, and it must not grant automatic rule-change or trading authority.

## 8. Safety boundary

The persistence system does not authorize:

- brokerage orders;
- automatic trading;
- automatic position sizing;
- real LINE BUY delivery by itself;
- silent promotion of an Edge to Production;
- automatic model/rule changes from Outcome lessons.

`automaticTradingAuthorized=false` is structurally fixed in persisted records.

## 9. Current Definition of Done

- [x] Recommendation schema + validator — #110
- [x] Recommendation append-only writer + linear revision validation — #110
- [x] evidence separation / tier enforcement / post-cutoff rejection — #110
- [x] catalog-only BUY rejection — #110
- [x] issuer PIT baseline pin — #110
- [x] TOPIX / sector PIT baseline pins — #111
- [x] pinned Price Store record content-hash recomputation — #111
- [x] PIT quantitative maxReturn / maxDrawdown / terminal/excess returns — #112
- [x] common terminal-date alignment — #112
- [x] quantitative Outcome append-only revision model — #112
- [x] evidence-backed Corporate Action Clearance store — #113
- [x] raw Outcome Corporate Action gate — #114
- [x] synthetic recomputation / tamper / append-only tests
- [ ] semantic invalidation assessment
- [ ] final human-reviewed verdict record
- [ ] explicit expiry/review-due orchestration
- [ ] failed forecast / weak Edge learning integration without automatic rule mutation
- [ ] first real Recommendation/Outcome pilot after all required real Foundation data is available
