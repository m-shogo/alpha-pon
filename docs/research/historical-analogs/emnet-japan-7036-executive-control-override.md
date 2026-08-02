# eMnet Japan (7036) — Executive Control Override Analog

Status: `HISTORICAL_ANALOG_SEED`
Production use: `PROHIBITED_UNTIL_EVENT_DATA_BACKFILLED`
Last updated: 2026-08-03 JST

## Why this case matters

This case is a clean seed for the Personal/Executive Shock and Exchange Sanction Ladder research tracks because the official exchange record links a concentrated executive-control failure to both cash leakage and materially false disclosure.

The core question is not merely whether an executive committed misconduct. It is whether a company with apparently separable individual misconduct still deserves a persistent governance discount when the actor could override the control environment, direct concealment and suppress escalation.

## Confirmed chronology

- 2026-03-30: the company disclosed the third-party committee report concerning inappropriate accounting.
- 2026-03-31: the company disclosed corrections to prior-period financial results.
- 2026-05-13: the company disclosed recurrence-prevention measures.
- 2026-05-19: JPX required an improvement report and imposed a public measure.
- 2026-06-16: the improvement report was submitted.

## Officially described failure mode

JPX described the then managing director and CFO as holding an effectively absolute internal position and overriding the administrative control environment. The official record states that the executive repeatedly caused funds to be transferred improperly to a personal account while directing concealment and silence. JPX also noted that multiple employees followed instructions despite recognizing concerns, and that confidence in internal reporting and audit functions was weak.

The resulting corrections reduced fiscal-year 2024 net income by more than 80%.

## Alpha Pon decomposition

### Actor separability

`PARTIAL`, not `HIGH`.

The individual actor was identifiable, but the misconduct depended on organizational conditions:

- concentration of authority in a senior finance executive,
- ineffective challenge within the administrative function,
- employee compliance with suspicious instructions,
- weak trust in internal reporting and audit,
- control override that propagated into external disclosure.

Removing the actor is necessary but not sufficient evidence that recurrence risk is low.

### Corporate contagion risk

`MEDIUM_HIGH` at discovery, subject to remediation evidence.

The economic loss itself may be bounded, but the contamination channel reached:

- cash custody,
- accounting records,
- financial reporting,
- internal reporting,
- audit credibility,
- investor disclosure.

This makes the case structurally different from isolated private misconduct with no operational or reporting access.

### Resolution stage

- misconduct discovery: complete,
- actor identification: complete,
- accounting correction: complete,
- recurrence-plan publication: complete,
- exchange improvement-report submission: complete,
- operating effectiveness over time: not yet proven,
- later improvement-status evidence: pending.

The correct state is therefore `FORMAL_REMEDIATION_SUBMITTED`, not `FULLY_RESOLVED`.

## Candidate edges

### 1. Executive-removal overconfidence

Markets may over-reward removal of a dominant actor even when the revealed facts show institutional compliance, weak escalation and audit distrust. The test is whether apparent uncertainty relief after resignation reverses when later official documents reveal broader control dependence.

### 2. Remediation-specificity gap

Compare generic recurrence-prevention language with measurable changes:

- payment authority redesign,
- bank-account and vendor-master controls,
- independent approval evidence,
- audit committee access,
- whistleblower channel use,
- finance-staff rotation,
- control testing results.

A detailed plan without evidence of operating effectiveness should not receive the same Resolution score as demonstrated remediation.

### 3. Exchange-ladder information split

The 2026-05-19 JPX action did not create the underlying misconduct facts, but it formally classified the disclosure and control failure as sufficiently serious to require remediation. Test separately:

- first-discovery return,
- correction return,
- recurrence-plan return,
- JPX request/public-measure return,
- improvement-report submission return,
- later improvement-status return.

Do not pool them into one event.

## Required backfill

For each stage, collect:

- precise publication timestamp,
- prior close, next open and D0/D+1/D+3/D+5 returns,
- TOPIX and sector-adjusted abnormal returns,
- volume and spread shock,
- borrow availability and short cost,
- prior recovery from the scandal low,
- concurrent earnings, guidance, financing, index and block-trade confounders,
- whether each document contained materially new economic facts,
- remediation specificity score,
- evidence-of-operation score.

## Falsification conditions

Downgrade or reject the candidate edge if:

- all later-stage abnormal returns disappear after controlling for prior momentum and liquidity,
- the JPX stage added no explanatory power beyond already-known earnings corrections,
- remediation-document reactions are random after removing concurrent earnings days,
- the case is not reproducible in other executive-control-override issuers,
- realistic spreads and borrow costs consume the measured alpha,
- an untouched holdout fails.

## Current assessment

This is a strong governance-structure analog but not yet a trading signal.

Its main research value is the distinction between:

- `actor separable`, and
- `control environment separable`.

A company can remove the actor while the enabling system remains unproven. Alpha Pon should score those dimensions independently.

## Source policy audit

Used: JPX official improvement-report/public-measure record and official chronology.

Not used: SNS, forums, influencers, anonymous posts or social sentiment.
