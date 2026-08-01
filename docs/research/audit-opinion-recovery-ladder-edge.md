# Audit Opinion Recovery Ladder Edge

Status: `SHADOW_RESEARCH`
Priority: `MEDIUM`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-01 JST

## Research question

When a Japanese listed company receives an adverse audit signal such as a disclaimer of opinion, qualified opinion, or review conclusion disclaimer, do later audit-status transitions create repeatable abnormal returns that are distinct from the original misconduct shock and from generic distress momentum?

Candidate ladder:

1. first accounting concern or investigation disclosure,
2. delayed filing or restatement risk,
3. disclaimer / qualified opinion / adverse opinion,
4. exchange action or special-alert designation,
5. remediation disclosure and auditor cooperation,
6. later filing with improved audit opinion,
7. special-alert removal, continued designation, or delisting.

This edge is adjacent to Exchange Sanction Ladder and Uncertainty Resolution, but the causal state variable is specifically whether an independent auditor is willing to provide assurance.

## Why it may exist

- The first scandal often dominates attention, while the later audit opinion may alter financing access, covenant risk, institutional eligibility, and delisting probabilities.
- A disclaimer can be more economically important than a small restatement because it signals unverifiable financial statements rather than a bounded accounting error.
- Conversely, restoration to an unqualified opinion may sharply reduce tail risk even if headline earnings remain weak.
- Calendarability may improve after the first filing because later statutory filing deadlines and remediation milestones are partly known.

## Primary-source grounding

JPX maintains a public list of listed companies whose financial statements or interim statements carry adverse, disclaimer, or qualified audit opinions, specifically to alert investors. As of late July 2026, the list includes Kubotek (7709) and Kaihan (3133) for fiscal 2026 annual reports with disclaimers dated 2026-06-26.

JPX also uses audit conclusion disclaimers and internal-control deficiencies as grounds for exchange measures. REVOLUTION (8894) was designated a special-alert security effective 2026-07-25 after a disclaimer in its interim review report and findings that internal management systems required substantial improvement.

These examples support a measurable state-transition dataset, but they do not establish profitability.

## Dataset contract

For each issuer-stage event, record:

- issuer, code, market segment, liquidity, free float,
- accounting issue class and responsible actor,
- first-known timestamp and each audit-stage timestamp,
- audit firm and opinion type,
- whether the opinion is company-wide, subsidiary-specific, annual, interim, or internal-control related,
- filing delay, restatement amount, going-concern language, covenant or financing exposure,
- exchange designation, improvement-report requirement, penalty, filing deadline, and delisting state,
- event returns for D0, D+1, D+3, D+5, D+20,
- TOPIX and sector-adjusted abnormal returns,
- prior decline and recovery from scandal low,
- volume shock, gap, spread proxy, borrow availability, borrow cost,
- concurrent earnings, guidance, financing, restructuring, index, or macro confounders,
- next opinion transition and whether it was forecastable without look-ahead.

## Initial hypotheses

### H1: First disclaimer is a tail-risk repricing event

A first disclaimer or conclusion disclaimer produces negative abnormal return beyond the original misconduct disclosure when it increases delisting, financing, or unverifiable-balance-sheet risk.

### H2: Opinion restoration is an uncertainty-resolution event

Transition from disclaimer or qualified opinion to unqualified opinion produces positive abnormal return when the market had priced persistent audit failure.

### H3: Exchange designation interaction

The combined state of audit disclaimer plus special-alert designation is more informative than either signal alone.

### H4: Distress and liquidity explain much of the apparent alpha

After controlling for microcap distress, financing announcements, and prior momentum, standalone audit-opinion effects may disappear. This is a key null hypothesis, not a secondary concern.

## Confounders and falsification

Reject or downgrade if:

- returns are explained by concurrent earnings, financing, or restructuring news,
- event timestamps are only known after the executable trading window,
- apparent alpha is driven by one or two illiquid microcaps,
- borrow, spreads, gaps, or price limits consume expected short alpha,
- restoration effects are indistinguishable from generic bankruptcy-risk recovery,
- audit-opinion state adds no information beyond Exchange Sanction Ladder,
- an untouched chronological holdout fails.

## Entry / exit candidates

- Negative event: next executable open after confirmed audit opinion publication.
- Positive transition: next executable open after an improved opinion or exchange-state relief is confirmed.
- Diagnostic exits: D0 close, D+1, D+3, D+5, D+20.
- No production short without confirmed borrow availability, price-limit handling, and realistic gap assumptions.

## Required controls

- matched distressed issuers without adverse opinions,
- issuers with adverse opinions but no exchange designation,
- issuers with exchange measures but clean audit opinions,
- large liquid versus small illiquid issuers,
- accounting fraud versus evidence-scope limitation versus going-concern uncertainty.

## Promotion gate

Do not promote unless:

- enough independent events exist across opinion types and market segments,
- market/sector-adjusted net alpha survives execution costs,
- no single issuer dominates PnL,
- PIT timestamps and executable entries are reproducible,
- the edge adds incremental information beyond generic distress, Known-Bad Event Repricing, and Exchange Sanction Ladder,
- untouched chronological holdout passes,
- tail-loss and delisting scenarios are explicitly modeled.

## Current assessment

`RESEARCH CANDIDATE`, not a trading signal.

The practical advance is a new state variable: independent-auditor assurance status. Next work is to backfill JPX adverse-opinion history, join it to exchange measures and filing deadlines, then test transition-specific abnormal returns with matched distress controls.

## Source policy audit

Used: JPX adverse-opinion list, JPX exchange-measure disclosures, company filings planned, market data planned.

Not used: SNS, forums, influencers, anonymous posts, social sentiment.
