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

## Dataset contract

For each issuer-event stage, record:

- issuer, code, market segment, float, liquidity,
- misconduct class and actor,
- first-known date and event-stage date/time,
- whether new economic facts were disclosed at the stage,
- sanction type, penalty amount, submission deadline,
- delisting/special-alert state before and after,
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

## Confounders and falsification

Reject or downgrade the hypothesis if:

- abnormal returns disappear after removing concurrent earnings and guidance days,
- effects are explained only by prior momentum or liquidity,
- event timing is not known before the market close and cannot be executed without look-ahead,
- borrow cost, gap risk, or spreads consume expected alpha,
- one or two distressed microcaps drive the full result,
- submission-stage reactions are indistinguishable from general recovery momentum,
- an untouched holdout set fails.

## Entry / exit candidates

- Request stage: prior close or next open only if disclosure timestamp is PIT-safe.
- Submission stage: next open after confirmed publication.
- Exit windows: D0 close, D+1 close, D+3 close, D+5 close.
- No production short signal without confirmed borrow availability and cost.

## Promotion gate

Do not promote unless all are met:

- enough independent issuer-events across market segments,
- positive net alpha after realistic execution and borrow costs,
- effect survives market/sector and concurrent-event controls,
- no single issuer contributes a dominant share of PnL,
- untouched holdout passes,
- event timestamps are point-in-time reproducible,
- edge adds information beyond Known-Bad Event Repricing and generic momentum.

## Current assessment

`RESEARCH CANDIDATE`, not a trading signal.

The useful advance is the identification of a rule-driven, multi-stage enforcement calendar that can be joined to the misconduct event ledger. The next task is to backfill JPX improvement-report, public-measure, penalty, special-alert and status-report dates, then test stage-specific abnormal returns.

## Source policy audit

Used: JPX rules and enforcement pages, company disclosure chronology, market data planned.

Not used: SNS, forums, influencers, anonymous posts, social sentiment.
