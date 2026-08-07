# Handoff — Recommendation Benchmark Provenance v1

Status: `IMPLEMENTED_AWAITING_CI`
Updated: 2026-08-07 JST
Depends on: PR #110 Recommendation Persistence v1 / Slice 1

## Purpose

Freeze the issuer, TOPIX and sector-benchmark baselines at recommendation issue time before implementing Outcome metrics.

Without these pins, a later outcome review could select a different benchmark start row and produce an ambiguous or hindsight-biased excess return.

## Added RecommendationRecord pins

- `benchmarkPriceRecordHash`
- `benchmarkPriceFirstExecutableAt`
- `sectorBenchmarkPriceRecordHash`
- `sectorBenchmarkPriceFirstExecutableAt`

The issuer baseline was already pinned by:

- `currentPriceRecordHash`
- `currentPriceFirstExecutableAt`

## Validation boundary

For issuer, TOPIX and sector baseline records:

- the hash must resolve in the supplied PIT Price Store context;
- the record's own `contentHash` must match the pin;
- `computePriceRecordHash(record)` must equal the stored `contentHash`;
- issuer must be a matching `security` record;
- benchmark pins must be matching `benchmark` records;
- the record must be `traded` with OHLC;
- `observedAt <= informationCutoff`;
- `firstExecutableAt <= issuedAt`;
- the pinned first-executable timestamp must exactly match the PIT record;
- `license=unknown` is rejected.

This prevents a mutated PIT object from being accepted merely because the map key or stale `contentHash` string still matches.

## Regression coverage

- valid issuer + TOPIX + sector baseline pins;
- missing TOPIX baseline record rejected;
- wrong/mutated benchmark identity rejected;
- post-cutoff / not-yet-executable sector benchmark rejected;
- mutated issuer record with stale hash rejected;
- all prior Recommendation persistence safety tests continue to run centrally.

## Outcome dependency

Outcome metric implementation must use these issue-time baseline pins. It must not choose a later or alternate baseline price by date alone.

## Safety

- synthetic fixtures only;
- no real recommendation data;
- no live market data committed;
- no LINE BUY, automatic order, brokerage integration, Cloudflare/D1 write, Secret or billing change.
