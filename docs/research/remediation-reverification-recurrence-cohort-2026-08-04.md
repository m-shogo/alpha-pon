# Remediation Re-Verification Recurrence Cohort

Status: `SHADOW_RESEARCH`
Priority: `MEDIUM`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Created: 2026-08-04 JST

## Research question

Does a second exchange-requested remediation verification contain incremental downside information beyond the original misconduct, the first improvement report, and the ordinary six-month improvement-status report?

This note extends `Improvement-Status Clock Cohort`, `Remediation Half-Life`, `Exchange Sanction Ladder`, and `Known-Bad Event Repricing`. It must not be promoted as a standalone edge until timestamped abnormal-return and execution tests are complete.

## New historical analogs added

The official JPX improvement-report list supplies older completed and escalated controls that were not yet present in the initial clock cohort.

### Ordinary six-month follow-up controls

- Agile Media Network (6573): improvement report submitted 2021-09-02; improvement-status report published 2022-03-16.
- OKK (6205): improvement report submitted 2021-12-01; improvement-status report published 2022-06-15.
- MetaReal (6182): improvement report submitted 2022-01-31; improvement-status report published 2022-08-08.
- Outsourcing (2427): improvement report submitted 2022-03-08; first improvement-status report published 2022-09-22.

### Escalated or non-ordinary controls

- EduLab (4427): improvement report submitted 2022-01-25, but the ordinary status-report path was superseded by market-segment alteration, a listing-agreement violation penalty, and designation as a security on alert. Its later improvement-plan progress disclosure must not be pooled mechanically with ordinary follow-up reports.
- Outsourcing (2427): JPX later required another improvement-status report, published 2024-01-15. This is a distinct `re-verification` state and should be modeled separately from the first six-month follow-up.

## Candidate niche edge

### Remediation Re-Verification Recurrence

A second exchange-requested improvement-status report may be an adverse state transition because the original remediation evidence was not sufficient, new deficiencies emerged, or the exchange required renewed verification.

The candidate signal is not the second report date alone. It is the interaction of:

1. prior misconduct severity;
2. first remediation promises;
3. evidence of operating effectiveness after the first report;
4. recurrence, additional corrections, auditor friction, filing delay, or management concentration;
5. the exchange action that caused re-verification;
6. whether the market had already priced the renewed control weakness.

## Competing explanations and confounders

Before attributing abnormal returns to re-verification, control for:

- contemporaneous TOB, MBO, privatization, financing, restructuring, earnings, guidance, index changes, and macro shocks;
- generic distress, microcap illiquidity, prior momentum, opening gaps, and borrow unavailability;
- genuinely new loss estimates or accounting corrections disclosed with the report;
- exchange-state escalation already announced before the formal re-verification publication;
- survivorship and terminal-state bias.

Outsourcing is especially confounded by later corporate-structure events and therefore cannot establish the edge alone.

## Dataset contract additions

Add these fields to the remediation cohort dataset:

- `verification_ordinal`: 1 for first status report, 2+ for re-verification;
- `reverification_request_timestamp`;
- `reverification_reason_code`;
- `new_control_failure_since_prior_report`;
- `new_accounting_correction_since_prior_report`;
- `auditor_friction_since_prior_report`;
- `exchange_state_before` and `exchange_state_after`;
- `first_report_operating_evidence_score`;
- `second_report_operating_evidence_score`;
- `known_before_event_fraction`;
- `concurrent_structure_event`;
- executable D0, D+1, D+3, D+5 benchmark-adjusted returns;
- spread, turnover, borrow availability, borrow cost, and opening-gap execution fields.

## Hypotheses

### H1: Re-verification is an adverse state transition

Second or later exchange-requested verification events underperform ordinary first follow-ups after controlling for distress and new-loss disclosures.

### H2: The effect is conditional, not calendar-based

Any downside should concentrate in issuers with weak prior operating evidence, recurrence fingerprints, auditor friction, or new exchange escalation.

### H3: Formal-event repricing may be weak

If the re-verification request and underlying weakness were already public, the publication itself may have little incremental alpha. This would support monitoring the request/state transition rather than shorting the later report date.

### H4: Tail-risk value may exceed trade value

Even if executable Net Alpha is insufficient, re-verification may improve `BLOCK`, `ABSTAIN`, position-size, and tail-risk overrides.

## Falsification and promotion constraints

Reject standalone promotion if:

- the sample remains too small;
- abnormal returns disappear after controlling for new losses and generic distress;
- one issuer dominates;
- the only usable outcome is delisting or non-borrowable downside;
- opening gaps, borrow cost, spread, or liquidity eliminate Net Alpha;
- publication timing is not PIT-safe;
- untouched holdout fails.

## Next validation step

1. Backfill exact publication timestamps and market data for Agile Media Network, OKK, MetaReal, Outsourcing first follow-up, and Outsourcing re-verification.
2. Keep EduLab in the escalation/blocker cohort, not the ordinary average.
3. Search the full JPX archive for all issuers with more than one improvement-status report.
4. Compare first follow-up versus re-verification using matched controls and next-executable-open rules.
5. Treat the result initially as a state-transition/tail-risk feature, not a directional production signal.

## Current conclusion

`SHADOW_RESEARCH / WATCH` only. The historical expansion is useful, but there is not yet enough evidence for a tradable Edge. The strongest incremental value is likely classification of renewed remediation failure and tail-risk avoidance rather than direct event-date short alpha.

## Source policy audit

Used: JPX official improvement-report/status-report list and JPX official enforcement notices.

Not used: SNS, forums, influencers, anonymous posts, or social sentiment.
