# Handoff — Quantitative Outcome Persistence v1

Status: `IMPLEMENTED_AWAITING_CI`
Updated: 2026-08-07 JST
Depends on: Recommendation Persistence v1 (#110), benchmark provenance hardening (#111)

## Purpose

Add the first objective answer-check stage for persisted recommendations.

This stage computes only values that can be reproduced from the PIT Price Store. It deliberately does **not** decide whether a semantic invalidation rule fired or whether the original thesis was ultimately correct.

## Measurement method

`measurementMethod = pit-close-common-date-v1`

- issue-time issuer/TOPIX/sector baseline records come only from RecommendationRecord hash pins;
- issuer/TOPIX/sector baseline `tradingDate` must be identical;
- all three baseline hashes are recomputed from record content before use;
- future measurement rows must use the same series identity, source and provider plan as their corresponding baseline;
- only rows with `tradingDate > baselineTradingDate` are outcomes;
- only rows whose `firstExecutableAt > recommendation.issuedAt` and `firstExecutableAt <= reviewedAt` are eligible;
- revisions are resolved per trading date by the latest `observedAt` available at review time;
- terminal comparison date is the **latest common trading date** present in issuer, TOPIX and sector series;
- issuer-only extra dates after that common terminal date are not used.

## Metric definitions

All returns are decimal returns, not percentages.

- `maxReturn`: maximum issuer close-to-baseline-close return through the common terminal date;
- `maxDrawdown`: standard running-peak to later-close drawdown using close prices, with the issue baseline close as the initial peak candidate;
- `terminalReturn`: issuer common-terminal close / issuer baseline close - 1;
- `benchmarkReturn`: TOPIX common-terminal close / TOPIX baseline close - 1;
- `sectorBenchmarkReturn`: sector common-terminal close / sector baseline close - 1;
- `benchmarkExcessReturn = terminalReturn - benchmarkReturn`;
- `sectorBenchmarkExcessReturn = terminalReturn - sectorBenchmarkReturn`.

Close-to-close is intentional. Daily OHLC does not reveal whether a day's high occurred before or after its low, so v1 does not invent intraday path ordering for drawdown.

## Target assessment

If RecommendationRecord has no target range:

- `targetAssessment = not_applicable`.

If a target exists, v1 considers the target reached on the first measured trading date whose **close** is at or above the lower edge of `targetRange`.

This is intentionally conservative and reproducible. Intraday-high target evaluation can be a separately versioned method later.

## Persisted provenance

Each Outcome stores:

- Recommendation ID + content hash;
- issue baseline hashes for issuer/TOPIX/sector;
- terminal hashes for issuer/TOPIX/sector;
- all selected measurement record hashes through the terminal date;
- baseline and terminal trading dates;
- reviewedAt / measurementCutoff;
- deterministic Outcome `contentHash`.

The validator rebuilds the expected Outcome from the Recommendation and PIT price context. Re-hashing manually altered metrics does not make them valid.

## Review-stage boundary

This record is quantitative only:

```text
reviewStage = quantitative_measurement
invalidationAssessment = not_assessed
verdict = inconclusive
```

The following human/semantic fields must remain empty in this stage:

- correctAssumptions
- incorrectAssumptions
- missingEvidence
- unexpectedConfounders
- lessons
- nextRuleChanges

A later review layer may append a separate human-reviewed record; it must not rewrite this quantitative measurement history.

## Revision model

Quantitative measurements are append-only and may be extended by `supersedesOutcomeId` as more executable price history becomes available.

- one root Outcome per Recommendation;
- no revision forks;
- `reviewedAt` strictly increases;
- `terminalTradingDate` cannot regress;
- once targetAssessment becomes `reached`, later quantitative revisions cannot revert it.

## Synthetic regression

The main fixture uses issuer closes:

```text
baseline 1000 -> 1100 -> 900 -> 1200
```

and verifies:

- maxReturn = +20%;
- maxDrawdown = 900 / 1100 - 1 ≈ -18.18%;
- terminalReturn = +20%;
- TOPIX terminal return = +2%;
- sector terminal return = +5%;
- TOPIX excess = +18 percentage points;
- sector excess = +15 percentage points;
- close-based target reached on the final common date;
- issuer-only later row does not extend the terminal date;
- re-hashed fabricated metrics are rejected;
- mismatched baseline trading dates are rejected;
- linear revisions pass and forks fail;
- rejected append leaves the existing JSONL byte-for-byte unchanged.

## Safety

- synthetic fixtures only;
- no real recommendation or market data committed;
- no automatic order authority;
- no LINE BUY delivery;
- no brokerage integration;
- no Cloudflare/D1 write;
- no Secret, billing or runner changes.
