# JPX Remediation Clock Research Log

Date: 2026-08-03 JST
Status: `SHADOW_RESEARCH`
Production use: `PROHIBITED_UNTIL_VALIDATED`

## Objective

Advance the Exchange Sanction Ladder Edge by testing whether JPX improvement-report workflows create a calendarable follow-up state that can support a distinct remediation-clock signal.

## Fresh surveillance result

No new same-day Japanese listed-company misconduct event or JPX enforcement action was confirmed in the primary-source sweep at the time of this run. No notification state transition was triggered.

## Primary-source findings

JPX's improvement-report list confirms a recurring two-stage structure:

1. an improvement report is requested and then submitted,
2. an improvement-status report is commonly submitted roughly six months later.

Current examples available in the JPX list include:

- Kasai Kogyo (7256): improvement report submitted 2025-11-11; improvement-status report submitted 2026-05-15.
- FISCO (3807): improvement report submitted 2025-10-17; improvement-status report submitted 2026-04-20.
- Advance Create (8798): improvement report submitted 2025-06-20; later improvement-status reporting recorded by JPX.
- KDDI (9433): improvement report submitted 2026-06-02; future follow-up remains a prospective calendar item.
- nms Holdings (2162): improvement report submitted 2026-06-05; future follow-up remains a prospective calendar item.
- eMnet Japan (7036): improvement report submitted 2026-06-16; future follow-up remains a prospective calendar item.

JPX's company-specific notices also confirm that the follow-up report is tied to the implementation and operational status of previously promised remediation measures, rather than merely repeating the original misconduct facts.

## Research advance

The candidate signal should be split into two different hypotheses instead of one pooled event:

### A. Pre-window deterioration signal

As the expected six-month follow-up window approaches, issuers with unresolved negative indicators may experience worsening risk perception before the formal report. Candidate indicators:

- repeated filing delays,
- continuing auditor disagreement,
- additional executive departures,
- weak disclosure quality,
- financing or covenant stress,
- missed remediation milestones,
- new control failures.

### B. Follow-up resolution signal

At the improvement-status report itself, credible evidence of implemented controls may reduce governance uncertainty. Conversely, weak or incomplete remediation may increase escalation or delisting-state risk.

These hypotheses must be tested separately because one is a drift/anticipation effect and the other is an event-reaction effect.

## Required dataset additions

Add the following fields to the enforcement-stage dataset:

- `improvement_report_date`,
- `expected_status_window_start`,
- `expected_status_window_end`,
- `actual_status_report_date`,
- `days_from_improvement_to_status`,
- `intervening_negative_control_events`,
- `auditor_state_change`,
- `filing_delay_count`,
- `executive_turnover_count`,
- `financing_stress_flag`,
- `remediation_completion_quality`,
- `new_adverse_fact_at_status_report`,
- `listing_state_delta_at_status_report`.

## Confounders and falsification

Downgrade or reject the remediation-clock edge if:

- six-month-window returns are fully explained by generic distress momentum,
- report timing is too uncertain to define a PIT-safe trade window,
- same-day earnings, financing or auditor events dominate the reaction,
- only microcap distressed issuers produce the effect,
- credible-remediation cases do not differ from incomplete-remediation cases,
- borrow cost and spreads eliminate any short-side alpha,
- untouched holdout issuers fail.

## Execution constraints

- Do not trade mechanically at exactly six months.
- Use the expected window only as a research scheduler and issuer re-ranking input.
- Entry must be based on public information available before the trade.
- Event reactions must use the first executable session after publication.
- Gap-down fills must be measured at the open, not the prior close.

## Current assessment

`PROMISING DATA-SCHEDULING FEATURE`, not a standalone production edge.

The useful finding is that JPX enforcement creates a partly predictable research calendar. The next high-value step is to backfill actual report intervals and event-window abnormal returns for at least 30 independent issuers, separated by market segment, financing fragility and remediation quality.

## Source policy audit

Used: JPX official enforcement pages and company-specific JPX notices.

Not used: SNS, forums, influencers, anonymous posts, social sentiment.
