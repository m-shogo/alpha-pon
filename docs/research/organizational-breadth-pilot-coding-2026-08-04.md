# Organizational Breadth Escalation — Pilot PIT Coding

- Research date: 2026-08-04 JST
- Status: RESEARCH / pilot coding
- Parent hypothesis: `docs/research/edge-organizational-breadth-escalation-2026-08-04.md`
- Source policy: JPX/TSE official enforcement notices only for this pilot; SNS not used
- Production impact: none

## Purpose

Test whether organizational penetration and control-function failure should be retained as a distinct feature family from headline restatement magnitude when predicting exchange/regulatory escalation.

This pilot deliberately avoids price-direction claims. It only codes facts explicitly available in each JPX notice at the relevant enforcement timestamp.

## Coding rules

- `confirmed` means explicitly stated by JPX/TSE.
- Counts are conservative lower bounds when the notice uses plural or broad language without an exact number.
- Unknown fields remain `NA`; they are not inferred from later disclosures.
- The proposed Organizational Breadth Index remains shadow-only and is not calculated where fields are incomplete.

## Pilot rows

| Case | Enforcement date | Outcome | Legal entities implicated | Management level | Confirmed control-function failures | Behavior breadth | Cross-period span | Pilot breadth class | Confidence |
|---|---|---|---:|---|---:|---|---:|---|---|
| Air Water (4088) | 2026-04-30 | Special Caution + contractual penalty | parent + multiple consolidated subsidiaries (>=3 total entities, conservative) | top management | >=5: business, administration, internal audit, board, audit/supervisory and nomination/remuneration oversight | instruction / tolerance / concealment / falsification / investigation obstruction | FY2020-FY2025 (6 fiscal years) | very high | regulator-confirmed |
| KDDI (9433) | 2026-04-30 | improvement report + contractual penalty | parent + one subsidiary (>=2) | subsidiary actors; parent top-management involvement not stated in the notice | >=4: subsidiary supervision, finance, internal audit, subsidiary internal control | fictitious transactions plus oversight failure; parent instruction not stated | FY2023-FY2026 H1 (4 fiscal periods/years touched) | medium-high | regulator-confirmed |
| nms Holdings (2162) | 2026-05-13 | improvement report + public censure | parent + one subsidiary (>=2) | former managing director | >=4: accounting/finance, board information flow, audit communication, subsidiary information collection | delay/deferral and concentrated decision authority; concealment not expressly coded | FY2024-FY2026 H1 (3 fiscal periods/years touched) | medium | regulator-confirmed |

## Official evidence notes

### Air Water (4088)

JPX stated that inappropriate accounting occurred at the company and multiple consolidated subsidiaries, under involvement by parts of management including top management. It also identified ineffective controls in business, administration and internal audit, formalistic board and committee oversight, weak post-merger subsidiary governance, false explanations, data alteration and investigation obstruction. JPX imposed a Special Caution designation and a JPY 91.2 million contractual penalty.

Official source:
- https://www.jpx.co.jp/news/1023/20260430-13.html

### KDDI (9433)

JPX stated that fictitious transactions occurred in a subsidiary advertising business and that cumulative corrections included JPY 225.6 billion of sales and JPY 133.3 billion of operating profit. Confirmed failures included parent-level subsidiary supervision, fragmented financial monitoring, insufficient specialized internal audit and inadequate subsidiary internal controls. JPX required an improvement report and imposed a JPY 91.2 million contractual penalty.

Official source:
- https://www.jpx.co.jp/news/1023/20260430-15.html

### nms Holdings (2162)

JPX stated that authority and accounting information were concentrated in a former managing director, the accounting/finance function did not actively collect and assess important subsidiary information, the matter was not escalated to the board for a long period, and communication with the auditor was inadequate. JPX required an improvement report and applied a public censure measure.

Official source:
- https://www.jpx.co.jp/news/1023/20260513-13.html

## Preliminary comparison

The three cases provide an early falsification-oriented contrast:

1. **Headline magnitude is not sufficient by itself.** KDDI's disclosed correction magnitude was extremely large, yet the formal state was improvement report + penalty rather than Special Caution.
2. **Air Water's more severe state coincided with broader organizational penetration.** The official notice described parent and multiple subsidiaries, top-management involvement, multiple failed control layers and active obstruction behavior.
3. **nms shows a middle configuration.** Senior-officer concentration and several control failures were meaningful, but the confirmed breadth was narrower than Air Water and the action remained improvement report + censure.

This does not establish causality or alpha. It supports retaining organizational breadth as a candidate explanatory feature rather than collapsing it into monetary magnitude.

## Confounders and limitations

Mandatory controls before modeling:

- market-cap and asset-scaled correction amount
- audit opinion and filing delay
- prior exchange warnings or recurrence
- going-concern and financing distress
- simultaneous earnings/guidance
- rule-specific legal thresholds and exchange discretion
- company size and market segment
- investigation completeness at the enforcement date
- M&A integration complexity

Current sample size is three and unsuitable for significance testing, Production scoring, BUY/WATCH/BLOCK transitions or trading.

## Next queue

1. Code EMNet Japan (7036) and REVOLUTION (8894) from full official notices and underlying investigation materials.
2. Add at least 15 historical enforcement cases balanced across improvement report, censure/penalty and Special Caution outcomes.
3. Create a magnitude-only baseline and compare it against magnitude + breadth with a time split.
4. Lock an untouched recent-period holdout before coefficient tuning.
5. Join event timestamps to price, sector benchmark, liquidity and borrow data only after regulatory-outcome calibration is stable.
6. Reject this feature family if it adds no out-of-sample calibration or actionable avoidance/Net Alpha value.

## Run audit

- New major misconduct detected: none confirmed in reviewed current official sources
- Sanrio (8136): no decision-changing official update established in this run
- AEON (8267): no decision-changing official update established in this run
- Existing Edge advanced: Organizational Breadth Escalation moved from idea-only to pilot PIT coding
- Historical analogs materially coded: Air Water, KDDI, nms Holdings
- Known-Bad Event Repricing impact: candidate stratification variable retained, no trading claim
- Production score changes: none
- SNS used: no
