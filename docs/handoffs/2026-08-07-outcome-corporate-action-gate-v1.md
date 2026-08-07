# Handoff — Quantitative Outcome Corporate Action Gate v1

Status: `IMPLEMENTED_AWAITING_CI`
Updated: 2026-08-07 JST
Depends on: Quantitative Outcome Persistence v1 (#112), Corporate Action Clearance v1 (#113)

## Purpose

Make raw/unadjusted issuer price returns fail closed unless the full measured horizon is covered by an evidence-backed Corporate Action Clearance.

This closes a serious learning-data failure mode: a stock split or reverse split must never be learned as a real economic crash/rally merely because the current J-Quants Free v1 store uses unadjusted prices.

## Outcome contract changes

Every quantitative Outcome now persists:

- `returnBasis = unadjusted-close-price-return-corporate-action-cleared-v1`
- `issuerCorporateActionClearanceHash`

The clearance hash is part of the Outcome content hash and therefore part of the immutable measurement provenance.

## Required clearance

Before raw issuer return metrics can be built, the referenced CorporateActionClearanceRecord must:

- exist in the canonical clearance context;
- have a content hash that recomputes from the record itself;
- have `status = clear`;
- match issuer `code / market / source / providerPlan` exactly;
- start on or before the issuer baseline trading date;
- extend through the Outcome terminal trading date;
- have `assessedAt <= reviewedAt`.

A missing, `action_detected`, `inconclusive`, future-assessed, wrong-series or too-short clearance blocks Outcome generation.

## Price representation gate

`pit-close-common-date-v1` remains explicitly an **unadjusted close-price return** method.

For the issuer baseline and every measured issuer row, v1 requires:

```text
adjusted = false
adjustmentFactor = 1
corporateActions = []
```

If adjusted and raw records are mixed, or embedded corporate actions appear, v1 refuses to calculate rather than silently applying an undocumented transformation.

A separately versioned adjusted-price / corporate-action-aware measurement method may be implemented later.

## Important interpretation boundary

The current metrics are **price returns**, not total shareholder returns.

They do not add cash dividends or other distributions to the return numerator. Therefore:

- `terminalReturn`
- `maxReturn`
- `maxDrawdown`
- TOPIX/sector excess returns

must not be described as dividend-inclusive total return unless a future measurement method explicitly implements and validates that treatment.

## Real-data implication

The J-Quants Free adapter currently stores unadjusted prices and does not provide sufficient corporate-action lineage by itself.

Therefore a real J-Quants Free Outcome remains fail-closed until Alpha Pon can produce a real Tier A/B evidence-backed CorporateActionClearanceRecord covering the requested measurement horizon.

Do not fabricate a `clear` record simply to unblock an Outcome.

## Regression coverage

The quantitative Outcome fixture now verifies:

- evidence-backed `clear` record allows the existing +20% / drawdown / excess-return calculation;
- missing clearance blocks generation;
- `action_detected` blocks generation;
- clearance shorter than the terminal horizon blocks generation;
- adjusted/raw issuer records are not silently mixed;
- all existing recomputation, baseline alignment, target, revision and append-only tests continue to pass.

## Safety

- synthetic fixtures only;
- no claim that any real issuer is corporate-action clear;
- no real recommendation or market data committed;
- no automatic order authority;
- no LINE BUY delivery;
- no brokerage integration;
- no Cloudflare/D1 write;
- no Secret, billing or runner changes.
