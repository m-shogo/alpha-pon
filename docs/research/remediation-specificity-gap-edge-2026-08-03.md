# Remediation Specificity Gap Edge

Status: IDEA / SHADOW RESEARCH ONLY
Date: 2026-08-03
Production impact: none
SNS used: no

## Research question

After a listed company is required by JPX to submit an improvement report, does the *specificity and verifiability* of the remediation plan predict subsequent governance resolution, disclosure reliability, and abnormal return better than the mere fact that an improvement report was filed?

This is a narrow extension of the existing Response Quality Signal and remediation-clock work. It must not be merged into production scoring until a PIT-safe cohort and untouched holdout pass exist.

## Hypothesis

A remediation report with named owners, dated milestones, measurable control changes, independent verification, board-level escalation, and explicit residual-risk disclosure should resolve uncertainty faster than a report dominated by generic training, awareness, or policy language.

Candidate cross-sectional signal:

`specificity_gap = promised_specificity - subsequently_verified_execution`

The potentially useful edge is not "good wording wins." It is the divergence between concrete promises and later observable execution. A large positive gap may forecast delayed resolution, repeat disclosure failures, or negative repricing around the next improvement-status report, audit opinion, filing delay, or exchange review event.

## Why this may be distinct

Existing clock edges primarily model timing and stage transitions. This candidate models *content-to-execution divergence* inside the clock:

1. report filed,
2. promises encoded PIT-safe,
3. subsequent official disclosures checked,
4. verified completion compared with promises,
5. market reaction measured only after the verification event becomes public.

This should be treated as an interaction feature, not a standalone short signal.

## Initial official cohort anchors

JPX currently lists recent improvement-report cases including KDDI (9433), nms Holdings (2162), and EMNET JAPAN (7036). JPX states that these cases arose from disclosure-control deficiencies and material false or corrected disclosures. Older improvement-status reports provide candidate follow-up observations.

Official sources:

- JPX improvement report / improvement status report list: https://www.jpx.co.jp/listing/measures/improvement-reports/index.html
- KDDI improvement report publication notice, 2026-06-02: https://www.jpx.co.jp/news/1023/20260602-12.html
- nms Holdings improvement report request and public measure, 2026-05-13: https://www.jpx.co.jp/news/1023/20260513-13.html
- EMNET JAPAN improvement report request and public measure, 2026-05-19: https://www.jpx.co.jp/news/1023/20260519-12.html

These sources establish the cohort and official reasons only. They do not establish alpha.

## PIT-safe feature schema

Capture only text and facts public by `observed_at`.

### Promise specificity

- `named_accountable_owner`
- `board_reporting_cadence_days`
- `dated_milestones_count`
- `quantified_kpi_count`
- `control_design_change_count`
- `independent_assurance_committed`
- `subsidiary_scope_explicit`
- `residual_risk_disclosed`
- `budget_or_headcount_committed`
- `completion_definition_present`

### Execution verification

- `milestones_due_count`
- `milestones_verified_complete_count`
- `milestones_delayed_count`
- `independent_assurance_delivered`
- `repeat_correction_or_delay`
- `audit_opinion_state_change`
- `exchange_state_change`
- `management_or_remediation_team_attrition`

### Derived values

- `promise_specificity_score`
- `verified_execution_score`
- `specificity_gap`
- `days_to_first_verified_milestone`
- `days_to_next_adverse_control_event`

Do not score polished language, document length, or consultant-style terminology by itself.

## Event study design

Primary events:

- improvement report publication,
- improvement-status report publication,
- first officially verified milestone,
- disclosed delay or non-completion,
- audit opinion change,
- renewed JPX measure or special-attention transition.

Windows:

- intraday where timestamp is known,
- close-to-close `[0, +1, +3, +5]`,
- medium horizon `+20, +60` trading days for resolution only.

Benchmarks:

- TOPIX,
- sector index,
- size/liquidity matched control,
- Counterfactual Twin with similar restatement severity and exchange stage but different specificity gap.

## Confounders

Mandatory controls:

- earnings and guidance on the same day,
- magnitude of accounting correction,
- financing, dilution, covenant, or going-concern news,
- parent/subsidiary transaction,
- audit firm change,
- index rebalance and forced flow,
- market-wide shock,
- borrow availability and short-sale restrictions,
- pre-event rebound from the original scandal low.

## Falsification

Reject or merge this edge if:

- specificity score only proxies for company size or disclosure budget,
- market reaction occurs before verification becomes public,
- report language cannot be encoded reproducibly by two independent raters,
- no incremental explanatory value remains after restatement severity, exchange stage, liquidity, and audit state,
- net alpha after spread, slippage, borrow, and execution delay is non-positive,
- the signal is dominated by one company or one event type.

## Capital-survival gate

Before any promotion:

- freeze an untouched holdout by event date,
- preregister feature extraction and missing-data rules,
- require inter-rater agreement for manual labels,
- cap exposure by liquidity and event clustering,
- test long and short implementations separately,
- model publication timestamps and tradable entry precisely,
- apply multiple-hypothesis correction across remediation-related edges,
- assess correlation with remediation-clock, audit-opinion, sanction-ladder, and response-quality signals.

## Current conclusion

This is a valid new research candidate but not yet a tradable edge. The immediate value is a structured content-to-execution dataset that can distinguish ceremonial remediation from verifiable remediation without using SNS or subjective reputation signals.

## Next sample acquisition

1. Encode the recent JPX cohort using the schema above.
2. Add at least 20 historical improvement-report / improvement-status pairs.
3. Blind-label five reports with two raters and measure agreement.
4. Join official milestone dates to PIT market data.
5. Run incremental tests against existing remediation-clock features.
6. Reject, merge, or advance only after cost-aware out-of-sample evidence.
