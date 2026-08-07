# Handoff — Recommendation Persistence v1 / Slice 1

Status: `IMPLEMENTED_AWAITING_CI`
Updated: 2026-08-07 JST

## Purpose

Implement the issue-time immutable RecommendationRecord boundary before outcome calculation or any live recommendation automation.

This slice does **not** authorize automatic orders, LINE BUY delivery, or production recommendation generation.

## Implemented

- canonical `RecommendationRecord` JSON schema;
- deterministic SHA-256 `contentHash`;
- append-only JSONL writer with fsync;
- linear `supersedesId` revision chain;
- duplicate ID/hash and revision-fork rejection;
- explicit fact separation: new facts / known facts / assumptions / forecasts / opinions;
- source Evidence tier A-D only; Discovery-only sources cannot enter the schema;
- canonical Evidence ref/tier/time verification against validation context;
- `informationCutoff` enforcement;
- current price pin to an existing PIT Price Store record;
- current price must match the pinned traded close;
- pinned price must be observed by `informationCutoff` and executable by `issuedAt`;
- unknown price license rejection;
- recommendation Edge IDs must resolve to active-research / shadow / validated stages;
- BUY requires at least one eligible Edge;
- buy range / target range / confidence / scenario probabilities require explicit basis refs;
- scenario probability sum must equal 1;
- secret-like URL query refs are rejected;
- `automaticTradingAuthorized=false` is schema-fixed.

## Important design change from the v0 draft

The persisted v1 record adds provenance fields that the prose draft did not explicitly pin:

- `schemaVersion`
- `currentPriceRecordHash`
- `currentPriceFirstExecutableAt`
- `buyRangeBasisRefs`
- `targetRangeBasisRefs`
- `confidenceBasisRefs`
- `scenarioProbabilityBasisRefs`
- `evidenceSummary`
- `automaticTradingAuthorized`
- `contentHash`

These are required to make the draft's anti-fabrication and PIT promises enforceable rather than narrative-only.

## Synthetic regression coverage

- valid issue-time BUY record;
- range without basis rejected;
- confidence without basis rejected;
- invalid scenario probability sum rejected;
- same statement classified as fact and assumption rejected;
- post-cutoff Evidence rejected;
- catalog-only BUY rejected;
- current price mismatch vs PIT record rejected;
- valid linear revision accepted;
- revision fork rejected;
- rejected append leaves the existing JSONL byte-for-byte unchanged.

## Remaining work

Separate PRs:

1. `OutcomeRecord` schema + append-only persistence;
2. PIT-derived maxReturn / maxDrawdown / TOPIX and sector excess return;
3. target / invalidation / expiry review logic;
4. immutable failed-forecast retention and outcome review tests;
5. integrate only after real Foundation evidence/price/benchmark gates are satisfied.

## Safety boundary

- no real recommendation records committed;
- no live price data committed;
- no automatic trading;
- no brokerage integration;
- no LINE BUY send;
- no Cloudflare/D1 write;
- no Secret or billing changes.
