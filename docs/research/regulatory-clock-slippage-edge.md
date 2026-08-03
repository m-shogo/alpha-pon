# Regulatory Clock Slippage Edge

Status: `SHADOW_RESEARCH`
Priority: `MEDIUM`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-03 JST

## Research question

When an exchange-mandated remediation milestone approaches, does delayed or missing publication create a repeatable negative information signal before formal escalation?

This is distinct from the Exchange Sanction Ladder Edge. The ladder studies the reaction to published enforcement stages. This hypothesis studies the information contained in the *absence* or lateness of a required follow-up.

## Primary-source basis

JPX states that an issuer required to submit an improvement report is also expected to submit an improvement-status report promptly after six months have elapsed. JPX also states that failure to submit an improvement report, or a determination that disclosure practices are unlikely to improve, can lead to delisting.

Authoritative references:

- https://www.jpx.co.jp/equities/listing/measure/01.html
- https://www.jpx.co.jp/listing/measures/improvement-reports/index.html

The six-month rule provides a calendarable review window, but the word `promptly` does not create an exact public deadline. Therefore this hypothesis must not fabricate a deadline or treat non-publication on the six-month anniversary as a breach.

## Candidate mechanism

- Timely submission indicates that remediation governance, documentation, external-auditor coordination and board oversight are functioning.
- Delay may reveal unresolved control deficiencies, incomplete remediation evidence, management disagreement, auditor friction, insufficient staffing or a new incident.
- The market may underweight the follow-up clock because the original misconduct is already old news.
- Smaller issuers with weak finance functions may have more informative slippage than large Prime issuers.
- A delayed report may be especially informative when combined with filing extensions, auditor changes, qualified opinions, new related-party transactions or management turnover.

## Signal definition

Do not use a binary `late` flag based only on the six-month anniversary.

For each issuer, construct a PIT-safe state machine:

1. `REPORT_SUBMITTED`: improvement report publication confirmed.
2. `SIX_MONTH_WINDOW_OPEN`: six months elapsed; internal monitoring starts.
3. `FOLLOW_UP_CONFIRMED`: improvement-status report published.
4. `EXPLICIT_EXTENSION_OR_DELAY`: company or JPX publicly confirms delay, extension or inability to complete.
5. `ESCALATION`: additional public measure, special-alert designation, adverse audit development or delisting-related action.
6. `UNKNOWN`: no public evidence sufficient for classification.

Only states 4 and 5 are candidate tradable negative events. State 2 alone is a monitoring trigger, not a short signal.

## Dataset contract

Record:

- issuer, code, segment, market cap, free float and liquidity,
- original misconduct class and actor,
- improvement-report request date, due date and submission date,
- six-month anniversary and monitoring-window start,
- improvement-status report publication date/time,
- explicit delay/extension disclosure date/time and wording,
- auditor, audit opinion and auditor-change history,
- filing-extension history,
- management turnover and related-party transactions,
- concurrent earnings, guidance, financing, index and macro confounders,
- D0, D+1, D+3, D+5 abnormal returns,
- volume shock, spread, borrow availability and short cost,
- eventual outcome: normal follow-up, escalation, special alert, delisting or clean closure.

## Initial hypotheses

### H1: Explicit delay is informative

A public statement that a mandated remediation follow-up cannot be completed on schedule produces negative abnormal returns, especially when accompanied by unresolved audit or control issues.

### H2: Silent anniversary is not enough

The six-month anniversary without publication does not produce reliable alpha because JPX uses a non-exact `promptly` standard and publication timing can vary operationally.

### H3: Compound-warning interaction

The signal is materially stronger when slippage co-occurs with at least one independent warning:

- filing deadline extension,
- auditor resignation/change,
- qualified, adverse or disclaimer opinion,
- new investigation,
- management departure,
- capital-raising stress,
- related-party transaction concern.

### H4: Small-issuer asymmetry

The effect is larger for Standard/Growth issuers with concentrated control and weak finance staffing than for large liquid Prime issuers.

## Falsification

Reject or downgrade if:

- publication lags show no relationship with later escalation,
- reactions disappear after controlling for concurrent filings and liquidity,
- the apparent edge is driven by microcap spreads or non-borrowable names,
- exact publication expectations cannot be reconstructed point-in-time,
- a small number of delisting cases dominate results,
- holdout events do not reproduce the interaction effect,
- realistic execution costs consume expected alpha.

## Entry and exit candidates

- No entry on the six-month anniversary alone.
- Candidate entry only after a confirmed public delay, extension, inability-to-complete disclosure or formal escalation.
- Earliest executable entry is the next liquid session after the timestamp is public and PIT-safe.
- Test D0 close, D+1, D+3 and D+5 exits.
- No production short without confirmed borrow availability, cost and gap-risk controls.

## Relationship to existing research

- `improvement-status-report-calendar.md`: supplies monitoring windows.
- `exchange-sanction-ladder-edge.md`: studies published enforcement stages.
- `filing-deadline-extension-escalation-edge.md`: provides a compound-warning feature.
- `audit-opinion-recovery-ladder-edge.md`: provides audit-state interactions.
- `remediation-half-life-edge.md`: provides recurrence and durability labels.

The incremental question is whether clock slippage adds predictive information after those states are controlled.

## Current assessment

`RESEARCH CANDIDATE`, not a trading signal.

The key advance is a guard against a dangerous false signal: absence of a report exactly six months later is not itself evidence of breach. The useful candidate signal is explicit slippage or escalation, particularly when joined with an independent audit, filing or governance warning.

## Next work

1. Backfill historical improvement-report and improvement-status-report intervals from JPX.
2. Estimate the empirical distribution of normal publication lag after six months.
3. Identify explicit delay or extension disclosures.
4. Join audit-opinion, filing-extension and management-change states.
5. Test abnormal returns and later escalation probabilities.
6. Reserve untouched issuers for holdout.

## Source policy audit

Used: JPX rules and issuer/public-market data planned.

Not used: SNS, forums, influencers, anonymous posts or social sentiment.
