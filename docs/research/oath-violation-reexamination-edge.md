# Oath-Violation Reexamination Edge

Status: `SHADOW_RESEARCH`
Priority: `HIGH`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-02 JST

## Research question

Do Japanese listed companies that enter a one-year grace period for reexamination after violating a listing or market-transfer written oath exhibit repeatable, executable abnormal returns at distinct stages of the process?

This is not a generic scandal signal. It is a narrower state-transition edge created when an already-disclosed misconduct case changes into a formal exchange-level survival test with an explicit deadline and possible delisting outcome.

Working name:

- Oath-Violation Reexamination Edge
- 宣誓書違反・再審査猶予期間Edge

## Why this may be distinct

The exchange action changes the issuer state in ways that may not be fully captured by the original misconduct disclosure:

1. the company must pass a new-listing-standard-equivalent reexamination within one year,
2. failure can lead to delisting,
3. management time and disclosure burden increase,
4. financing, institutional eligibility, index inclusion, borrow conditions, and counterparty confidence may change,
5. the deadline is calendarable and later state transitions can be observed point-in-time.

The edge is adjacent to Exchange Sanction Ladder and Known-Bad Event Repricing, but should only survive as a separate edge if the reexamination state adds explanatory power beyond the initial scandal, generic distress, and exchange sanctions.

## Primary-source grounding

Tokyo Stock Exchange rules state that when a company violates matters covered by a written oath submitted at initial listing or market transfer and is deemed not to have met the relevant criteria, it must pass a reexamination against new-listing-equivalent criteria within one year or may meet delisting criteria.

Initial seed cases:

| Issuer | Code | Market | Grace-period start | End | Trigger |
|---|---:|---|---|---|---|
| I-ne | 4933 | Prime | 2026-06-18 | 2027-06-18 | Market-transfer oath violation; undisclosed related-party status and governance failures |
| J.E.T. | 6228 | Standard | 2026-06-18 | 2027-06-18 | IPO oath violation; pre-listing revenue-recognition misconduct involving or tolerated by management |
| Daiwa Tsushin | 7116 | Standard | 2025-06-19 | 2026-06-19 | IPO oath violation; pre-listing accounting misconduct known by management |
| Sunwels | 9229 | Prime | 2025-04-30 | 2026-04-30 | Market-transfer oath violation; material overbilling and large earnings corrections |

Outcome notes for historical seeding:

- Daiwa Tsushin later delisted through a share consolidation on 2026-03-25, so it is not a clean failure-of-reexamination outcome.
- Sunwels moved to a supervisory designation under examination on 2026-05-01, making it a useful escalation-state example.
- I-ne and J.E.T. remained current grace-period names as of the source snapshot.

## Candidate mechanisms

### H1: State-change repricing

The grace-period announcement creates a negative abnormal return because delisting probability and financing friction become explicit.

### H2: Prior-recovery asymmetry

The negative reaction is stronger when the stock had recovered substantially from the original scandal low before the exchange decision.

### H3: Deadline convexity

As the one-year deadline approaches without a successful application or credible remediation evidence, downside sensitivity rises nonlinearly.

### H4: Application relief

A PIT-safe announcement that the issuer has formally applied for reexamination, together with credible remediation evidence, may reduce uncertainty and produce positive abnormal return.

### H5: Approval relief versus failure crash

Approval should produce a positive state transition; rejection or failure to apply should produce a sharp negative transition. The magnitude may be larger than ordinary improvement-report events because the terminal state includes delisting risk.

### H6: Prime-versus-Standard heterogeneity

Prime issuers may face larger institutional and index-related flows, while Standard issuers may face larger liquidity, financing, and borrow-cost distortions. These effects must be estimated separately.

## Dataset contract

For each issuer, create an event-state ledger with:

- issuer, code, market segment, listing date, market-transfer date,
- original misconduct first-known timestamp,
- investigation report and correction timestamps,
- oath-violation announcement timestamp,
- grace-period start and end dates,
- penalty amount,
- whether misconduct predated listing or market transfer,
- actor class and management knowledge,
- application date, review milestones, approval, rejection, supervisory designation, delisting or alternative corporate action,
- close-to-close and open-to-close returns for D0, D+1, D+3, D+5, D+20,
- market- and sector-adjusted abnormal returns,
- volume shock, spread proxy, borrow availability, short cost and limit-up/down constraints,
- recovery from scandal low before each event,
- free float, index membership, institutional ownership proxy and financing needs,
- concurrent earnings, guidance, capital actions, TOB/MBO, share consolidation, index changes and macro confounders,
- exact publication time and first executable price.

## Entry and exit candidates

Research only:

- exchange announcement published before close: next executable price after confirmed publication,
- after-hours announcement: next-session open,
- deadline-risk signal: pre-specified monthly checkpoints only, never retrospective date selection,
- relief signal: next open after a confirmed application or approval announcement,
- test exits at D0, D+1, D+3, D+5 and D+20.

No short signal is executable without borrow availability, expected borrow cost, spread, price-limit risk and exit liquidity.

## Confounders

The edge must control for:

- original accounting correction magnitude,
- management dismissal or resignation,
- auditor opinion or conclusion disclaimer,
- concurrent earnings or guidance,
- special-alert or supervisory designation,
- TOB, MBO, share consolidation or other path to delisting,
- generic post-IPO underperformance,
- small-cap liquidity and momentum,
- index deletion or forced institutional selling,
- sector and market shocks.

## Falsification criteria

Reject or merge this edge if:

- the oath-violation state has no incremental explanatory power after controlling for the initial scandal and generic exchange sanctions,
- results are driven by Sunwels or one other extreme case,
- the sample is too small for stable inference,
- after-hours gaps capture all expected return and leave no executable alpha,
- borrow cost and liquidity eliminate short-side Net Alpha,
- application or approval events do not produce consistent state-transition effects,
- an untouched holdout set fails.

## Promotion gate

Do not promote unless all conditions are met:

- enough independent issuer-events and complete state histories,
- PIT-safe timestamps and reproducible first executable prices,
- positive Net Alpha after realistic execution and borrow costs,
- robust results after market, sector, liquidity, momentum and concurrent-event controls,
- no dominant issuer or single outcome path,
- untouched holdout success,
- measurable incremental information beyond Exchange Sanction Ladder, Regulatory Deadline and generic distress.

## Current assessment

`HIGH-VALUE RESEARCH CANDIDATE`, not a trading signal.

The strongest feature is the explicit one-year survival deadline and discrete exchange state machine. The biggest limitation is the very small modern sample and contamination by alternative corporate actions. The next research step is to backfill all historical oath-violation reexamination cases and their full outcomes, then compare stage-specific abnormal returns against matched scandal controls that never entered reexamination.

## Source policy audit

Used: JPX enforcement notices, JPX delisting-rule explanations, JPX grace-period current and historical lists.

Not used: SNS, forums, influencers, anonymous posts or social sentiment.
