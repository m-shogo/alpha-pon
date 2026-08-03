# Organizational Breadth Escalation Edge

- Research date: 2026-08-04 JST
- Status: IDEA / pre-registration
- Scope: Japan listed-company misconduct and accounting-control cases
- Research source policy: official company disclosures, JPX/TSE, FSA/SESC and market data only; SNS not used

## Research question

Does the **organizational breadth of confirmed misconduct** predict a stronger subsequent exchange/regulatory state transition than the headline monetary amount alone?

Candidate transitions include:

- no exchange action -> improvement report request
- improvement report request -> public censure / contractual penalty
- investigation or correction -> Special Caution designation
- Special Caution -> monitoring extension, delisting review, or failed remediation

This is not a same-day directional trading rule yet. It is a candidate **regulatory-escalation hazard feature** that may improve event-calendar prioritization, BLOCK duration, and Known-Bad Event Repricing sample stratification.

## Why this may be distinct

Existing research in this repository covers remediation clocks, report timing, content deltas, specificity gaps, audit-opinion transitions and recurrence. This hypothesis isolates a different variable:

> How many organizational layers and control functions were implicated, and was misconduct enabled or tolerated across those layers?

A large restatement caused by one isolated actor may be more separable than a smaller amount involving senior management, multiple subsidiaries, finance, internal audit and board oversight. Therefore monetary loss/restatement size and organizational breadth should be modeled separately.

## Pre-registered breadth features

Measure only facts known at each PIT snapshot.

| Feature | Definition | Suggested value |
|---|---|---:|
| implicated_legal_entities | Parent plus subsidiaries explicitly implicated | count |
| implicated_business_units | Distinct divisions/business lines implicated | count |
| management_level | none / local manager / subsidiary executive / parent executive / top management | 0-4 |
| control_function_failure_count | Accounting, finance, legal/compliance, internal audit, statutory audit, board/committee | 0-6 |
| behavior_type_count | instruction, approval, tolerance, concealment, override, retaliation/pressure | count |
| cross_period_years | Fiscal years affected by confirmed conduct | count |
| external_auditor_impact | none / additional procedures / opinion change or disclaimer | 0-2 |
| remediation_owner_turnover | No turnover / partial / top-level replacement | 0-2 |
| breadth_confidence | confirmed / company-reported / regulator-confirmed | categorical |

### Proposed Organizational Breadth Index — shadow only

Do not use in production scoring.

```
OBI =
  min(implicated_legal_entities, 4)
  + min(implicated_business_units, 3)
  + 2 * management_level
  + control_function_failure_count
  + min(behavior_type_count, 4)
  + min(cross_period_years, 5)
  + external_auditor_impact
```

The formula is only a data-collection scaffold. Coefficients must not be optimized before a locked holdout is defined.

## Initial official analogs

### Air Water (4088) — broad, top-management-linked case

JPX stated that inappropriate accounting occurred at the company and multiple consolidated subsidiaries, with involvement/tolerance by parts of management including top management. It also described ineffective controls across business, administration and internal audit, weak board/committee checks, and inadequate post-merger subsidiary governance. JPX designated the company a Special Caution Security and imposed a contractual penalty.

Official source:
- https://www.jpx.co.jp/news/1023/20260430-13.html

Expected classification:
- breadth: very high
- separability: low
- contagion: high
- transition severity: Special Caution + penalty

### KDDI (9433) — subsidiary-originated but financially material case

JPX described fictitious transactions in a subsidiary advertising business and large cumulative corrections. JPX required an improvement report and imposed a contractual penalty. The initial collection task must separate the monetary magnitude from organizational breadth and determine how many control layers were regulator-confirmed as failed.

Official sources:
- https://www.jpx.co.jp/news/1023/20260430-15.html
- https://www.jpx.co.jp/news/1023/20260602-12.html

Expected classification:
- breadth: pending detailed report coding
- monetary magnitude: high
- transition severity: improvement report + penalty, not automatically equivalent to the Air Water state

### nms Holdings (2162) — concentrated authority and finance-function weakness

JPX cited concentration of authority/information in a specific officer, insufficient accounting/finance functions and inadequate information transmission to the board. The company was required to submit an improvement report and received a public censure.

Official sources:
- https://www.jpx.co.jp/news/1023/20260513-13.html
- https://www.jpx.co.jp/news/1023/20260605-12.html

Expected classification:
- breadth: medium
- seniority/control failure: meaningful
- transition severity: improvement report + public censure

### EMNet Japan (7036) — comparison case

JPX required an improvement report and issued a public censure after finding false disclosure and a need for improvement. Detailed coding is required from the company investigation and improvement report to determine whether this is narrow or organization-wide.

Official source:
- https://www.jpx.co.jp/news/1023/20260519-12.html

Expected classification:
- breadth: unresolved pending document coding
- transition severity: improvement report + public censure

### REVOLUTION (8894) — subsidiary/fund transaction case with severe transition

JPX designated the company a Special Caution Security and imposed a contractual penalty after issues involving transactions in real-estate funds operated by a consolidated subsidiary. This is a useful counterexample test: a case may originate in a subsidiary but still reach a severe state depending on governance penetration and reliability of disclosed financial information.

Official source:
- https://www.jpx.co.jp/news/1023/20260724-12.html

Expected classification:
- breadth: pending full coding
- transition severity: Special Caution + penalty

## Testable hypotheses

### H1: breadth adds information beyond amount

After controlling for restatement amount scaled by market capitalization/assets, higher OBI predicts stronger JPX/TSE action.

### H2: top-management plus control-function failure is nonlinear

The combination of parent/top-management involvement and failure of at least two independent control functions has a larger escalation hazard than either factor alone.

### H3: narrow-subsidiary cases are more separable

A subsidiary-originated case with rapid containment, credible replacement and functioning parent controls has lower escalation hazard than a similarly sized case involving parent-level override or multi-subsidiary spread.

### H4: breadth affects post-event repricing windows

Within Known-Bad Event Repricing samples, broad organizational cases should have slower uncertainty resolution and a higher probability that apparently final events reveal additional remediation burdens.

## Counterfactual twins

For every broad case, select at least one twin matched on:

- market capitalization bucket
- sector
- restatement/loss scaled by assets or market cap
- event year and market regime
- initial one-day abnormal return
- investigation duration

Twins should differ primarily in organizational breadth and senior-management/control-function involvement.

## Confounders

Mandatory controls:

- restatement or loss magnitude
- audit opinion and filing delay
- delisting/continued-listing risk already known
- financing distress and going-concern language
- simultaneous earnings/guidance
- size, liquidity and borrow availability
- sector and TOPIX abnormal return
- ownership concentration
- prior governance incidents
- M&A integration complexity
- regulator-specific rule changes

## Outcomes

Regulatory outcomes:

- ordinal action severity
- days from first disclosure to each state transition
- probability of Special Caution designation
- remediation extension or failed-remediation indicator

Market outcomes:

- abnormal return at first disclosure and each formal transition
- recovery from post-disclosure low
- pre-event abnormal run-up
- day 0, +1, +3 and +5 abnormal returns
- realized short-side Net Alpha after fees, borrow and slippage

## Execution and capital-survival constraints

- This feature is not a trade signal until sample size, holdout and Net Alpha gates pass.
- Do not short thin or hard-to-borrow names based on the index alone.
- The severity transition may already be priced; compare against Counterfactual Twins.
- Prevent look-ahead by versioning the breadth coding at each disclosure timestamp.
- Lock coefficients before untouched holdout evaluation.
- Apply multiple-testing correction because this is one of several governance-feature candidates.

## Next collection queue

1. Code PIT-safe feature rows for Air Water, KDDI, nms, EMNet Japan and REVOLUTION.
2. Add at least 15 older JPX enforcement cases spanning improvement report, public censure, penalty and Special Caution outcomes.
3. Build a monetary-magnitude-only baseline.
4. Compare baseline vs baseline + breadth features using ordinal/logistic models with time split.
5. Define an untouched recent-period holdout before tuning OBI weights.
6. Join event timestamps to price/volume/borrow data for Known-Bad Event Repricing stratification.
7. Reject the candidate if breadth adds no out-of-sample calibration or does not improve actionable Net Alpha/avoidance decisions.

## Current conclusion

This is a **plausible, distinct IDEA**, not evidence of tradable alpha. The initial official analogs show that subsidiary origin alone does not determine action severity; organizational penetration, seniority and control-function failure appear necessary dimensions to code. No production-score change, BUY WATCH change or Named Watch transition is authorized.

## Audit

- New major misconduct detected in this run: none confirmed from reviewed official/current sources
- Sanrio (8136): no verified decision-changing update found in this run
- AEON (8267): no verified decision-changing update found in this run
- Known-Bad Event Repricing: advanced through a new proposed stratification variable
- Historical analogs added: Air Water, KDDI, nms Holdings, EMNet Japan, REVOLUTION
- New niche Edge candidate: Organizational Breadth Escalation
- SNS used: no
