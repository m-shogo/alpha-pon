# Improvement-Status Report Timing Calibration

- Research date: 2026-08-04 JST
- Status: `SHADOW_RESEARCH`
- Parent research: `improvement-status-clock-cohort.md`
- Production use: `PROHIBITED_UNTIL_VALIDATED`
- Source policy: JPX/TSE and company/public disclosures; SNS not used

## Question

The parent cohort used an approximate "six-month follow-up" date. For PIT-safe monitoring and Known-Bad Event Repricing research, should the expected event be modeled as one calendar date or as a publication window?

TSE explains that an issuer which submitted an improvement report is generally required to submit an improvement-status report promptly after six months. The rule therefore creates a predictable clock, but not necessarily an exact publication day.

## Completed ordinary-control sample

The following dates were transcribed from the official JPX improvement-report / improvement-status-report list. Lag is calendar days from improvement-report submission to improvement-status-report submission.

| Issuer | Code | Improvement report | Status report | Lag days |
|---|---:|---:|---:|---:|
| Advance Create | 8798 | 2025-06-20 | 2026-01-07 | 201 |
| Fisco | 3807 | 2025-10-17 | 2026-04-20 | 185 |
| Kasai Kogyo | 7256 | 2025-11-11 | 2026-05-15 | 185 |
| Santech | 1960 | 2025-03-03 | 2025-09-04 | 185 |
| Gala | 4777 | 2025-01-20 | 2025-07-23 | 184 |
| Fine Sinter | 5994 | 2024-12-20 | 2025-06-27 | 189 |
| Shinwa Wise Holdings | 2437 | 2024-12-19 | 2025-07-03 | 196 |
| ENECHANGE | 4169 | 2024-09-24 | 2025-03-25 | 182 |
| Luckland | 9612 | 2024-07-31 | 2025-02-13 | 197 |
| Tokyo Sangyo | 8070 | 2024-06-13 | 2024-12-16 | 186 |
| Image One | 2667 | 2024-03-19 | 2024-10-02 | 197 |
| ITbook Holdings | 1447 | 2023-10-26 | 2024-05-08 | 195 |
| Yamaura | 1780 | 2023-10-06 | 2024-04-12 | 189 |

## Descriptive calibration

For these 13 completed ordinary controls:

- minimum lag: **182 days**
- median lag: **189 days**
- mean lag: **190.1 days**
- maximum lag: **201 days**
- central observed cluster: roughly **184-197 days**

This is descriptive only. It is not evidence of return predictability.

## Research implication

### Reject exact-day scheduling

A single `submission date + 6 calendar months` event timestamp is too precise and can create false misses or look-ahead contamination.

### Pre-register a monitoring band

For forward shadow cases, define:

- `earliest_expected_day = submission_date + 180 days`
- `core_window = +182 through +197 calendar days`
- `late_watch = +198 through +210 calendar days`
- `clock_slippage_flag = no status report or superseding exchange-state transition by +210 days`

The +210 threshold is an operational research threshold, not a statement of a statutory deadline. It must remain shadow until the sample is expanded.

### Separate three event types

1. **ordinary status-report filing** — expected follow-up document appears;
2. **superseding escalation** — special-caution designation, renewed investigation, additional correction, delisting process or another exchange action occurs before ordinary follow-up;
3. **clock slippage** — neither ordinary filing nor a documented superseding state is observed by the pre-registered late-watch boundary.

This prevents terminal or escalation cases from being incorrectly counted as late ordinary filings.

## Forward shadow windows

Using the pre-registered day bands:

| Issuer | Code | Improvement report | Earliest +180 | Core window +182..+197 | Late-watch end +210 |
|---|---:|---:|---:|---:|---:|
| KDDI | 9433 | 2026-06-02 | 2026-11-29 | 2026-12-01 to 2026-12-16 | 2026-12-29 |
| nms Holdings | 2162 | 2026-06-05 | 2026-12-02 | 2026-12-04 to 2026-12-19 | 2027-01-01 |
| EMNet Japan | 7036 | 2026-06-16 | 2026-12-13 | 2026-12-15 to 2026-12-30 | 2027-01-12 |

These forward cases are untouched observations. Do not tune the ranges after observing their outcomes.

## Known-Bad Event Repricing integration

For each filing or superseding transition, capture:

- official publication timestamp;
- whether the event landed inside core or late-watch band;
- new facts versus previously known facts;
- promised-remediation milestone completion;
- operating-effectiveness evidence;
- auditor state and filing timeliness;
- D0, D+1, D+3 and D+5 benchmark-adjusted returns;
- 20-day pre-event abnormal drift;
- earnings, financing, index, sector and macro confounders;
- spread, liquidity, borrow availability, borrow fee and opening-gap execution.

No trade should be modeled at a price preceding the official publication timestamp.

## Falsification and capital-survival guard

Reject a timing-based Edge if:

- publication timing has no incremental information beyond generic distress or momentum;
- reactions occur only when genuinely new losses or corrections are disclosed;
- the window is too broad for executable timing;
- borrow, spread and opening gaps remove Net Alpha;
- results depend on escalation or terminal names rather than ordinary filings;
- an untouched time-split holdout fails.

The likely near-term value is **calendar prioritization and tail-risk avoidance**, not directional alpha.

## New niche candidate assessed

Candidate: `Improvement-Status Publication-Lag Edge`.

Decision: **do not register as a separate Edge yet**. The timing distribution is better treated as a calibrated feature of Scheduled Remediation Verification / Remediation Clock research. Creating another registry entry would duplicate existing hypotheses.

## Next step

1. Expand ordinary controls to at least 30 issuers.
2. Record actual publication times, not dates only.
3. Backfill abnormal returns and concurrent disclosures for the first six controls.
4. Freeze a time-split holdout before testing timing bands against returns.
5. Keep KDDI, nms Holdings and EMNet Japan untouched as forward shadow observations.

## Run audit

- New major Japanese listed-company misconduct confirmed: none from the official/current sources reviewed in this run.
- Sanrio (8136): no verified decision-changing update found.
- AEON (8267): no verified decision-changing update found.
- Historical Analog advancement: 13 completed ordinary improvement-status lags quantified.
- Known-Bad Event Repricing advancement: exact-day assumption replaced by PIT-safe monitoring bands.
- New niche Edge exploration: publication-lag candidate assessed and rejected as duplicate.
- Production score/state changes: none.
- SNS used: no.

## Official references

- JPX, improvement-report and improvement-status-report company list: https://www.jpx.co.jp/listing/measures/improvement-reports/index.html
- JPX, improvement-report framework: https://www.jpx.co.jp/equities/listing/measure/01.html
