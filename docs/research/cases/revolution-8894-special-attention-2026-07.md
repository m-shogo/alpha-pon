# REVOLUTION (8894) — Special Attention Designation Case Note

Status: `SHADOW_RESEARCH_CASE`
Production use: `PROHIBITED`
Observed through: 2026-07-28

## Event chronology

- 2026-06-15: REVOLUTION disclosed formation of an internal investigation committee including independent external experts after identifying possible inappropriate accounting in real-estate-fund transactions operated by consolidated subsidiary Yamawake Estate.
- 2026-07-24: Tokyo Stock Exchange announced designation as a Special Attention Security, effective 2026-07-25, and imposed a JPY 14.4 million listing-agreement penalty.
- 2026-07-27: the company posted its own notice concerning the TSE designation and penalty.

The TSE rationale included a disclaimer of conclusion in the quarterly review report and a finding that the issuer's internal management system required significant improvement. The listing-state transition is economically more important than the nominal penalty.

## Timestamp and execution alignment

The TSE announcement was published on Friday 2026-07-24, while the formal designation became effective on Saturday 2026-07-25. Therefore:

- `announcement_session`: 2026-07-24,
- `formal_effective_date`: 2026-07-25,
- `first_post-designation_executable_session`: 2026-07-27.

A backtest aligned only to the formal effective date would be invalid. Prior-close entry is also invalid unless the exact publication timestamp proves the information was public before the 2026-07-24 close.

## Initial market reaction

Observed raw prices:

| Date | Close | Daily return | Volume |
|---|---:|---:|---:|
| 2026-07-23 | JPY 25 | 0.0% | 233,600 |
| 2026-07-24 | JPY 24 | -4.0% | 1,113,800 |
| 2026-07-27 | JPY 23 | -4.17% | 1,067,000 |
| 2026-07-28 | JPY 23 | 0.0% | about 1.03 million |

Unadjusted cumulative close-to-close return from 2026-07-23 to 2026-07-27 was approximately -8.0%. Volume on 2026-07-24 was about 4.77 times the prior session.

## Interpretation

This case is consistent with a two-session enforcement-state repricing, but it is not yet evidence of standalone alpha.

Supporting observations:

- the designation changed the issuer's listing-risk state rather than merely adding a small cash fine,
- abnormal-looking volume accompanied the first down session,
- selling continued into the first session after formal designation.

Major confounders:

- the stock was already in severe distress and near its 2026 year-to-date low,
- accounting uncertainty and the review disclaimer were already known,
- low absolute price creates coarse one-yen tick returns,
- liquidity, spread, borrow availability and short cost may make the apparent return non-executable,
- the 2026-07-24 decline may have begun before the TSE publication time.

## Edge implications

### Candidate feature: listing-state delta

Encode the transition separately from the cash penalty:

- `listing_state_before`: ordinary listing with disclosed accounting investigation,
- `listing_state_after`: Special Attention / improvement review,
- `cash_penalty_jpy`: 14,400,000,
- `listing_state_delta`: severe deterioration.

This case supports prioritizing state-transition severity over nominal penalty size.

### Candidate feature: first-session information split

Store both:

- same-day reaction after the actual publication timestamp, and
- next-executable-open reaction.

If timestamp data cannot separate pre-publication and post-publication trading, classify D0 as contaminated and begin executable testing at D+1 open.

## Required next validation

1. Obtain the precise TSE publication timestamp.
2. Calculate TOPIX and real-estate-sector adjusted returns for D0, D+1, D+3 and D+5.
3. Record bid-ask spread, turnover, daily price-limit constraints, borrow availability and borrow fee.
4. Compare with other Special Attention designations after 2024: unbanked (8746), Air Water (4088), Abalance (3856), Nidec (6594), ACCESS (4813), Tabikobo (6548) and TOSHIN Holdings (9444).
5. Control for auditor opinion, filing delays, existing distress momentum and concurrent company disclosures.

## Current verdict

`USEFUL ANALOG / NO SIGNAL`

The event advances the Exchange Sanction Ladder dataset and validates the need for announcement/effective/executable-date separation. It does not justify production promotion or a user trading alert by itself.

## Source policy audit

Used: JPX official designation pages, company IR chronology, exchange/market-price data.

Not used: SNS, forums, influencers, anonymous posts or social sentiment.
