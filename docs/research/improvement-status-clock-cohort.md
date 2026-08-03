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

## Initial 2026 cohort

Seed the forward calendar from the official TSE improvement-report list:

- KDDI (9433): improvement report submitted 2026-06-02; expected follow-up zone begins around early December 2026.
- nms Holdings (2162): submitted 2026-06-05; expected follow-up zone begins around early December 2026.
- eMnet Japan (7036): submitted 2026-06-16; expected follow-up zone begins around mid-December 2026.

Historical/near-current status-report controls:

- Advance Create (8798): improvement report 2025-06-20; improvement-status report 2026-01-07.
- Fisco (3807): improvement report 2025-10-17; improvement-status report 2026-04-20.
- Kasai Kogyo (7256): improvement report 2025-11-11; improvement-status report 2026-05-15.

These controls provide examples where the follow-up date and market reaction can be measured before evaluating the 2026 forward cohort.

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
- concurrent earnings, guidance, financing, index and macro confounders.

## Hypotheses

### H1: Weak-evidence pre-window drift

Issuers with unresolved operational evidence may underperform as the expected status-report window approaches.

### H2: Credible-remediation uncertainty relief

A status report demonstrating operating effectiveness without new adverse facts may produce neutral-to-positive abnormal return.

### H3: Paper-remediation downside asymmetry

Reports centered on policies, training and future plans, without measurable operating results, may fail to reduce uncertainty and may create larger negative reactions when combined with new delays or control failures.

### H4: No standalone calendar alpha

The six-month clock alone should have no production value. Any alpha must survive controls for distress, momentum, liquidity, earnings timing and auditor information.

## Falsification

Reject or downgrade if:

- returns are fully explained by generic distress or prior momentum,
- actual publication dates are too uncertain to construct PIT-safe monitoring windows,
- market reactions occur only when genuinely new accounting losses are disclosed,
- spreads, borrow costs or opening gaps eliminate net alpha,
- one microcap or one enforcement class dominates results,
- untouched historical holdout fails.

## Execution constraints

- No prior-close trade unless publication was confirmed before that close.
- Use next executable open after official publication.
- Separate pre-window ranking research from post-publication reaction research.
- No production short without verified borrow availability and cost.
- Gap-down reactions must use open-price execution, not prior-close synthetic fills.

## Relationship to existing edges

- `Exchange Sanction Ladder`: parent enforcement-state framework.
- `Remediation Half-Life`: recurrence and decay of previously announced controls.
- `Known-Bad Event Repricing`: formal-event repricing when the underlying bad facts are already known.

Incremental value exists only if the predictable follow-up clock plus operating-evidence score adds explanatory power beyond those edges.

## Next validation step

Backfill the Advance Create, Fisco and Kasai Kogyo status-report events with publication timestamps, abnormal returns, pre-window drift, auditor state and concurrent-event controls. Keep KDDI, nms Holdings and eMnet Japan as forward shadow observations; do not use their future outcomes for model selection after inspecting them.

## Source policy audit

Used: JPX enforcement rules, official improvement-report/status-report list and company disclosure chronology.

Not used: SNS, forums, influencers, anonymous posts or social sentiment.
