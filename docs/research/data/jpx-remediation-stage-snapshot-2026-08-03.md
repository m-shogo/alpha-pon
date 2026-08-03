# JPX remediation-stage snapshot — 2026-08-03

Status: `PIT_SOURCE_SNAPSHOT`
Production use: `PROHIBITED`
Purpose: preserve a point-in-time cohort for Exchange Sanction Ladder, Remediation Half-Life, Remediation Failure Recurrence, and Known-Bad Event Repricing research.

## Source scope

Primary source only:

- JPX improvement-report / improvement-status-report list
- JPX issuer-specific enforcement and public-inspection notices

SNS, forums, influencers, anonymous posts, and social sentiment were not used.

## Current 2026 seed stages

| Issuer | Code | Segment | Investigation / correction stage | Exchange request stage | Submission stage | Research note |
|---|---:|---|---|---|---|---|
| KDDI | 9433 | Prime | 2026-03-31 special-investigation report and past-results corrections | 2026-04-30 improvement-report request plus JPY 91.2m listing-agreement penalty | 2026-06-02 improvement report | Large-cap control for whether exchange action is economically immaterial after costs |
| nms Holdings | 2162 | Standard | 2026-03-16 investigation report; 2026-04-28 and 2026-05-11 corrections | 2026-05-13 improvement-report request and public measure | 2026-06-05 improvement report | Mid/small-cap test of financing and governance sensitivity |
| eMnet Japan | 7036 | Growth | 2026-03-30 third-party report; 2026-03-31 corrections | 2026-05-19 improvement-report request and public measure | 2026-06-16 improvement report | Strong-actor/internal-control-override case; separate actor concentration from generic accounting cases |

## Escalation analog discovered in the current list

Toshin Holdings (9444) submitted an improvement report on 2025-05-16. The current JPX list states that an ordinary improvement-status report became unnecessary because the issuer was later designated a Special Attention Security on 2025-11-22 and therefore became subject to a stronger remediation regime.

This is a useful state-transition label:

`IMPROVEMENT_REPORT -> ESCALATED_TO_SPECIAL_ATTENTION`

It must not be mixed with ordinary six-month status-report cases. Treating it as a missing status report would create survivorship and outcome-label leakage.

## Outcome-label contract

For each improvement-report cohort member, freeze exactly one six-to-twelve-month state:

- `STATUS_REPORT_SUBMITTED`
- `ESCALATED_TO_SPECIAL_ATTENTION`
- `DELISTED_OR整理`
- `RE_REQUESTED_OR_ADDITIONAL_MEASURE`
- `NO_RECORDED_ESCALATION_AS_OF_CUTOFF`
- `CENSORED_NOT_ENOUGH_TIME`

Never label `SUCCESSFUL_REMEDIATION` solely because a report was submitted. Submission is a procedural stage, not an operational outcome.

## Confounder guard

Before event-return testing, exclude or separately flag:

- same-day earnings or guidance,
- capital actions, TOB/MBO, index changes, block trades,
- market-wide shock sessions,
- non-tradable timing or after-close disclosure,
- unavailable borrow, special quotation, extreme spread,
- issuer already in a separate listing-risk regime.

## Testable advance

The next backfill should compare:

1. request-stage abnormal return,
2. submission-stage abnormal return,
3. six-month operational outcome state,
4. whether remediation specificity and actor removal predict the later state.

The candidate edge is not `report submitted = buy`. The research question is whether the market underprices the difference between procedural compliance and durable operating remediation.

## Primary-source references

- https://www.jpx.co.jp/listing/measures/improvement-reports/index.html
- https://www.jpx.co.jp/equities/listing/measure/01.html
- https://www.jpx.co.jp/news/1023/20260430-15.html
- https://www.jpx.co.jp/news/1023/20260602-12.html
- https://www.jpx.co.jp/news/1023/20260513-13.html
- https://www.jpx.co.jp/news/1023/20260605-12.html
- https://www.jpx.co.jp/news/1023/20260519-12.html

## Current assessment

This run materially advances data hygiene and falsification design, but does not establish tradable Net Alpha. No production threshold, BUY WATCH, or short signal is changed.