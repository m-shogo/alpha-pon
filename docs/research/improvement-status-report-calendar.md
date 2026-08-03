# Improvement-Status Report Event Calendar

Status: `RESEARCH_FIXTURE`
Parent edge: `Exchange Sanction Ladder Edge`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-03 JST

## Purpose

Create a point-in-time-safe queue for the approximately six-month follow-up reports that Tokyo Stock Exchange generally requires after an issuer submits an improvement report.

This is not a standalone trading signal. It is an event-calendar fixture used to test whether unresolved remediation risk, credible uncertainty resolution, or repeated control weakness creates abnormal returns around the later improvement-status report.

## Rule grounding

TSE states that when an issuer submits an improvement report, the issuer is generally required to submit an improvement-status report promptly after six months have elapsed. Failure to submit a requested improvement report, or a conclusion that disclosure practices are unlikely to improve, can lead to delisting.

After removal from Special Attention designation, TSE may also require an improvement-status report during the following five years when it considers continued monitoring necessary. This longer post-release window belongs to the separate `Remediation Half-Life` research track and must not be pooled blindly with ordinary six-month follow-up events.

## Current calendar seeds

| Issuer | Code | Market | Improvement report | Approximate six-month window | Current status |
|---|---:|---|---|---|---|
| KDDI | 9433 | Prime | 2026-06-02 | early December 2026 | future research event |
| nms Holdings | 2162 | Standard | 2026-06-05 | early December 2026 | future research event |
| eMnet Japan | 7036 | Growth | 2026-06-16 | mid-December 2026 | future research event |
| Kasai Kogyo | 7256 | Standard | 2025-11-11 | May 2026 | status report submitted 2026-05-15 |
| FISCO | 3807 | Growth | 2025-10-17 | April 2026 | status report submitted 2026-04-20 |
| Advance Create | 8798 | Prime | 2025-06-20 | December 2025 / January 2026 | status report submitted 2026-01-07 |

The exact publication date is not known merely from the six-month rule. Store the expected window separately from the confirmed publication timestamp and never backfill the actual date into a pre-event feature.

## PIT fields

For each issuer-event, store:

- `improvement_report_published_at`
- `six_month_clock_date`
- `expected_window_start`
- `expected_window_end`
- `status_report_published_at`
- `first_executable_open`
- `report_was_late`
- `new_adverse_facts`
- `auditor_disagreement_unresolved`
- `filing_delay_since_improvement_report`
- `executive_turnover_since_improvement_report`
- `related_party_controls_changed`
- `subsidiary_controls_changed`
- `financing_pressure`
- `disclosure_quality_delta`
- `listing_state_before`
- `listing_state_after`
- `D0`, `D+1`, `D+3`, `D+5` market- and sector-adjusted returns
- open gap, volume shock, spread proxy, borrow availability and cost
- concurrent earnings, guidance, capital action, index and macro confounders

## Hypotheses

### H1: unresolved-risk amplification

Issuers with unresolved auditor concerns, repeated filing delays, weak subsidiary controls or financing pressure produce more negative abnormal returns when the status report confirms incomplete remediation.

### H2: credible uncertainty relief

Issuers that disclose operational control evidence rather than policy-only remediation produce neutral-to-positive abnormal returns when the status report closes a material uncertainty branch.

### H3: calendar awareness without mechanical trading

The six-month rule improves monitoring priority and Value-of-Information scheduling, but the passage of six months alone has no alpha after controlling for distress and momentum.

### H4: late-report signal

A report published materially after the expected window may be a risk signal, but only if lateness is measured using information actually available at the time and after excluding administrative timing differences.

## Falsification and confounders

Reject or downgrade if:

- the effect disappears after controlling for prior momentum, distress, liquidity and concurrent earnings;
- expected-window proximity predicts nothing beyond generic calendar effects;
- positive and negative report contents cannot be classified without hindsight;
- report timing is too irregular to define a reproducible PIT feature;
- one microcap or one accounting-fraud cluster drives the result;
- execution costs, gap risk or borrow costs eliminate net alpha;
- untouched holdout issuers fail.

## Execution constraints

- No trade may use the actual report date before publication.
- Calendar features may only use the original improvement-report date and the public TSE rule.
- Event trades begin at the first executable open after confirmed publication.
- Prior-close fills are prohibited unless publication occurred before that close.
- Short candidates require confirmed borrow availability and realistic cost.

## Next research step

Backfill all currently published improvement-status reports, then compare:

1. expected-window monitoring value,
2. content-conditioned event returns,
3. late versus on-window publication,
4. operational remediation versus policy-only remediation,
5. incremental explanatory power beyond generic distress and momentum.

## Source policy audit

Used: JPX rules and official improvement-report / improvement-status-report lists.

Not used: SNS, forums, influencers, anonymous posts or social sentiment.
