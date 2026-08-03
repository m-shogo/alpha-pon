# Exchange Sanction Remediation Clock — Seed Queue

Status: `SHADOW_RESEARCH`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-03 JST

## Purpose

Create a point-in-time-safe queue for the approximately six-month improvement-status-report stage that follows a TSE improvement report. This extends `exchange-sanction-ladder-edge.md` without creating a separate production edge.

The research question is whether the follow-up stage contains incremental information beyond generic distress, prior momentum, and the original misconduct disclosure.

## Rule grounding

TSE states that, after an issuer submits an improvement report concerning timely disclosure or corporate-code violations, an improvement-status report is generally required promptly after six months have elapsed. Failure to submit an improvement report, or a determination that disclosure practices are unlikely to improve, can lead to delisting. The exact follow-up publication date is not known in advance, so the six-month point is a monitoring window, not a tradable timestamp.

## 2026 seed cohort

| Issuer | Code | Improvement report submitted | Approx. six-month window begins | Enforcement class | Initial research note |
|---|---:|---:|---:|---|---|
| KDDI | 9433 | 2026-06-02 | 2026-12-02 | improvement report + JPY 91.2m listing-agreement penalty | Large Prime control; nominal penalty likely immaterial relative to enterprise value. Test disclosure-quality and remediation evidence, not penalty size. |
| nms Holdings | 2162 | 2026-06-05 | 2026-12-05 | improvement report + public measure | Subsidiary loss recognition and authority concentration. Test whether operational remediation is evidenced beyond policy changes. |
| eMnet Japan | 7036 | 2026-06-16 | 2026-12-16 | improvement report + public measure | Former CFO override, concealment and personal-account transfers. Higher recurrence sensitivity because the misconduct involved management override. |

These dates are monitoring anchors only. Entry cannot be assigned until the actual JPX/company publication timestamp is captured.

## PIT event contract

For each follow-up event store:

- `improvement_report_submitted_at`
- `six_month_anchor_date`
- `status_report_published_at`
- `first_executable_open`
- `source_url`
- `new_negative_fact`
- `new_positive_fact`
- `remediation_evidence_strength`
- `management_override_residual_risk`
- `auditor_or_filing_confounder`
- `earnings_or_guidance_confounder`
- `market_and_sector_return`
- `d0`, `d1`, `d3`, `d5` abnormal returns
- `open_gap`, spread proxy, liquidity and borrow cost

## Shadow hypotheses

### H1 — adverse verification asymmetry

A status report that reveals delayed, incomplete or merely formal remediation may cause a larger negative reaction than an equally positive report causes relief, because the original scandal already established a prior for weak controls.

### H2 — management-override recurrence premium

Cases involving senior-management override, concealment or personal benefit should carry higher residual risk than process-error cases, even after an improvement report is filed.

### H3 — large-cap attenuation

Large liquid issuers may show little tradable reaction after costs unless the follow-up changes earnings, auditor, financing or listing-state probabilities.

### H4 — calendar window has no standalone alpha

The six-month anchor itself should have no production signal. Any apparent pre-window drift must survive controls for distress, prior momentum, earnings calendars, borrow availability and liquidity.

## Falsification and confounders

Reject or downgrade the follow-up-stage hypothesis if:

- returns are explained by earnings or guidance released near the same date,
- effects vanish after controlling for prior momentum and financial distress,
- the sample is driven by one microcap,
- publication timestamps cannot be reconstructed point-in-time,
- open gaps consume the apparent prior-close return,
- borrow or spread costs remove net alpha,
- remediation scoring is hindsight-labeled from later outcomes,
- the untouched holdout cohort fails.

## Next data task

1. Backfill historical improvement-status reports from JPX.
2. Separate issuer types: large Prime, ordinary accounting correction, management override, repeated control failure, and explicit listing-state deterioration.
3. Capture actual publication timestamps and first executable sessions.
4. Test whether `remediation_evidence_strength` adds explanatory power beyond generic distress and prior momentum.
5. Keep this stage merged into the Exchange Sanction Ladder until incremental net alpha is demonstrated.

## Current decision

`NO USER ALERT` and `NO PRODUCTION PROMOTION`.

This run found no verified same-day Japanese listed-company misconduct event that changes a current investment state. The substantive advance is a PIT-safe, calendarable research queue for the next enforcement-verification stage.

## Source policy audit

Used: JPX rules and official improvement-report/company chronology pages.

Not used: SNS, forums, influencers, anonymous posts, social sentiment.
