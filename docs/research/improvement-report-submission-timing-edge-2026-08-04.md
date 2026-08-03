# Improvement-Report Submission Timing Edge

Status: `SHADOW_RESEARCH`
Priority: `LOW_TO_MEDIUM`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Created: 2026-08-04 JST

## Research question

After an exchange requests an improvement report, does the issuer's submission timing relative to the formal deadline contain incremental information about remediation readiness, disclosure quality, recurrence risk, or future listing-state escalation?

This is a narrow extension of `Exchange Sanction Ladder`, `Remediation Half-Life`, `Improvement-Status Clock Cohort`, and `Known-Bad Event Repricing`. It must not be treated as a directional signal without timestamped market, liquidity, and holdout evidence.

## Initial official analogs

The recent JPX cohort provides three clean timing patterns:

- KDDI (9433): JPX request on 2026-04-30; submission deadline 2026-06-02; improvement report submitted 2026-06-02. `deadline_slack_days = 0`.
- nms Holdings (2162): JPX request on 2026-05-13; submission deadline 2026-06-10; improvement report submitted 2026-06-05. `deadline_slack_days = 5`.
- eMnet Japan (7036): JPX request on 2026-05-19; submission deadline 2026-06-16; improvement report submitted 2026-06-16. `deadline_slack_days = 0`.

These observations are descriptive only. Three issuers are insufficient, and market-cap, case complexity, audit timing, and document length are major confounders.

## Candidate mechanism

Submission timing may reflect operational readiness rather than mere administrative speed:

1. an early filing may indicate that root-cause analysis, governance approvals, and remediation ownership were already substantially prepared before the exchange request;
2. a deadline-day filing may be neutral when the case is complex, but could also indicate unresolved internal negotiation, auditor friction, board approval delay, or weak implementation evidence;
3. a late filing or extension request, if present in older cohorts, may be a stronger adverse state transition than the ordinary report content;
4. timing should interact with report quality. Early but generic filings should not receive a positive interpretation, while deadline-day filings with strong operating evidence may be benign.

The likely value is classification and tail-risk ranking, not a standalone event-date trade.

## Required dataset fields

Add or backfill:

- `jpx_request_timestamp`;
- `submission_deadline_date`;
- `actual_submission_timestamp`;
- `deadline_slack_calendar_days`;
- `deadline_slack_trading_days`;
- `extension_requested` and `extension_reason`;
- `report_page_count` and material annex count;
- `root_cause_specificity_score`;
- `remediation_owner_named`;
- `implementation_evidence_score`;
- `board_approval_timestamp` where disclosed;
- `auditor_friction_before_submission`;
- `additional_correction_before_submission`;
- `new_loss_disclosed_with_report`;
- `listing_state_before` and `listing_state_after`;
- benchmark-adjusted D0, D+1, D+3, D+5 returns from the first executable session;
- spread, turnover, opening gap, borrow availability and borrow cost;
- market cap, segment, case complexity, number of corrected periods, and sanction severity.

## Hypotheses

### H1: Early submission plus strong evidence predicts lower recurrence risk

Positive slack has value only when paired with specific root causes, named remediation ownership, and operating evidence.

### H2: Deadline-day filing alone is not adverse

After controlling for issuer size, case complexity, correction scope, and audit dependencies, `slack = 0` should not mechanically predict downside.

### H3: Late or extended submission is a state-transition signal

A missed deadline, extension request, or incomplete filing may raise listing-state and recurrence risk even when the original misconduct is already known.

### H4: Content dominates timing for event-date alpha

Submission timing may improve future remediation classification while producing little executable abnormal return on the filing date itself.

## Confounders and counterfactual design

Control for:

- issuer size, market segment, liquidity, financing fragility and generic distress;
- investigation duration and number of corrected fiscal periods;
- auditor review dependencies and concurrent earnings deadlines;
- holidays and non-trading days inside the request window;
- whether remediation drafting began before the JPX request;
- concurrent earnings, guidance, capital actions, index changes, TOB/MBO or restructuring;
- report quality, because timing without content quality is not interpretable;
- mechanical deadline conventions that differ by enforcement category.

Counterfactual twins should match on sanction class, correction scope, segment, liquidity and case complexity, then differ primarily in deadline slack and report-quality evidence.

## Falsification and promotion constraints

Reject standalone promotion if:

- timing loses explanatory power after content-quality and complexity controls;
- no meaningful late/extension cases exist;
- abnormal returns are dominated by concurrent disclosures;
- timing is only a proxy for issuer size or liquidity;
- opening gaps, spreads or borrow costs eliminate Net Alpha;
- one issuer or one sanction class dominates;
- publication timestamps are not PIT reproducible;
- untouched holdout fails.

## Next validation step

1. Backfill all JPX improvement-report requests with request date, deadline and actual submission date.
2. Identify late filings, extension requests, incomplete submissions and repeated requests.
3. Score report content separately from timing.
4. Test recurrence, later improvement-status quality, additional corrections and listing-state escalation before testing directional returns.
5. Use first-executable-open rules and realistic costs for any event study.

## Current conclusion

`SHADOW_RESEARCH / CLASSIFICATION_CANDIDATE` only.

The recent cohort establishes that deadline slack varies even among superficially similar enforcement events, but it does not establish alpha. The most plausible incremental value is a remediation-readiness feature combining timing with report quality and subsequent recurrence, not a simple early-good / deadline-day-bad rule.

## Run audit

- New major Japanese scandal detected in this run: none confirmed from the official sources reviewed as of early 2026-08-04 JST.
- Existing hypothesis advanced: exchange-sanction and remediation-clock research gained a new timing-quality interaction variable.
- Historical analogs added: KDDI, nms Holdings, eMnet Japan submission-slack observations.
- Known-Bad Event Repricing: no promotion; event-date alpha remains unproven.
- Named Watch: no decision-changing official Sanrio or AEON update identified in this run.
- Kioxia-type / Starlink-type: not advanced in this slice.
- New niche candidate: `Improvement-Report Submission Timing`.
- Source types used: JPX official enforcement and improvement-report records.
- SNS usage: none.
