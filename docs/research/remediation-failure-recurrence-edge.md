# Remediation Failure Recurrence Edge

Status: `SHADOW_RESEARCH`
Priority: `MEDIUM`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-03 JST

## Research question

Do Japanese listed companies that repeatedly announce remediation while continuing to generate new control failures, filing problems, auditor qualifications, or subsidiary-governance incidents show a repeatable market repricing pattern around later enforcement milestones?

This research focuses on the gap between announced remediation and operational evidence that remediation actually worked.

## Candidate mechanism

1. An initial incident occurs.
2. Management announces remediation.
3. Investors assign some probability that the issue is contained.
4. A later control failure or official action shows weak implementation.
5. The market revises both the new incident and the credibility of prior assurances.
6. Governance, audit, financing, and listing-state uncertainty can widen together.

## Primary-source seed cases

### REVOLUTION (8894)

JPX designated the company as a Special Attention Security effective 2026-07-25 and imposed a listing-agreement penalty. JPX cited repeated problems after consolidation of a key subsidiary, including filing delays, a disclosed material weakness in internal control, an administrative suspension at the subsidiary, a review-report disclaimer, insufficient subsidiary oversight, and inadequate M&A due diligence. JPX stated that previously announced remediation had not produced a governance system judged to be functioning sufficiently.

### Aqua Line (6173)

JPX's 2026-04-16 monitoring-designation notice described continued weakness after earlier regulatory and exchange measures. Cited facts included management departures, an effectively single-person timely-disclosure process, repeated disclosure corrections, lack of an effective improvement plan, and internal rules not updated for material business-process changes.

These cases are useful because the exchange record itself links later failures to incomplete implementation of earlier remediation.

## Distinction from adjacent research

- `Known-Bad Event Repricing`: formal events where bad facts are already known.
- `Exchange Sanction Ladder`: stage-specific exchange measures.
- `Remediation Failure Recurrence`: credibility decay when promised remediation does not operationally hold.
- Generic financial distress must remain a separate control.

## Dataset contract

For each issuer, record:

- initial incident date and class,
- actor and organizational locus,
- remediation announcement date,
- stated commitments, owners, deadlines, and measurable controls,
- subsequent evidence checkpoints,
- recurrence date and relationship to the original control failure,
- auditor opinion or review conclusion,
- filing delays and disclosure corrections,
- executive and control-function turnover,
- regulator or exchange escalation,
- subsidiary-governance and M&A due-diligence failures,
- market and sector-adjusted returns at remediation and recurrence milestones,
- liquidity and first executable timestamp,
- concurrent earnings, financing, restructuring, and macro confounders.

## Shadow features

### Remediation Credibility Gap

Candidate inputs:

- commitments without named owners,
- commitments without deadlines,
- no independent verification,
- repeat disclosure corrections,
- repeat filing delays,
- control-function vacancies or turnover,
- recurrence within the same process,
- subsidiary incidents after claimed oversight strengthening,
- auditor qualification or disclaimer after remediation,
- exchange escalation after remediation.

### Recurrence Fingerprint

- `SAME_CONTROL`: same process or control failed again,
- `ADJACENT_CONTROL`: different incident but same governance root,
- `SUBSIDIARY_CONTAGION`: failure spreads through group oversight,
- `IMPLEMENTATION_GAP`: policy exists but operating evidence is absent,
- `UNRELATED`: no credible link to prior remediation.

Only the first four classes belong in the candidate edge.

## Initial hypotheses

1. Later incidents cause a larger credibility revision when they contradict prior remediation claims.
2. Official exchange or auditor confirmation makes recurrence more informative than company-only disclosure.
3. Subsidiary-governance recurrence is more important after acquisitive growth or weak pre-acquisition diligence.
4. Measurable remediation quality may predict which issuers avoid later escalation.

## Confounders and falsification

Reject or downgrade if:

- results disappear after controlling for generic distress, dilution, and filing-delay severity,
- recurrence classification is only obvious in hindsight,
- concurrent earnings or financing news explain the reaction,
- one or two microcaps dominate the result,
- prior remediation quality has no incremental predictive value,
- an untouched holdout fails.

## Counterfactual Twin design

Match companies on:

- market segment and liquidity,
- financial distress,
- initial misconduct type,
- initial price drawdown,
- remediation-announcement timing,
- auditor status,
- financing needs,
- absence of later recurrence during the same horizon.

The key comparison is credible remediation versus failed remediation under similar initial conditions.

## Promotion gate

Do not promote unless:

- recurrence labels are reproducible from contemporaneous sources,
- prior remediation quality predicts later outcomes out of sample,
- event effects survive market, sector, distress, financing, and momentum controls,
- the result adds information beyond Exchange Sanction Ladder and generic distress,
- no single issuer or event class dominates,
- untouched holdout passes.

## Current assessment

`RESEARCH CANDIDATE`, not a production signal.

This run advances the research by treating failed remediation as a credibility-revision event rather than merely another incident. REVOLUTION and Aqua Line provide primary-source seed cases where JPX connected later problems to ineffective or incomplete prior remediation.

Next step:

1. backfill older improvement-status and Special Attention cases,
2. label whether later failures contradict prior commitments,
3. compare recurrence cases with matched one-off misconduct cases,
4. test whether credibility-gap features add explanatory power after distress controls.

## Source policy audit

Used: JPX enforcement and designation notices. Company and auditor disclosures remain for backfill.

Not used: SNS, forums, influencers, anonymous posts, social sentiment.
