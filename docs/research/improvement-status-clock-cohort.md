# Improvement-Status Clock Cohort

Status: `SHADOW_RESEARCH`
Priority: `MEDIUM`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-03 JST

## Purpose

Operationalize the six-month remediation follow-up embedded in TSE improvement-report enforcement. This is not a separate production edge yet. It is a calendarable cohort extension of Exchange Sanction Ladder and Remediation Half-Life research.

TSE states that, after an improvement report is submitted, an improvement-status report is generally required promptly after six months. TSE also states that failure to submit an improvement report, or a conclusion that disclosure practices are unlikely to improve, can lead to delisting. The follow-up window therefore changes the information set even when the original misconduct is already known.

## Candidate edge

### Scheduled Remediation Verification

As the expected six-month follow-up window approaches, issuers may separate into two groups:

- `credible remediation`: operational controls, independent approval, system restrictions, stable audit process, timely filings and transparent disclosure;
- `paper remediation`: policies, committees and training without evidence of operating effectiveness, recurring delays, management concentration, auditor friction or repeated related-party risk.

The candidate signal is not the calendar date alone. It is the interaction between a predictable verification window and unresolved evidence.

## Initial 2026 forward cohort

Seed the forward calendar from the official TSE improvement-report list:

- KDDI (9433): improvement report submitted 2026-06-02; expected follow-up zone begins around early December 2026.
- nms Holdings (2162): submitted 2026-06-05; expected follow-up zone begins around early December 2026.
- eMnet Japan (7036): submitted 2026-06-16; expected follow-up zone begins around mid-December 2026.

These three names must remain forward shadow observations. Their future outcomes must not be used to redesign the score after inspection.

## Expanded historical controls

The official TSE list supplies a broader set of completed status-report events suitable for timestamp and abnormal-return backfill:

### Recent controls

- Advance Create (8798): improvement report 2025-06-20; improvement-status report 2026-01-07.
- Fisco (3807): improvement report 2025-10-17; improvement-status report 2026-04-20.
- Kasai Kogyo (7256): improvement report 2025-11-11; improvement-status report 2026-05-15.

### Additional cross-sectional controls

- Santec / Santech (1960): improvement report 2025-03-03; improvement-status report 2025-09-04.
- Gala (4777): improvement report 2025-01-20; improvement-status report 2025-07-23.
- Fine Sinter (5994): improvement report 2024-12-20; improvement-status report 2025-06-27.
- Shinwa Wise Holdings (2437): improvement report 2024-12-19; improvement-status report 2025-07-03.
- ENECHANGE (4169): improvement report 2024-09-24; improvement-status report 2025-03-25.
- Luckland (9612): improvement report 2024-07-31; improvement-status report 2025-02-13.
- Tokyo Sangyo (8070): improvement report 2024-06-13; improvement-status report 2024-12-16.
- Image One (2667): improvement report 2024-03-19; improvement-status report 2024-10-02.
- ITbook Holdings (1447): improvement report 2023-10-26; improvement-status report 2024-05-08.
- Yamaura (1780): improvement report 2023-10-06; improvement-status report 2024-04-12.

### Escalation and terminal controls

These cases should be retained as negative or structurally different controls rather than mixed mechanically with ordinary follow-up reports:

- Tohshin Holdings (9444): improvement report submitted 2025-05-16; later designated as a special-alert issue on 2025-11-22, so the ordinary status-report path was superseded.
- Goodspeed (7676): improvement report submitted 2024-04-26; subsequently designated for delisting and delisted in August 2024.
- ProRoute Marumitsu (8256): improvement report submitted 2023-10-02; subsequently entered delisting proceedings and was delisted in January 2024.

This separation is essential: escalation events may dominate returns and must not be treated as ordinary six-month verification outcomes.

## Cohort stratification

Before return testing, classify each issuer-event into:

1. `ordinary follow-up`: status report filed without exchange-state escalation;
2. `recurrence/escalation`: special-alert designation, new control failure, additional correction or renewed investigation before the expected follow-up;
3. `terminal`: delisting, insolvency, restructuring or non-executable trading state;
4. `confounded`: earnings, financing, TOB/MBO, index change or other major event overlaps the measurement window.

Primary analysis should compare ordinary follow-up issuers with matched controls. Escalation and terminal cases belong in tail-risk and blocker research, not in the same average-return estimate.

## Dataset additions

For each issuer, record:

- improvement-report request date and publication timestamp,
- submission date,
- expected six-month zone and actual status-report timestamp,
- promised remediation milestones and owners,
- evidence of operating effectiveness before follow-up,
- auditor opinion, review conclusion and auditor changes,
- filing delays, corrections and recurrence events,
- executive or board changes,
- related-party and subsidiary-control exposure,
- price, volume and benchmark-adjusted returns for D0, D+1, D+3 and D+5,
- pre-event drift over 20 and 60 trading days,
- liquidity, borrow availability, spread proxy and financing fragility,
- concurrent earnings, guidance, financing, index and macro confounders,
- exchange-state transition between the initial report and follow-up.

## Hypotheses

### H1: Weak-evidence pre-window drift

Issuers with unresolved operational evidence may underperform as the expected status-report window approaches.

### H2: Credible-remediation uncertainty relief

A status report demonstrating operating effectiveness without new adverse facts may produce neutral-to-positive abnormal return.

### H3: Paper-remediation downside asymmetry

Reports centered on policies, training and future plans, without measurable operating results, may fail to reduce uncertainty and may create larger negative reactions when combined with new delays or control failures.

### H4: Escalation-state dominance

A transition to special-alert, delisting or renewed investigation should be treated as a separate state variable. Any apparent calendar alpha that is driven mainly by these events is not a clean Scheduled Remediation Verification edge.

### H5: No standalone calendar alpha

The six-month clock alone should have no production value. Any alpha must survive controls for distress, momentum, liquidity, earnings timing, auditor information and exchange-state transition.

## Falsification

Reject or downgrade if:

- returns are fully explained by generic distress or prior momentum,
- actual publication dates are too uncertain to construct PIT-safe monitoring windows,
- market reactions occur only when genuinely new accounting losses are disclosed,
- spreads, borrow costs or opening gaps eliminate net alpha,
- one microcap or one enforcement class dominates results,
- escalation and terminal cases explain the full effect,
- untouched historical holdout fails.

## Execution constraints

- No prior-close trade unless publication was confirmed before that close.
- Use next executable open after official publication.
- Separate pre-window ranking research from post-publication reaction research.
- No production short without verified borrow availability and cost.
- Gap-down reactions must use open-price execution, not prior-close synthetic fills.
- Delisted or non-borrowable names may inform blocker models but cannot be counted as executable short alpha.

## Relationship to existing edges

- `Exchange Sanction Ladder`: parent enforcement-state framework.
- `Remediation Half-Life`: recurrence and decay of previously announced controls.
- `Known-Bad Event Repricing`: formal-event repricing when the underlying bad facts are already known.

Incremental value exists only if the predictable follow-up clock plus operating-evidence score adds explanatory power beyond those edges.

## Next validation step

Backfill the first six ordinary controls with publication timestamps, abnormal returns, pre-window drift, auditor state and concurrent-event controls. Hold out at least three additional ordinary controls and all three 2026 forward names. Analyze escalation and terminal cases separately as blocker/tail-risk observations.

## Source policy audit

Used: JPX enforcement rules, official improvement-report/status-report list and company disclosure chronology.

Not used: SNS, forums, influencers, anonymous posts or social sentiment.
