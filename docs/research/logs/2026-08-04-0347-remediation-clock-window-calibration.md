# Remediation Status Expected-Window Calibration

Date: 2026-08-04 JST
Status: `SHADOW_RESEARCH`
Production use: `PROHIBITED`

## Objective

Refine the Remediation Clock Surprise Edge so that it does not treat the improvement-status report as an exact six-month calendar event. The research target remains content surprise, not a mechanically timed position.

## Primary-source check

JPX states that, after an improvement report is submitted, the issuer is generally required to submit an improvement-status report promptly after six months have elapsed. The observable publication date is therefore rule-anchored but not an exact date.

Initial completed pairs:

| Issuer | Code | Improvement report | Improvement-status report | Calendar lag |
|---|---:|---:|---:|---:|
| Advance Create | 8798 | 2025-06-20 | 2026-01-07 | 201 days |
| Fisco | 3807 | 2025-10-17 | 2026-04-20 | 185 days |
| Kasai Kogyo | 7256 | 2025-11-11 | 2026-05-15 | 185 days |

The observed seed range is 185-201 calendar days. This is consistent with a six-month regulatory anchor plus business-day, holiday, issuer-preparation and administrative timing effects. The sample is too small to infer a stable distribution.

## Research advancement

### Replace exact-date expectation with an expected window

Add the following PIT-safe fields:

- `six_month_anchor_date`
- `earliest_plausible_business_date`
- `expected_publication_window_start`
- `expected_publication_window_end`
- `actual_publication_timestamp`
- `lag_from_six_month_anchor_days`
- `publication_window_state`: `PRE_WINDOW` / `IN_WINDOW` / `LATE`

Do not define slippage from raw calendar days alone. A report should be considered potentially late only after accounting for:

- the six-calendar-month anchor rather than a fixed 180-day assumption,
- weekends and Japanese holidays,
- the wording "after six months have elapsed, promptly",
- an issuer-stated timetable where one exists,
- any JPX follow-up or extension evidence.

### Falsification consequence

The calendar component is more predictable than previously modeled, but the exact publication session is not. Therefore:

- pre-positioning on a guessed exact date remains prohibited,
- any apparent return around day 180 must be tested for date-selection bias,
- event studies must align to the confirmed publication timestamp and first executable session,
- the edge must come from operational-remediation evidence, recurrence, auditor state or escalation-risk change.

### New niche candidate: `Remediation Window Overrun Escalation`

Hypothesis: issuers that move beyond a pre-registered expected publication window without a clear official explanation may experience rising uncertainty before eventual disclosure.

This is not yet an Edge. It may merely proxy for distress, poor disclosure operations or illiquidity.

Required data:

- at least 30 completed report pairs,
- PIT-safe expected windows fixed before observing returns,
- official explanation or JPX follow-up status,
- pre-window and post-window abnormal returns,
- liquidity, distress, filing delay, financing and concurrent-event controls,
- Counterfactual Twins matched on original misconduct severity and issuer fragility.

Reject if the effect disappears after controlling for general filing-delay risk or if publication timing cannot be known without hindsight.

## Named Watch and new-incident audit

- Sanrio (8136): no verified new primary-source development found in this run that changes the existing state.
- AEON (8267): no verified new primary-source misconduct development found in this run.
- Broad Japan misconduct watch: no sufficiently confirmed new major case identified for escalation during this run.

## Capital Survival audit

- False Discovery Guard: active; three observations are descriptive only.
- Holdout: untouched; no holdout use.
- Net Alpha: not estimable.
- Execution: no pre-event trade allowed; post-publication study only.
- Liquidity/borrow: pending issuer-level market data.
- Confounders: earnings, financing, filing delay, distress momentum and concurrent JPX actions remain mandatory.
- Production transition: prohibited.

## Next sample queue

1. Backfill all current JPX improvement-report pairs with both initial and status reports.
2. Calculate six-month anchors using calendar-month arithmetic and Japanese business days.
3. Pre-register an expected-window rule before return analysis.
4. Separate publication timing surprise from report-content surprise.
5. Test whether window overruns add information beyond generic reporting-delay indicators.

## Source policy audit

Used: JPX official improvement-report framework and JPX issuer list; repository PIT research state.

SNS, forums, influencers, anonymous posts and social sentiment: **NOT USED**.
