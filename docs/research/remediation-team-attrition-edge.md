# Remediation Team Attrition Edge

Status: `SHADOW_RESEARCH`
Priority: `MEDIUM`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-03 JST

## Research question

After a listed company enters a formal remediation phase following misconduct, does turnover among the people responsible for the remediation predict escalation risk, failed remediation, prolonged governance discount, or delisting better than the original scandal score alone?

Working name: **Remediation Team Attrition Edge** / **改善責任者離脱Edge**.

## Why this is distinct

Most misconduct models score the original act, the actor, the accounting impact, and the initial response. They often treat a published remediation plan as positive evidence. That can be misleading when the plan's named owners leave, key control functions remain single-person dependent, or the board repeatedly replaces the people responsible for execution.

This candidate edge focuses on the implementation layer:

- who owns each remediation action,
- whether those owners remain in role,
- whether replacement capacity exists,
- whether statutory or exchange-required governance roles are continuously filled,
- whether the company can evidence operation rather than merely policy publication.

## Primary-source seed case: Aqualine (6173)

JPX's 2026-04-16 monitoring designation and 2026-04-30 delisting decision describe a concrete failure sequence after the company had already disclosed a remediation plan:

- management was substantially refreshed on 2025-05-30;
- the remediation plan was disclosed on 2025-07-29;
- the director/general manager positioned as central to remediation resigned on 2025-08-08;
- a full-time auditor resigned on 2025-09-03;
- an outside director resigned on 2025-10-02;
- executive capacity remained concentrated in one representative director;
- management/control personnel continued to leave;
- timely disclosure remained effectively dependent on one person;
- repeated disclosure corrections continued;
- JPX concluded the internal control system had not been stably established and decided delisting.

Official sources:

- https://www.jpx.co.jp/news/1023/20260416-11.html
- https://www.jpx.co.jp/news/1023/20260430-11.html

This case suggests that **remediation-owner continuity** may be a stronger forward indicator than the existence of a remediation plan.

## Candidate mechanism

1. The original scandal reveals weak controls.
2. The company publishes a remediation plan and receives partial uncertainty relief.
3. Named remediation owners resign, are replaced repeatedly, or lack sufficient authority/resources.
4. Control implementation stalls; monitoring evidence remains incomplete.
5. Exchange, auditor, lender, or investors revise the probability of successful remediation downward.
6. Governance discount persists or escalates to special-alert continuation, financing stress, auditor issues, or delisting.

## Dataset contract

For each misconduct-remediation case, record:

- issuer, code, market segment, liquidity and borrow availability;
- initial incident date and misconduct class;
- formal remediation-plan date;
- each named remediation owner, role, appointment date, departure date and departure reason;
- board, audit, finance, compliance, internal-audit and disclosure-function headcount;
- key-person concentration and single-point-of-failure indicators;
- statutory-role vacancies or near-vacancies;
- turnover count within 30/90/180/365 days after plan publication;
- whether departures occurred before promised milestones;
- replacement lag and replacement seniority;
- evidence of operating effectiveness versus policy-only completion;
- disclosure corrections after remediation-plan publication;
- auditor changes, opinions and internal-control reports;
- JPX status transitions, improvement-report stages, special-alert stages and delisting outcome;
- market/sector-adjusted returns around each attrition event and each regulatory stage;
- spread, volume, gap, borrow cost and executable entry anchor;
- concurrent earnings, financing, shareholder actions and macro confounders.

## Candidate variables

- `critical_owner_exit_90d`
- `remediation_owner_turnover_180d`
- `replacement_lag_days`
- `single_person_disclosure_dependency`
- `board_control_role_vacancy_days`
- `post_plan_correction_count`
- `operating_evidence_missing`
- `remediation_milestone_slippage`
- `management_attrition_cluster`

## Initial hypotheses

### H1: Critical-owner exit is a negative state transition

Departure of a named remediation owner before the first major implementation milestone increases the probability of regulatory escalation and negative abnormal returns.

### H2: Attrition clusters matter more than one resignation

One departure may be noise. Two or more departures across management, audit, finance, compliance or outside-director roles within 180 days should carry substantially more information.

### H3: Single-person control dependence is a hard blocker

Where disclosure, accounting, compliance or remediation execution remains effectively dependent on one person, a published plan should not qualify as meaningful uncertainty resolution.

### H4: Operating evidence dominates policy evidence

Completion claims without meeting minutes, monitoring outputs, control tests, training completion evidence, staffing stability or internal-audit operation should have little positive weight.

## Confounders and falsification

Reject or downgrade the edge if:

- departures are ordinary retirement or planned succession unrelated to remediation execution;
- the event effect disappears after controlling for pre-existing distress, financing risk and poor earnings;
- JPX escalation is fully explained by the original misconduct severity;
- only Aqualine-like microcap failures support the result;
- resignation disclosures occur after the market has already learned the information;
- spreads, borrow constraints or gap risk eliminate net alpha;
- an untouched holdout set fails;
- attrition does not improve prediction beyond existing Recurrence, Resolution and Corporate Contagion variables.

## Entry / exit research

Potential event anchors:

- next open after confirmed resignation of a critical remediation owner;
- next open after a second control-function departure within 180 days;
- next open after JPX identifies unstable remediation staffing;
- avoid prior-close entry unless disclosure timing is PIT-safe.

Test D0, D+1, D+3, D+5, D+20 and state-transition outcomes. No production short signal without borrow and execution-cost evidence.

## Integration proposal

Do not add this to the production 12/20 score yet. Research it as a separate implementation-risk layer:

- `Remediation Continuity`
- `Control Function Stability`
- `Operating Evidence Quality`
- `Key-Person Concentration`

It should primarily modify `Resolution Stage`, `Recurrence fingerprint`, `Corporate Contagion Risk`, `Hard Blockers`, and `ABSTAIN/BLOCK`, not the original misconduct severity.

## Promotion gate

Do not promote unless:

- enough independent Japanese cases across Prime, Standard and Growth;
- attrition variables add out-of-sample predictive value beyond original scandal severity and financial distress;
- event timestamps are PIT reproducible;
- net alpha survives realistic spreads, gaps and borrow cost;
- no single issuer dominates results;
- untouched holdout passes;
- the feature improves risk avoidance even if it does not create a standalone short edge.

## Current assessment

`RESEARCH CANDIDATE`, not a trading signal.

The immediate useful change is conceptual: remediation-plan publication should not be treated as strong positive evidence unless the people and control functions required to execute it remain stable and produce operating evidence.

## Source policy audit

Used: JPX monitoring and delisting decisions, company-disclosure chronology planned, market data planned.

Not used: SNS, forums, influencers, anonymous posts, social sentiment.
