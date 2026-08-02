# Exchange Sanction Ladder — Seed Cohort

Status: `RESEARCH_INPUT`
Created: 2026-08-02 JST
Production use: `PROHIBITED`
Source policy: primary/public sources only; SNS not used.

## Purpose

Seed the first point-in-time event cohort for `Exchange Sanction Ladder Edge` with exchange-enforcement milestones that can later be joined to issuer disclosures and market data.

This file records event chronology only. It does **not** assert alpha, direction, causality, or tradability.

## Cohort

| Issuer | Code | Segment | First known misconduct / correction stage | JPX request / public-measure stage | Improvement report | Improvement-status report | Current research note |
|---|---:|---|---|---|---|---|---|
| KDDI | 9433 | Prime | 2026-03-31 special investigation report and prior-period corrections | 2026-04-30 improvement-report request and listing-agreement penalty | 2026-06-02 | pending / not yet due in the observed source snapshot | Large-cap null-control candidate; test whether exchange measures add information beyond the 2026-03-31 disclosure. |
| nms Holdings | 2162 | Standard | 2026-03-16 investigation report; 2026-04-28 and 2026-05-11 corrections | 2026-05-13 improvement-report request and public measure | 2026-06-05 | pending / not yet due in the observed source snapshot | Small-cap financing-sensitivity candidate; separate correction-day effects from JPX-stage effects. |
| eMnet Japan | 7036 | Growth | 2026-03-30 third-party report; 2026-03-31 corrections | 2026-05-19 improvement-report request and public measure | 2026-06-16 | pending / not yet due in the observed source snapshot | Growth/low-liquidity candidate; execution-cost and gap-risk controls required. |
| Kasai Kogyo | 7256 | Standard | pre-2025 misconduct/correction chronology to be backfilled | request/public-measure chronology to be backfilled | 2025-11-11 | 2026-05-15 | First observed six-month verification-stage sample in the current JPX list. |
| FISCO | 3807 | Growth | inappropriate crypto-asset valuation and accounting; remediation disclosed 2025-08-04 | 2025-09-19 improvement-report request and public measure | 2025-10-17 | 2026-04-20 | Useful for testing whether the status report is information-bearing or merely formal. |
| Advance Create | 8798 | Prime | chronology to be backfilled | chronology to be backfilled | 2025-06-20 | 2026-01-07 | Prime-market comparison case. |
| Rackland | 9612 | Prime | chronology to be backfilled | chronology to be backfilled | 2024-07-31 | 2025-02-13 | Older validation-stage sample with enough post-event horizon. |
| Tokyo Sangyo | 8070 | Prime | chronology to be backfilled | chronology to be backfilled | 2024-06-13 | 2024-12-16 | Older validation-stage sample; possible clean benchmark if concurrent events are absent. |
| Image One | 2667 | Standard | chronology to be backfilled | chronology to be backfilled | 2024-03-19 | 2024-10-02 | Small-cap execution-risk sample. |
| ITbook Holdings | 1447 | Growth | chronology to be backfilled | chronology to be backfilled | 2023-10-26 | 2024-05-08 | Growth-market sample for status-report stage. |
| Yamaura | 1780 | Prime | chronology to be backfilled | chronology to be backfilled | 2023-10-06 | 2024-04-12 | Prime-market status-report sample. |

## Immediate validation tasks

For every row, backfill and freeze:

1. exact disclosure timestamp and whether the event was known before the tradable entry point,
2. company disclosure URL, JPX measure URL, report URL and immutable retrieval timestamp,
3. D0, D+1, D+3 and D+5 close-to-close and open-to-close returns,
4. TOPIX and sector-adjusted abnormal returns,
5. volume shock, opening gap, spread/liquidity proxy, borrow availability and estimated short cost,
6. concurrent earnings, guidance, capital actions, index changes, block trades and macro confounders,
7. whether the report contained materially new economic facts or only remediation progress,
8. whether the issuer had recovered materially from the original scandal low before the later stage.

## Pre-registered stage hypotheses

- `REQUEST_NEGATIVE`: JPX request/public measure can create negative repricing when the market had treated the scandal as resolved.
- `SUBMISSION_RELIEF`: improvement-report submission without worse facts may reduce uncertainty.
- `STATUS_VERIFICATION_SPLIT`: the six-month status report should only matter when it contains verifiable evidence of remediation failure or success; purely formal submissions should be near-null after costs.
- `SIZE_LIQUIDITY_INTERACTION`: effects, if any, should be larger in fragile Growth/Standard issuers but may be less executable.
- `LARGE_CAP_NULL`: large Prime issuers should be treated as an explicit null/control cohort rather than assumed trade candidates.

## Falsification and promotion guard

Reject or downgrade the edge if:

- returns vanish after excluding concurrent earnings/guidance days,
- the apparent effect is generic momentum or low-liquidity reversal,
- the event cannot be entered without look-ahead,
- spreads, gap risk, borrow cost or inability to short consume expected alpha,
- one distressed microcap drives aggregate PnL,
- status-report events are statistically indistinguishable from zero,
- an untouched holdout cohort fails.

No production promotion is allowed from this seed cohort alone.

## Source audit

Used in this seed:

- JPX improvement-report / improvement-status-report issuer list,
- JPX issuer-specific enforcement pages,
- company disclosure chronology referenced by JPX.

Not used:

- SNS,
- forums,
- influencers,
- anonymous posts,
- social sentiment.
