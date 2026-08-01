# Special-Attention Anniversary Cliff Edge

Status: `SHADOW_RESEARCH`
Priority: `MEDIUM`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-01 JST

## Research question

When a Japanese listed company is designated as a Special Attention Security, does the approach to the approximately one-year internal-control review point create a repeatable repricing or forced-flow edge?

This candidate is narrower than the general Exchange Sanction Ladder Edge. It focuses on the deadline-like transition from "improvement in progress" to one of the following observable states:

- designation continuation,
- designation removal,
- delisting decision,
- delayed or incomplete remediation evidence.

The economic question is whether the market underprices the rising hazard of a binary exchange decision as the review anniversary approaches, or conversely overprices delisting risk and produces a relief rally after credible remediation.

## Primary-source grounding

JPX states that Special Attention designation applies where false statements, adverse or disclaimer audit opinions, timely-disclosure violations, corporate-conduct violations, or failed remediation indicate a high need to improve internal controls. JPX also states that delisting can follow when internal controls are not expected to be appropriately established or operated.

The post-2024 designation history provides concrete outcomes and active cases:

- LIEH (5856): designated 2025-03-27; delisting decision 2026-05-25 after JPX found major deficiencies and non-performance in the improvement plan at the review point.
- Pixel Companyz (2743): designated 2025-01-29; delisting decision 2025-12-15; delisted 2026-01-16.
- Aqualine (6173): designated 2025-01-29; delisting decision 2026-04-30; delisted 2026-06-01.
- Current active examples include REVOLUTION (8894), unbanked (8746), Air Water (4088), Abalance (3856), Tabikobo (6548), Tohshin Holdings (9444), Nidec (6594), and ACCESS (4813).

These examples show that the review is not merely ceremonial: the outcome can change listing status, collateral eligibility, liquidity, institutional eligibility, financing access, and exit capacity.

## Candidate mechanisms

### H1: Hazard-rate underpricing

The market reacts to the initial designation but underweights the increasing probability of delisting as the review anniversary approaches, especially where remediation evidence remains weak.

### H2: Credible-remediation relief

Where the company publishes verifiable implementation evidence before the review point, delisting probability falls and the stock may earn a positive abnormal return before or at removal.

### H3: Forced-flow asymmetry

A delisting decision can trigger nonlinear selling because the stock may lose collateral eligibility, become unacceptable to mandates, suffer borrow or settlement constraints, and face a finite exit window.

### H4: Microcap execution failure

The apparent price edge may be untradeable because spreads, price limits, borrow scarcity, gap risk, and inability to exit dominate headline abnormal returns.

## Dataset contract

For each designation episode, record:

- issuer, code, segment, designation date and timestamp,
- statutory or exchange review milestone and expected anniversary window,
- designation reason and audit-opinion state,
- internal-control plan publication dates,
- progress-report dates and concrete implementation evidence,
- auditor changes, opinion transitions, filing delays and corrections,
- JPX inquiries, continuation, removal, delisting decision and delisting date,
- free float, liquidity, spread proxy, price-limit events, borrow availability and cost,
- collateral-eligibility changes and other forced-flow channels,
- returns and abnormal returns for D-60, D-20, D-5, D0, D+1, D+5 and through final delisting/removal,
- benchmark, sector, market-cap and distress-matched counterfactual twins,
- concurrent earnings, financing, restructuring, TOB/MBO, insolvency and macro confounders.

## Point-in-time rules

- The review anniversary must be derived only from information publicly known at the decision checkpoint.
- Do not label a company as likely to fail based on later JPX findings.
- Remediation evidence must be timestamped and categorized as `claim`, `documented implementation`, or `independently verified outcome`.
- Entry prices must use executable next-session anchors after the source timestamp.
- Delisting outcome and post-event price path remain sealed for holdout episodes.

## Candidate signals

### Negative hazard watch

Potentially stronger when all are present:

- fewer than 90 days to the expected review point,
- repeated filing delay or continuing disclaimer/adverse opinion,
- auditor resignation or unresolved scope limitation,
- remediation reports dominated by plans rather than operating evidence,
- weak financing capacity or going-concern risk,
- no credible strategic buyer or take-private path.

### Relief watch

Potentially stronger when all are present:

- audit opinion improves,
- overdue filings become current,
- independent directors, internal audit and approval controls are operating rather than merely announced,
- JPX-requested actions are completed with evidence,
- liquidity remains sufficient for entry and exit.

## Entry / exit candidates

- Research-only negative entry: next open after a PIT-safe deterioration milestone within the anniversary window.
- Research-only relief entry: next open after a PIT-safe audit-opinion improvement or documented remediation milestone.
- Exit windows: D+1, D+5, D+20, review decision, and removal/delisting decision.
- No production short without confirmed borrow availability, price-limit stress testing, and forced-cover modelling.

## Confounders and falsification

Reject or downgrade if:

- anniversary proximity adds no explanatory value beyond generic distress momentum,
- returns are driven only by financing, insolvency, earnings or takeover events,
- decision timing is too uncertain to define a tradable window,
- a few delisted microcaps dominate the result,
- net alpha disappears after spread, slippage, borrow and limit-down assumptions,
- remediation quality cannot be scored point-in-time with acceptable inter-rater consistency,
- untouched holdout episodes fail.

## Relationship to existing edges

- `Exchange Sanction Ladder Edge`: broad multi-stage exchange enforcement; this candidate isolates the deadline-like review hazard.
- `Audit Opinion Recovery Ladder Edge`: focuses on auditor opinion transitions; this candidate uses them as one predictor of the JPX review outcome.
- `Known-Bad Event Repricing Edge`: formal-event repricing; this candidate adds a calendarable hazard window and forced-flow consequence.
- `Regulatory Deadline Edge`: conceptual parent; this is the Japan-listed-company governance specialization.

## Promotion gate

Do not promote unless:

- enough completed designation episodes exist across multiple market segments,
- review-window hazard or relief effects survive distress, momentum, liquidity and concurrent-event controls,
- realistic execution and forced-exit costs leave positive net alpha,
- no single delisting episode contributes a dominant share of PnL,
- PIT reproduction and untouched holdout both pass,
- the signal adds incremental value beyond audit opinion, generic distress and the broad sanction ladder.

## Current assessment

`RESEARCH CANDIDATE`, not a trading signal.

The useful advance is converting Special Attention designation from a static red flag into a time-varying hazard model. The next task is to backfill all post-2024 designation episodes, calculate expected review windows from designation dates, and label observable remediation evidence before opening any price outcomes.

## Source policy audit

Used: JPX Special Attention rules, current and historical designation lists, JPX delisting decisions, audit-opinion lists.

Not used: SNS, forums, influencers, anonymous posts, social sentiment.
