# Audit Opinion State-Transition Edge

Status: `SHADOW_RESEARCH`
Priority: `MEDIUM`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-03 JST

## Research question

Do changes in audit-opinion state create repeatable, executable abnormal returns in Japanese equities after the underlying accounting problem is already substantially known?

The candidate state machine is:

1. clean opinion / normal review,
2. qualified opinion or qualified conclusion,
3. disclaimer of conclusion on interim or quarterly information,
4. disclaimer of opinion on annual securities reports,
5. repeated disclaimer across reporting periods,
6. restored qualified opinion,
7. restored unqualified opinion,
8. exchange escalation, special-alert designation, delisting, or other terminal outcome.

This is distinct from generic misconduct discovery. The event of interest is the auditor's formal state transition, especially when it changes the probability of financing restrictions, exchange action, institutional eligibility, covenant stress, or eventual normalization.

## Why this may be an edge

- Investors often price the first accounting scandal but may underweight the separate information in the auditor's formal opinion state.
- A disclaimer can convert a vague governance problem into a rule-sensitive capital-markets problem.
- Repeated disclaimers may contain incremental information about persistence, not merely severity.
- Restoration from disclaimer to qualified or unqualified opinion can remove a hard blocker for financing, mandate eligibility, counterparties, and exchange status.
- JPX publishes a structured, timestamped list, making the event source more point-in-time reproducible than narrative news.

## Primary-source grounding

JPX maintains a public list of listed companies whose audit or review reports contain an adverse opinion, disclaimer of opinion/conclusion, or qualified opinion/conclusion. JPX explicitly warns that an adverse opinion or disclaimer can lead to delisting when market order cannot otherwise be maintained, and can also lead to special-alert designation when internal-control remediation is required.

Current 2026 examples on the JPX list include:

- KUBOTEK (7709): disclaimer of opinion on FY2026 annual securities report, audit report dated 2026-06-26; earlier disclaimer of conclusion on FY2026 half-year information dated 2025-11-13.
- kaihan (3133): disclaimer of opinion on FY2026 annual securities report, audit report dated 2026-06-26.
- REVOLUTION (8894): disclaimer of conclusion on FY2026 half-year information dated 2026-06-15.
- Wel-Dish (2901): disclaimer of conclusion on FY2026 half-year information dated 2026-05-14.
- V-cube (3681): disclaimer of opinion on FY2025 annual securities report dated 2026-04-30.
- Toshin Holdings (9444), Abalance (3856), and others appear in recent current or archive lists.

Historical seed analogs include Ardepro (8925), Visionary Holdings (9263), Pixel Companyz (2743), EduLab (4427), Tokyo Koki (7719), Samty (3244), Wedge Holdings (2388), and Showa Holdings (5103). These must be classified by opinion path and terminal outcome before any event-return test.

Primary sources:

- https://www.jpx.co.jp/listing/others/adverse-opinion/index.html
- https://www.jpx.co.jp/listing/others/adverse-opinion/00-archives-01.html
- https://www.jpx.co.jp/listing/others/adverse-opinion/00-archives-02.html
- https://www.jpx.co.jp/listing/others/adverse-opinion/archives-03.html
- https://faq.jpx.co.jp/disclo/tse/web/category2402.html

## Dataset contract

For every issuer-report event, record:

- issuer, code, market segment, market capitalization, free float and liquidity,
- report type: annual securities report, semiannual report, quarterly report, earnings report,
- audit state before and after the event,
- audit-report date, filing timestamp and first public availability timestamp,
- exact reason for the opinion and whether the reason is new,
- scope limitation versus detected misstatement versus going-concern issue,
- affected account, subsidiary, geography and estimated monetary exposure,
- investigation status and third-party committee status,
- filing-delay history and statutory deadline extensions,
- exchange status before and after,
- auditor change before and after,
- financing need, debt maturity, covenant and equity-issuance context,
- close-to-close and open-to-close returns for D0, D+1, D+3, D+5, D+20,
- TOPIX and sector-adjusted abnormal returns,
- opening gap, intraday reversal, volume shock, spread proxy,
- borrow availability, stock-loan fee, reverse stock-loan stress and short-sale restrictions,
- concurrent earnings, guidance, capital actions, shareholder changes and macro confounders,
- terminal state: restored opinion, repeated disclaimer, special alert, delisting, acquisition, insolvency, or unresolved.

## Initial hypotheses

### H1: First annual disclaimer is more informative than an interim disclaimer

When an interim disclaimer was already known, transition to an annual disclaimer may still produce negative abnormal return if it proves that remediation did not finish before the statutory annual audit.

### H2: Repeated disclaimer is a persistence signal

A second consecutive disclaimer may predict prolonged financing constraints and exchange escalation more strongly than the first event.

### H3: Opinion restoration is an uncertainty-resolution event

Transition from disclaimer to qualified or unqualified opinion may create positive abnormal return, particularly in issuers where financing or exchange status was the dominant blocker.

### H4: Reason taxonomy dominates headline severity

A scope limitation caused by unavailable evidence may have different persistence from a disclaimer tied to management obstruction, related-party transactions, cash verification, or broad internal-control failure.

### H5: Small-cap execution costs may erase headline alpha

The strongest raw reactions may occur in illiquid distressed names where gaps, spreads, borrow unavailability and position limits make the result non-executable.

## Candidate features

- `opinion_state_from`
- `opinion_state_to`
- `transition_severity`
- `repeat_count`
- `days_since_first_abnormal_opinion`
- `annualization_flag`
- `reason_taxonomy`
- `management_obstruction_flag`
- `cash_verification_flag`
- `related_party_flag`
- `subsidiary_scope_flag`
- `auditor_change_within_180d`
- `filing_extension_count_365d`
- `exchange_escalation_probability`
- `financing_need_12m`
- `restoration_evidence_strength`

## Confounders and falsification

Reject or downgrade the edge if:

- reactions disappear after controlling for simultaneous earnings, guidance or financing disclosures,
- audit-opinion events merely restate fully priced investigation reports,
- event timestamps cannot be reconstructed without look-ahead,
- raw returns are driven by delisting-bound microcaps,
- restoration returns are explained by concurrent recapitalization or takeover announcements,
- borrow and spread costs consume expected short alpha,
- performance fails across untouched issuer and calendar holdouts,
- opinion-state features add no information beyond generic distress, momentum, liquidity and prior drawdown.

## Entry and exit candidates

- Negative transition: next open after a PIT-safe filing or JPX publication; never assume prior-close execution when publication was after close.
- Positive restoration: next open after the clean or improved opinion is publicly confirmed.
- Test exits at D0 close, D+1, D+3, D+5 and D+20.
- No production short signal without confirmed borrow availability and realistic gap/slippage assumptions.

## Counterfactual Twin design

For each event, match a listed company on:

- market segment and size,
- liquidity and prior volatility,
- prior 20-day and 60-day return,
- financial distress and financing need,
- accounting-restatement status,
- absence of an audit-opinion transition in the same event window.

Also compare within issuer across first disclaimer, repeated disclaimer and restoration events where available.

## Holdout design

- Development set: events through 2023.
- Validation set: 2024-2025.
- Untouched temporal holdout: 2026 onward.
- Separate issuer holdout for names with repeated events.
- Keep delisted issuers in the dataset to avoid survivorship bias.

## Promotion gate

Do not promote unless:

- enough independent state transitions exist across report types and market segments,
- state-transition features add incremental predictive value after generic distress controls,
- net alpha remains positive after spreads, gaps, borrow and position-size limits,
- no one issuer or terminal delisting cohort dominates PnL,
- both temporal and issuer holdouts pass,
- PIT timestamps and opinion taxonomy are reproducible,
- the edge is distinct from Exchange Sanction Ladder and Known-Bad Event Repricing.

## Current assessment

`RESEARCH CANDIDATE`, not a trading signal.

The immediate research value is a structured state machine backed by a JPX-maintained source. The next step is to backfill current and archived JPX lists into an issuer-event ledger, identify every restoration event, and test whether transitions add explanatory power beyond generic distress and scandal chronology.

## Source-policy audit

Used: JPX current and archived audit-opinion lists, JPX disclosure guidance.

Not used: SNS, forums, influencers, anonymous posts, social sentiment.
