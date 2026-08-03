# Remediation Half-Life / Governance Relapse Edge

Status: `SHADOW_RESEARCH`
Priority: `MEDIUM-HIGH`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-03 JST

## Research question

After a listed company has completed a formal misconduct-remediation cycle, does the probability and market impact of a later governance failure remain elevated, and can that residual risk be measured before the next failure becomes public?

This edge is distinct from generic misconduct scoring. It focuses on the durability of remediation after:

- improvement reports,
- improvement-status reports,
- special-attention designation and removal,
- management replacement,
- internal-control remediation,
- third-party investigation recommendations.

Working name: `Remediation Half-Life / Governance Relapse Edge`.

## Candidate mechanism

Formal remediation can be document-complete while operational controls decay over time. The residual failure risk may remain high when:

- the original power concentration or dominant-shareholder influence remains,
- replacement management inherits the same incentives and information bottlenecks,
- control owners change but frontline processes do not,
- board oversight is formal rather than evidence-producing,
- high-risk related-party or unusual transactions resume,
- prior remediation depended on specific individuals and is not system-embedded,
- post-removal monitoring becomes less intense.

A repeat failure is economically different from a first incident because it weakens the credibility of current remediation, raises recurrence probability, and can trigger stronger exchange or auditor responses.

## Primary-source seed case

### unbanked (8746)

JPX designated the company as a special-attention security again on 2026-05-26 and imposed a listing-agreement penalty. JPX stated that remediation following the prior 2020 special-attention designation had not remained effective after the 2022 removal: internal-rule understanding and operation weakened, management failed to reconsider the recurring control problems, and risk controls again failed around transactions proposed by the largest shareholder. The result included substantial uncollected receivables.

This is a direct example of remediation decay and governance relapse, not merely a new unrelated incident.

## Dataset contract

For every company completing a formal remediation cycle, record:

- issuer, code, market segment, liquidity and free float,
- original misconduct class, actor and structural root cause,
- first sanction date, remediation-plan date, completion/status-report date,
- special-attention removal date where applicable,
- management, board, auditor and major-shareholder changes,
- whether original actor/incentive/ownership structure remains,
- control changes classified as policy, personnel, system, workflow, audit evidence or incentive change,
- recurrence date and recurrence type,
- whether recurrence shares the same root-cause fingerprint,
- time from remediation completion/removal to recurrence,
- disclosure, auditor, regulator and JPX escalation stage,
- D0, D+1, D+3, D+5 and longer-horizon abnormal returns,
- borrowing availability, spread, gap and execution costs,
- concurrent earnings, financing, ownership and macro confounders.

## Candidate predictors

### Durable-remediation positives

- original controlling actor fully removed,
- independent control owner with budget and authority,
- automated preventive controls rather than policy-only measures,
- recurring control evidence disclosed,
- board receives exception-level operational metrics,
- auditor change is accompanied by scope and process improvement,
- related-party and unusual-transaction approval is independently tested,
- compensation and promotion incentives are changed.

### Relapse-risk flags

- same dominant shareholder or de facto controller remains,
- same revenue-recognition or financing pressure remains,
- remediation consists mainly of training, rules and declarations,
- repeated deadline extensions or late filings,
- recurring auditor emphasis, qualified opinion or disclaimer risk,
- control owner turnover,
- material subsidiary remains weakly integrated,
- rapid M&A resumes before control maturity,
- prior special-attention removal was recent but evidence of operation is thin.

## Initial hypotheses

### H1: Recurrence severity premium

A repeat governance failure with the same root-cause fingerprint produces a larger negative abnormal return and longer recovery than a first incident of similar accounting size.

### H2: Policy-only decay

Companies whose remediation is dominated by policies, training and committee creation have a higher relapse rate than companies implementing preventive systems, independent approvals and evidence-producing controls.

### H3: Controller persistence

Where the original dominant shareholder, founder or effective controller remains, formal management changes do not materially reduce recurrence risk.

### H4: Removal-complacency window

Risk may rise after special-attention removal as external scrutiny falls. Test hazard windows of 0-12, 12-36 and 36-60 months after removal or remediation completion.

## Entry and use cases

This is initially a risk-control and ranking edge, not a direct short signal.

Potential uses:

- downgrade BUY WATCH when a new anomaly appears at a high-relapse-risk issuer,
- increase required margin of safety,
- prioritize official-source monitoring and document retrieval,
- shorten reaction time when auditors, regulators or exchanges escalate,
- avoid treating policy-only remediation as full resolution.

A tradable short candidate requires a fresh PIT-safe trigger. Historical relapse risk alone is not sufficient for entry.

## Confounders and falsification

Reject or downgrade if:

- recurrence rates are not higher than matched first-incident issuers,
- apparent relapse is explained by persistent financial distress or microcap selection,
- root-cause fingerprinting is too subjective to reproduce,
- market reaction is fully explained by concurrent losses or financing events,
- stronger-remediation classifications do not predict lower recurrence,
- the signal cannot be observed before the second public failure,
- execution costs consume any trigger-based alpha.

## Validation design

1. Build the population of JPX improvement reports, improvement-status reports and special-attention designations/removals.
2. Link each company to later official misconduct, auditor and regulatory events.
3. Create a reproducible root-cause fingerprint taxonomy.
4. Estimate recurrence hazard by remediation type and controller persistence.
5. Match by market segment, size, distress and misconduct class.
6. Reserve an untouched issuer-level holdout.
7. Test whether relapse-risk features improve both event detection priority and net trading outcomes after a fresh trigger.

## Promotion gate

Do not promote unless:

- recurrence prediction survives matched controls,
- features are point-in-time observable and reproducible,
- effect is not driven by a few distressed issuers,
- untouched holdout passes,
- the signal adds information beyond existing Recurrence and Corporate Contagion fields,
- any trading rule has positive Net Alpha after execution and borrow costs.

## Current assessment

`RESEARCH CANDIDATE` with high value for risk control and monitoring prioritization.

The strongest immediate insight is that remediation completion and special-attention removal must not be represented as permanent binary resolution. Alpha Pon should model remediation credibility as a decaying, evidence-refreshed state.

## Source policy audit

Used: JPX enforcement and special-attention materials, company disclosures planned, market data planned.

Not used: SNS, forums, influencers, anonymous posts or social sentiment.
