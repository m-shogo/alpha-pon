# Misconduct Edge Consolidation — 2026-08-27

## Decision

`known-bad-event-repricing` is no longer an independent active Research Edge.

Its useful hypothesis — a formal event can trigger a short secondary repricing even when the bad information itself was already known — is absorbed into `misconduct-overreaction-recovery` as `phase3_formal_event_repricing`.

## Why

The two active Edge definitions shared the same issuer population, primary-information timeline, PIT timestamp requirements, known-vs-new fact decomposition, confounders and much of the same price series. Running both as separate first-class studies risked splitting one misconduct incident into two samples and double-counting evidence.

## Unified incident timeline

1. `phase1_initial_shock` — measure the first abnormal drawdown after the misconduct/governance event.
2. `phase2_damage_assessment` — classify economic damage, accounting impact, actor separability, management dependence, litigation/regulation, brand damage and balance-sheet resilience.
3. `phase3_formal_event_repricing` — at committee reports, press conferences, sanctions, court events, corrected filings or similar formal events, separate known facts from new facts and measure D+1/D+3/D+5 secondary repricing.
4. `phase4_remediation` — evaluate resignation/removal, controls, remediation evidence and recurrence risk.
5. `phase5_recovery` — measure reclaim of the pre-event close, overshoot, MAE/MFE and D+20/D+60/D+120 abnormal returns.

The former Known-Bad short route is retained only as an entry-timing/risk diagnostic inside the long-side misconduct recovery research. It is not independently promoted to BUY/SELL, order, LINE or portfolio mutation logic.

## Provenance

The old `known-bad-event-repricing` registry file remains as `deprecated` instead of being deleted so its immutable hypothesis and historical research provenance remain auditable. New samples and Promotion Gate work belong to `misconduct-overreaction-recovery`.
