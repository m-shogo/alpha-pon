# Regulator-First Disclosure Lag Edge

Status: `SHADOW_RESEARCH`
Priority: `MEDIUM`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-02 JST

## Research question

When a regulator, exchange, ministry, municipality, court, or other public authority publishes a material action before the affected listed company issues its own IR or TDnet disclosure, does the source-ordering gap create a repeatable, point-in-time-safe abnormal-return opportunity?

This candidate is narrower than generic Cross-Source Reveal. It focuses specifically on a measurable ordering:

1. public-authority publication timestamp,
2. first company acknowledgement timestamp,
3. first liquid execution opportunity,
4. subsequent clarification or remediation disclosure.

## Candidate mechanism

- Some investors and data feeds monitor company IR first and public-authority sources second.
- A regulator-first publication may therefore reach the market unevenly even though it is already public.
- The company acknowledgement can act as a second attention event without adding much new economic information.
- The gap may be more important for small and mid-cap issuers with weak disclosure operations, low analyst coverage, or fragmented stakeholder communication.
- The edge may reverse when the authority notice is ambiguous and the later company disclosure materially narrows the impact.

## Source universe

Use only timestamped public or official sources:

- JPX / TSE enforcement and listing-measure pages,
- FSA, ministries, agencies, municipalities and sector regulators,
- court or administrative publication systems,
- company IR and TDnet,
- EDINET filings,
- exchange price, volume and benchmark data.

Do not use SNS, forums, influencers, anonymous posts, or social sentiment.

## Dataset contract

For every candidate event, record:

- issuer, code, market segment and liquidity,
- authority name and action type,
- authority publication URL and exact timestamp,
- company IR / TDnet acknowledgement URL and exact timestamp,
- lag in minutes and trading sessions,
- whether the company added new economic facts,
- whether the event was visible before the first executable trade,
- close-to-close, open-to-close and gap returns for D0, D+1, D+3 and D+5,
- TOPIX and sector-adjusted abnormal returns,
- volume shock, spread proxy, price limit interaction and borrow availability,
- concurrent earnings, guidance, capital actions, index changes, block trades and macro confounders,
- whether the authority item was machine-discoverable from a stable feed or page,
- source-access latency and archival reproducibility.

## Initial hypotheses

### H1: Regulator-first negative drift

A clearly adverse authority publication followed later by a company acknowledgement produces negative drift between the first executable trade and the acknowledgement, especially in under-covered issuers.

### H2: Attention-reset at company acknowledgement

If the company disclosure adds little new information, the second reaction should be smaller than the first. A large second reaction would indicate attention segmentation rather than fundamental repricing.

### H3: Clarification reversal

If the authority notice is broad but the later company disclosure credibly limits financial impact, part of the initial decline may reverse.

### H4: No edge in large liquid issuers

For highly followed Prime issuers, authority-first information may be incorporated too quickly for net alpha after spreads and execution latency.

## Confounders and falsification

Reject or downgrade the edge if:

- authority timestamps cannot be reproduced point in time,
- the first executable price already fully reflects the information,
- results disappear after controlling for concurrent earnings or guidance,
- only illiquid microcaps drive the effect,
- company acknowledgements usually contain materially new facts,
- data-feed access advantages are not realistically obtainable,
- spreads, price limits, borrow costs or latency consume expected alpha,
- an untouched holdout set fails.

## Entry / exit candidates

- Long or short only after the official authority publication is confirmed and timestamped.
- Use next open when publication occurs outside market hours.
- Use a latency-aware first tradable bar when publication occurs during market hours.
- Candidate exits: company acknowledgement, D0 close, D+1 close, D+3 close.
- No production signal without executable timestamp validation.

## Promotion gate

Do not promote unless all are met:

- enough independent events across multiple authorities and sectors,
- point-in-time timestamp reproducibility,
- positive net alpha after realistic latency, spreads and borrow costs,
- survival after market, sector, liquidity and concurrent-event controls,
- no dependence on one issuer or one authority,
- untouched holdout pass,
- incremental value beyond generic overnight-gap, Cross-Source Reveal and Known-Bad Event Repricing features.

## Current assessment

`RESEARCH CANDIDATE`, not a trading signal.

The useful advance is the explicit separation of source ordering from event content. The next task is to backfill regulator-first / company-later pairs from JPX enforcement actions, ministry sanctions, product recalls, administrative orders and court actions, then measure lag-conditioned abnormal returns.

## Current watch audit

No new Sunday market-moving Japanese listed-company scandal was confirmed in this run from the checked official/public sources. Existing JPX enforcement and adverse-audit cohorts remain research inputs, not new alerts.

## Source policy audit

Used: JPX official listing-measure and enforcement pages, public-source chronology, repository research history.

Not used: SNS, forums, influencers, anonymous posts, social sentiment.
