# Remediation Clock Surprise Edge

Status: `SHADOW_RESEARCH`
Priority: `MEDIUM`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-02 JST

## Research question

When JPX requires an improvement report after a listed-company disclosure failure, the later improvement-status report is generally expected roughly six months after submission. Can the market misprice the difference between:

1. a mechanically predictable reporting date, and
2. genuinely new evidence about whether remediation is operating effectively?

The candidate edge is not to trade the calendar alone. It is to separate predictable publication from content surprise and identify issuers where unresolved control weaknesses make the follow-up report economically informative.

## Why this is distinct

This edge is adjacent to the Exchange Sanction Ladder Edge but narrower:

- Exchange Sanction Ladder studies stage transitions such as request, submission, Special Attention designation and delisting-risk changes.
- Remediation Clock Surprise studies the roughly six-month follow-up stage and asks whether the market distinguishes formal completion from operational remediation.
- Remediation Specificity Gap studies the quality of promised measures at the initial response stage.

The incremental signal must therefore come from the gap between prior remediation commitments and later evidence of actual operation.

## Primary-source grounding

JPX maintains a public list of companies required to submit improvement reports and improvement-status reports. Recent follow-up examples include:

- Advance Create (8798): improvement report submitted 2025-06-20; improvement-status report submitted 2026-01-07.
- Fisco (3807): improvement report submitted 2025-10-17; improvement-status report submitted 2026-04-20.
- Kasai Kogyo (7256): improvement report submitted 2025-11-11; improvement-status report submitted 2026-05-15.

The existence of an approximately six-month follow-up schedule makes the event window partly calendarable, while report content remains uncertain.

## Candidate mechanism

Markets may underweight the follow-up because the original accounting or disclosure problem is already old news. However, the status report can update:

- whether redesigned controls are actually operating,
- whether staffing and authority concentration were corrected,
- whether auditor concerns remain,
- whether repeated filing or disclosure failures occurred,
- whether responsible executives remain in control,
- whether remediation depends on temporary consultants,
- whether financing or covenant pressure limits implementation,
- whether the company completed only formal documentation rather than operational change.

A predictable date with uncertain operational evidence creates a potential content-surprise event rather than a pure calendar effect.

## Dataset contract

For each issuer, record:

- issuer, code, market segment and liquidity,
- initial misconduct class and actor,
- improvement-report request date,
- improvement-report submission date,
- expected six-month window,
- actual improvement-status publication timestamp,
- initial remediation commitments as structured fields,
- status-report evidence for each commitment,
- completion state: implemented / partly implemented / delayed / not evidenced,
- operating-evidence strength,
- repeated disclosure, filing, audit or control incidents before follow-up,
- executive turnover and authority redistribution,
- auditor opinion and key audit developments,
- D0, D+1, D+3 and D+5 returns using the first executable session,
- TOPIX and sector-adjusted abnormal returns,
- volume, spread, gap and liquidity proxies,
- borrow availability and cost where a short hypothesis is tested,
- concurrent earnings, guidance, financing, index and macro confounders.

## Shadow features

### `remediation_commitment_coverage`

Share of the original root causes addressed by explicit remediation commitments.

### `operating_evidence_ratio`

Share of commitments supported by evidence of repeated operation rather than policy creation alone.

### `deadline_slippage`

Delay versus the expected follow-up window or versus milestones stated in the original report.

### `repeat_failure_flag`

Whether a new disclosure, filing, audit or control failure occurred before the status report.

### `temporary_support_dependency`

Whether control operation remains dependent on external advisers, temporary staffing or exceptional manual review.

### `authority_deconcentration_delta`

Change in concentration of decision rights, accounting authority and information access around the implicated executive or department.

### `remediation_surprise_score`

Difference between pre-event expected remediation quality and evidence observed in the status report. This must be generated from point-in-time information available before publication, not retrospectively fitted language.

## Initial hypotheses

### H1: Weak operating evidence produces negative repricing

Status reports dominated by policy creation, training counts or committee formation, without evidence of repeated control operation, produce negative abnormal returns after controlling for prior distress.

### H2: Credible completion produces uncertainty relief

Reports showing operating evidence, independent verification, authority redistribution and no recurrence produce neutral-to-positive abnormal returns where escalation risk had remained priced.

### H3: Repeat failure dominates report language

A repeated filing, audit or disclosure failure before the follow-up should dominate optimistic remediation wording and predict a weak response.

### H4: Calendar alone has no alpha

Entering solely because six months have elapsed should not survive costs. Any edge must come from issuer-level preconditions and content surprise.

### H5: Small, financing-fragile issuers react more

The effect should be larger where listing credibility, lender confidence or equity financing access is economically important.

## Entry and exit candidates

- No pre-publication position based only on the expected date.
- Primary test: next open after confirmed publication and PIT-safe parsing.
- Secondary test: D0 close only where publication occurs during market hours and executable timestamps are reliable.
- Exit windows: D+1, D+3 and D+5 close.
- No production short without borrow availability, realistic spread and gap-risk treatment.

## Confounders and falsification

Reject or downgrade if:

- returns disappear after excluding concurrent earnings, guidance or financing events,
- generic distress momentum explains the full effect,
- report language cannot be scored reproducibly without hindsight,
- publication timestamps cannot be aligned to the first executable session,
- small illiquid issuers dominate gross returns but fail after costs,
- operating-evidence features add no value beyond the original misconduct severity,
- an untouched issuer holdout fails,
- positive and negative content surprises are not distinguishable before observing returns.

## Counterfactual design

For each follow-up event, select twins matched on:

- market segment and size,
- original misconduct class,
- initial correction magnitude,
- prior six-month return and volatility,
- liquidity and financing fragility,
- original remediation specificity,
- auditor-opinion state.

Compare issuers with strong versus weak operating evidence inside the same enforcement stage rather than pooling all status reports.

## Promotion gate

Do not promote unless:

- there are enough independent follow-up events across years and market segments,
- content features are point-in-time reproducible,
- abnormal returns survive market, sector, momentum, distress and concurrent-event controls,
- net alpha remains positive after spreads, gaps and borrow costs,
- no single issuer drives the result,
- an untouched holdout passes,
- the signal adds incremental value beyond Exchange Sanction Ladder and Remediation Specificity Gap.

## Current assessment

`RESEARCH CANDIDATE`, not a trading signal.

This run identified a narrow, testable distinction: the six-month reporting clock is predictable, but operational-remediation evidence is not. The next step is to backfill the Advance Create, Fisco and Kasai Kogyo report pairs, encode initial commitments versus follow-up evidence, and test content surprise rather than calendar timing.

## Source policy audit

Used: JPX improvement-report and improvement-status-report records, official company disclosure chronology planned, market data planned.

Not used: SNS, forums, influencers, anonymous posts or social sentiment.
