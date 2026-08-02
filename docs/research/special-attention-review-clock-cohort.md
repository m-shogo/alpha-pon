# Special Attention Review Clock Cohort

Status: `SHADOW_RESEARCH_DATASET_SEED`
Parent edge: `exchange-sanction-ladder-edge.md`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-02 JST

## Purpose

Create a point-in-time-safe cohort for testing whether the rule-driven review clock of TSE Special Attention Securities contains incremental information beyond the original scandal, generic distress, auditor-opinion news and momentum.

This is not a new production edge. It is a validation cohort for the existing Exchange Sanction Ladder Edge.

## Official rule anchor

Under the post-2024 framework, TSE generally examines internal-control establishment and operation after one year has elapsed from Special Attention designation. If systems are established but operation is not yet adequate, designation can continue. If internal controls are adequate but continuity/profitability or listing-maintenance criteria remain deficient, an issuer can move into an observation phase lasting up to three fiscal years.

Therefore the research clock must separate:

- designation announcement date,
- designation effective date,
- one-year anniversary,
- internal-control confirmation filing window,
- TSE continuation/removal/delisting decision date,
- observation-stage fiscal year-end and three-month refiling deadline.

The exact decision date is not assumed in advance. Only rule-derived windows known at the historical checkpoint may be used.

## Current official cohort snapshot

| Code | Issuer | Segment | Designation date | Current stage at snapshot | Earliest rule-derived review anchor |
|---|---|---|---|---|---|
| 8894 | REVOLUTION | Standard | 2026-07-25 | improving | after 2027-07-25, exact review date unknown |
| 8746 | unbanked | Standard | 2026-05-26 | improving | after 2027-05-26, exact review date unknown |
| 4088 | Air Water | Prime | 2026-05-01 | improving | after 2027-05-01, exact review date unknown |
| 3856 | Abalance | Standard | 2026-01-31 | improving | after 2027-01-31, exact review date unknown |
| 6548 | Tabikobo | Growth | 2025-11-22 | improving | after 2026-11-22, exact review date unknown |
| 9444 | Toshin Holdings | Standard | 2025-11-22 | improving | after 2026-11-22, exact review date unknown |
| 6594 | Nidec | Prime | 2025-10-28 | improving | after 2026-10-28, exact review date unknown |
| 4813 | ACCESS | Prime | 2025-08-27 | improving | after 2026-08-27, exact review date unknown |
| 7831 | Wilco Holdings | Standard | 2024-10-26 | observation | FY end 2026-10-31, confirmation due within three months |

Snapshot source class: JPX current Special Attention list and official rule pages. Snapshot date is 2026-08-02 JST. Historical backtests must use archived snapshots rather than this current-state table.

## New validation hypothesis: review-window compression

### H8: unresolved-risk compression

As an issuer approaches a rule-derived review window, unresolved evidence may become more price-relevant because the possible TSE state transition becomes temporally concentrated.

Candidate unresolved evidence:

- disclaimer/adverse audit or review conclusion remains unresolved,
- repeated statutory filing extensions,
- restatement scope continues to expand,
- responsible executives remain influential,
- remediation milestones lack named owners, dates or measurable completion evidence,
- financing, covenant, going-concern or listing-maintenance pressure persists,
- prior remediation failed or misconduct recurred.

Candidate relief evidence:

- clean audit/review opinion restored,
- all delayed statutory filings completed,
- responsible actor separation completed,
- remediation milestones independently verified,
- no additional restatement or investigation expansion,
- profitability and listing-maintenance deficits cured.

The edge is not `buy or short at the one-year anniversary`. The test is whether a pre-registered unresolved-versus-resolved state score predicts abnormal returns or state-transition probabilities inside a PIT-safe review window.

## Required fields

For each issuer:

- designation announcement timestamp and effective date,
- governing rule version,
- anniversary and rule-derived review window known at each checkpoint,
- actual internal-control confirmation submission date,
- actual JPX decision timestamp,
- decision: remove / continue-improving / observation / delist,
- audit and review opinion ladder,
- statutory filing extensions and completion dates,
- restatement count and cumulative financial impact,
- actor separation and board changes,
- remediation specificity and verified completion,
- profitability, net assets, going-concern and listing-maintenance status,
- price, benchmark, sector, volume, spread and borrow data,
- concurrent earnings, guidance, financing, index and macro events.

## Event windows

Use several clocks rather than selecting the best result after observing outcomes:

- anniversary-centered diagnostics: `A-60`, `A-20`, `A`, `A+20`,
- confirmation-submission event: next executable open to D+1/D+5,
- JPX decision event: next executable open to D+1/D+5/D+20,
- observation-stage fiscal-year-end and refiling-deadline windows.

Primary trading tests require a public executable catalyst. Anniversary-only returns are diagnostics unless a specific, publicly known filing or decision timetable exists.

## Confounders and falsification

Reject or downgrade if:

- effects disappear after controlling for distress momentum, market capitalization and liquidity,
- auditor-opinion changes fully explain the result,
- filing-extension and earnings events overlap the measured window,
- exact review timing was not knowable and anniversary trades rely on hindsight,
- spreads, gap risk or borrow cost consume expected alpha,
- results are driven by one delisting or one microcap,
- resolved/unresolved scoring uses information published after the checkpoint,
- an untouched issuer holdout fails.

## Net Alpha and execution guard

- No prior-close fill when the TSE decision was published after close.
- Use next executable open and realistic spread/slippage.
- Require historical borrow availability for short tests.
- Treat delisting-risk names with explicit exit-liquidity and suspension scenarios.
- Report both equal-weight issuer results and liquidity-capped portfolio results.

## Immediate research queue

1. ACCESS: construct PIT snapshot before the post-2024 one-year review window.
2. Wilco Holdings: model observation-stage fiscal-year-end and three-month refiling clock separately from governance remediation.
3. Build historical controls from completed pre-2024 special-attention cases, mapped cautiously across rule-regime changes.
4. Compare state-transition score against generic financial-distress and audit-opinion models.
5. Freeze an untouched subset before collecting decision-window returns.

## Current assessment

`VALIDATION COHORT`, not a signal.

This run adds a rule-derived, PIT-safe calendar and a current cohort for the existing Exchange Sanction Ladder Edge. There is not yet evidence of positive Net Alpha, so no notification or production promotion is justified.

## Source policy audit

Used: JPX Special Attention rules, current designation list and official issuer enforcement pages.

Not used: SNS, forums, influencers, anonymous posts or social sentiment.
