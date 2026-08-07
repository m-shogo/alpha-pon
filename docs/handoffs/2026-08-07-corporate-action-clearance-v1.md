# Handoff — Corporate Action Clearance v1

Status: `IMPLEMENTED_AWAITING_CI`
Updated: 2026-08-07 JST

## Purpose

Prevent unadjusted-price Outcome metrics from silently treating stock splits or reverse splits as economic gains/losses.

J-Quants Free v1 intentionally stores unadjusted prices and does not provide corporate-action lineage in the current adapter. Therefore a quantitative Outcome must eventually require a separately evidenced corporate-action clearance before those raw returns can be trusted.

## Record

`CorporateActionClearanceRecord` is an append-only assessment for one security/provider series over a trading-date window.

Required identity:

- code
- market
- source
- providerPlan
- fromTradingDate
- throughTradingDate

Assessment status:

- `clear`
- `action_detected`
- `inconclusive`

## Evidence boundary

Only Tier A/B evidence is structurally accepted.

- Tier C/D discovery-only sources cannot establish a clearance.
- canonical evidence ref/tier must exist in validation context;
- Evidence observed after `assessedAt` is rejected;
- secret/token-like Evidence refs are rejected.

`clear` is therefore not a free boolean: it is a hashed record with explicit source provenance.

## Revision model

- append-only JSONL + fsync;
- deterministic SHA-256 contentHash;
- `supersedesClearanceId` supports later reassessment;
- revision identity cannot change;
- assessedAt strictly increases;
- coverage start cannot move later;
- coverage end cannot regress;
- no revision fork.

A later discovery of a split may supersede an earlier `clear` record with `action_detected`; history is preserved rather than rewritten.

## Regression

- valid Tier A/B evidence-backed clear record;
- future Evidence rejected;
- secret-like Evidence ref rejected;
- Tier C evidence structurally rejected;
- linear coverage extension accepted;
- revision fork rejected;
- rejected append leaves prior JSONL byte-for-byte unchanged.

## Next integration

Quantitative Outcome v1 currently measures unadjusted price return. The next hardening slice should require a `clear` CorporateActionClearanceRecord whose coverage spans the issuer baseline through terminal trading date before persisting a raw-price Outcome.

## Safety

- synthetic fixtures only;
- no claim that any real issuer is corporate-action clear;
- no real market data commit;
- no automatic trading/LINE BUY/brokerage authority;
- no Cloudflare/D1/Secret/billing/runner changes.
