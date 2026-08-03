# Improvement-Status Clock Lag Calibration — 2026-08-04

Status: `SHADOW_RESEARCH`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Parent research: `docs/research/improvement-status-clock-cohort.md`

## Research question

Can the rule-of-thumb “roughly six months after an improvement report” be converted into a tighter, point-in-time monitoring window for Scheduled Remediation Verification research?

## Primary-source cohort

Using the official JPX improvement-report / improvement-status-report list, the following completed ordinary follow-up pairs were measured as calendar-day lags from improvement-report submission to improvement-status-report submission:

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

## Empirical calibration

- sample size: 13 ordinary completed follow-ups
- minimum: 182 calendar days
- first quartile: 185 days
- median: 189 days
- mean: 190.1 days
- third quartile: 196.5 days
- maximum: 201 days

## Research advance

The official rule says the status report is generally required promptly after six months. The completed cohort suggests a practical monitoring specification:

- `early_watch`: submission + 180 days
- `core_window`: submission + 185 through +197 days
- `late_watch`: submission +198 through +205 days
- `slippage_flag`: no filing by +205 days, unless JPX has explicitly superseded the ordinary path

This is a monitoring contract, not a trading signal. It reduces repeated broad searches and makes the forward cohort deterministic.

## 2026 forward cohort windows

| Issuer | Code | Improvement report | Early watch | Core window | Late/slippage boundary |
|---|---:|---:|---:|---:|---:|
| KDDI | 9433 | 2026-06-02 | 2026-11-29 | 2026-12-04 to 2026-12-16 | 2026-12-24 |
| nms Holdings | 2162 | 2026-06-05 | 2026-12-02 | 2026-12-07 to 2026-12-19 | 2026-12-27 |
| eMnet Japan | 7036 | 2026-06-16 | 2026-12-13 | 2026-12-18 to 2026-12-30 | 2027-01-07 |

Dates are calendar-day projections and must be adjusted only for actual publication timestamps and exchange holidays when measuring executable returns.

## New niche-edge candidate

### Remediation Filing-Lag Surprise

Hypothesis: within the pre-declared monitoring window, filing earlier than the cohort median may weakly signal operational readiness, while filing after the late-watch boundary may signal implementation friction or unresolved review work.

This candidate is distinct from the calendar itself. It tests the signed surprise:

`actual_lag_days - cohort_expected_lag_days`

Required controls:

- exchange holidays and year-end closure,
- issuer fiscal calendar and concurrent earnings,
- auditor review timing,
- explicit JPX deadline changes,
- special-attention designation or delisting path superseding the ordinary report,
- financing, restructuring and new misconduct events,
- generic distress and prior momentum.

Falsification:

- reject if lag surprise has no incremental relation to disclosure content, exchange-state transition or abnormal return;
- reject if late filings are explained entirely by holidays or scheduled earnings;
- reject if any apparent return is non-executable because information arrives after the close and gaps at the next open;
- reject if spread, liquidity or borrow costs consume net alpha;
- reject if one distressed microcap drives the result.

## Net-alpha and execution status

No return inference is made in this run. Price, benchmark, spread, borrow and announcement-time data remain unfilled. Therefore:

- confidence: `LOW_TO_MEDIUM` for calendar predictability
- confidence: `LOW` for tradable alpha
- production promotion: `BLOCKED`
- next highest-value task: backfill publication timestamps and D0/D+1/D+3/D+5 abnormal returns for the first six ordinary controls, while holding out at least three completed cases and all 2026 forward names

## Watch audit

- New major Japanese scandal detected in this run: none confirmed from the official-source search.
- Sanrio (8136): no decision-changing official update identified in this run.
- AEON (8267): no decision-changing misconduct update identified in this run.
- Existing production 12/20 misconduct score: unchanged.
- Misconduct Score v2: no state transition.
- Known-Bad Event Repricing: advanced indirectly through a tighter predictable formal-event window; no promotion.
- Kioxia-type Corporate Structure: no new state transition.
- Starlink-type Future Demand: no new state transition.

## Source policy audit

Used: JPX official enforcement rules and official improvement-report / improvement-status-report chronology.

Not used: SNS, forums, influencers, anonymous posts or social sentiment.
