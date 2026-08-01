# Exchange Sanction Ladder Edge

Status: `SHADOW_RESEARCH`
Priority: `MEDIUM`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-01 JST

## Research question

After a Japanese listed-company scandal is already substantially known, do later exchange-enforcement milestones create repeatable abnormal returns or tradable uncertainty-resolution effects?

The candidate ladder is:

1. first company disclosure / investigation launch,
2. investigation report,
3. earnings corrections,
4. TSE public measure / improvement-report request,
5. improvement-report submission,
6. improvement-status report roughly six months later,
7. special-alert designation / removal / delisting outcome.

This is adjacent to, but distinct from, Known-Bad Event Repricing. The latter focuses on formal corporate events such as meetings and press conferences. This edge focuses on exchange-enforcement stages that are partly rule-driven and therefore calendarable.

## Candidate mechanism

- Investors react strongly to the first scandal disclosure, but underweight later exchange measures because the underlying facts are already known.
- The exchange action can still alter state probabilities: delisting risk, financing access, governance credibility, institutional eligibility, and expected remediation cost.
- Submission of an improvement report may reduce uncertainty if the market had assigned non-zero probability to escalation.
- A later improvement-status report can reveal whether remediation is operational or merely formal.
- The edge may be asymmetric by issuer type: large liquid Prime names may show little price effect, while small Growth/Standard issuers with fragile financing may show larger responses.

## Primary-source grounding

JPX states that improvement reports are required when timely-disclosure or corporate-code violations require significant remediation. JPX also states that failure to submit, or a finding that disclosure practices are unlikely to improve, can lead to delisting. Improvement-status reports are generally required roughly six months after submission.

Recent ladder examples to seed the dataset:

- KDDI (9433): special investigation report and prior-period corrections disclosed 2026-03-31; JPX requested an improvement report and imposed a JPY 91.2m listing-agreement penalty on 2026-04-30; improvement report submitted 2026-06-02.
- nms Holdings (2162): investigation report 2026-03-16; corrections 2026-04-28 and 2026-05-11; JPX requested an improvement report and public measure on 2026-05-13; improvement report submitted 2026-06-05.
- eMnet Japan (7036): third-party report 2026-03-30; corrections 2026-03-31; JPX requested an improvement report and public measure on 2026-05-19; improvement report submitted 2026-06-16.
- J.E.T. (6228): special investigation report disclosed 2026-05-01 and prior-period corrections on 2026-05-29; JPX placed the company into a re-examination grace period for listing-application declaration violations and imposed a JPY 28.8m penalty on 2026-06-18. The underlying issue included management involvement or acquiescence in premature and deferred revenue recognition under IPO and budget pressure.
- REVOLUTION (8894): JPX designated the company as a Special Attention Security effective 2026-07-25 and imposed a listing-agreement penalty after a quarterly review report contained a disclaimer of conclusion and internal-control remediation was judged necessary. Because the designation was announced on Friday 2026-07-24 for Saturday effectiveness, the first executable market reaction belongs to the next trading session, not the formal effective date.

## Dataset contract

For each issuer-event stage, record:

- issuer, code, market segment, float, liquidity,
- misconduct class and actor,
- first-known date and event-stage date/time,
- whether new economic facts were disclosed at the stage,
- sanction type, penalty amount, submission deadline,
- penalty scaled by market capitalization, trailing operating profit, cash balance and free cash flow,
- delisting/special-alert/re-examination state before and after,
- announcement date, formal effective date and first executable trading date as separate fields,
- event-window returns: close-to-close and open-to-close for D0, D+1, D+3, D+5,
- benchmark and sector-adjusted abnormal returns,
- volume shock, gap, spread proxy, borrow availability and short cost,
- prior recovery from scandal low,
- concurrent earnings, guidance, capital actions, index changes, block trades and macro confounders,
- next-stage date and whether the stage was mechanically predictable.

## Initial hypotheses

### H1: Request-stage negative repricing

An improvement-report request accompanied by a public measure or penalty produces negative abnormal return when the market had treated the scandal as resolved.

### H2: Submission-stage uncertainty relief

Submission without materially worse facts produces neutral-to-positive abnormal return, especially where escalation risk was priced.

### H3: Small-cap financing sensitivity

Effects are larger in Growth/Standard issuers with low liquidity, weak balance sheets, or expected equity financing needs.

### H4: No standalone edge in large liquid issuers

For large Prime issuers, exchange sanctions may be economically too small relative to enterprise value, making the stage non-tradable after costs.

### H5: Status-transition dominates cash penalty

The economically relevant signal may be the change in listing-state probabilities rather than the nominal penalty. A small penalty combined with Special Attention designation, re-examination grace period or explicit delisting path may matter more than a larger penalty imposed on a highly liquid, strongly capitalized issuer.

Test sanction severity with two orthogonal variables:

- `cash_penalty_materiality`: penalty / market cap, operating profit, cash and FCF,
- `listing_state_delta`: ordinal transition in monitoring, special-attention, re-examination and delisting risk.

### H6: Announcement-to-executable-date gap

Weekend and after-hours enforcement actions create a timestamp trap. The formal designation date can differ from the first tradable session. Backtests that align returns to the effective date rather than the public announcement and next executable open can generate look-ahead or one-day shifts.

Store:

- publication timestamp,
- announced effective date,
- next market open,
- whether short inventory was available before that open,
- open-gap capture feasibility.

This is a data-integrity requirement first; only after PIT-safe alignment should a weekend-gap edge be tested.

### H7: Remediation-clock repricing

Improvement reports create a roughly six-month follow-up clock. The later improvement-status report may be partially calendarable even when the exact publication date is unknown. The candidate edge is not to trade the passage of time mechanically, but to re-rank issuers as the expected status-report window approaches:

- unresolved auditor disagreement,
- repeated filing delays,
- executive turnover without operational remediation,
- covenant or financing pressure,
- weak disclosure quality,
- prior missed remediation milestones.

The hypothesis is that unresolved names may drift negatively or react more sharply to adverse follow-up, while credible remediation can produce uncertainty relief. This must be tested against generic distress momentum.

## Historical analog expansion plan

Backfill at least four distinct enforcement classes:

1. improvement-report request and submission,
2. improvement-status report,
3. Special Attention designation and removal,
4. listing-application declaration violation / re-examination grace period.

Initial analog clusters:

- large Prime / low financing fragility: KDDI,
- small or mid-cap accounting correction: nms Holdings, eMnet Japan,
- IPO-process and management-pressure case: J.E.T.,
- explicit listing-state deterioration: REVOLUTION,
- older personal-expense or executive-control cases: Rackland,
- SPV / consolidation-control case: ENECHANGE,
- recurring remediation follow-up: Advance Create.

Do not pool these clusters before testing interaction terms. A common average may hide opposite reactions between uncertainty relief and listing-risk escalation.

## Confounders and falsification

Reject or downgrade the hypothesis if:

- abnormal returns disappear after removing concurrent earnings and guidance days,
- effects are explained only by prior momentum or liquidity,
- event timing is not known before the market close and cannot be executed without look-ahead,
- formal effective dates are mistakenly treated as publication timestamps,
- borrow cost, gap risk or spreads consume expected alpha,
- one or two distressed microcaps drive the full result,
- submission-stage reactions are indistinguishable from general recovery momentum,
- penalty amount explains nothing after controlling for listing-state transition,
- designation effects disappear after controlling for auditor opinion and filing-delay news already disclosed,
- an untouched holdout set fails.

## Entry / exit candidates

- Request stage: next open after confirmed publication; prior-close entry is prohibited unless the event was publicly known before that close.
- Submission stage: next open after confirmed publication.
- Special Attention or re-examination stage: next executable open after JPX publication, with weekend and holiday alignment explicit.
- Exit windows: D0 close, D+1 close, D+3 close, D+5 close.
- No production short signal without confirmed borrow availability and cost.
- Gap-down names must be evaluated with open-price execution, not prior-close fantasy fills.

## Promotion gate

Do not promote unless all are met:

- enough independent issuer-events across enforcement classes and market segments,
- positive net alpha after realistic execution and borrow costs,
- effect survives market/sector, momentum, distress and concurrent-event controls,
- no single issuer or enforcement class contributes a dominant share of PnL,
- untouched holdout passes,
- event timestamps and first executable sessions are point-in-time reproducible,
- edge adds information beyond Known-Bad Event Repricing, generic momentum and generic financial distress,
- listing-state delta provides incremental explanatory power over nominal penalty size.

## Current assessment

`RESEARCH CANDIDATE`, not a trading signal.

This run advanced the edge in three ways:

1. added J.E.T. and REVOLUTION as distinct enforcement-state analogs,
2. separated nominal cash penalty from listing-state probability change,
3. added announcement/effective/executable-date separation to prevent weekend and after-hours look-ahead errors.

The next task is to backfill prices, benchmark returns, announcement timestamps and borrow feasibility for the analog clusters, then test whether status transitions explain abnormal returns beyond generic distress and prior momentum.

## Source policy audit

Used: JPX enforcement rules and official enforcement pages, company disclosure chronology, market data planned.

Not used: SNS, forums, influencers, anonymous posts, social sentiment.
