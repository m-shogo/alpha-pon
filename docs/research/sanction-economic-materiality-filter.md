# Exchange Sanction Economic-Materiality Filter

Status: `SHADOW_RESEARCH`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-03 JST

## Research question

When JPX imposes an improvement-report request, public measure, listing-agreement penalty, or later remediation-status requirement after misconduct is already known, is the tradable reaction explained by the sanction label itself, or by the sanction's economic and state-transition materiality relative to the issuer?

This is a filter for the existing Exchange Sanction Ladder and Known-Bad Event Repricing research. It is not a standalone trading signal.

## Why this filter is necessary

A nominally severe exchange action can be economically immaterial for a large, liquid issuer while the same regulatory stage can be existential for a small or financially fragile issuer.

For example, JPX required KDDI (9433) to submit an improvement report and pay a JPY 91.2 million listing-agreement penalty after large prior-period corrections. The penalty is serious as a governance signal, but the direct cash cost is small relative to KDDI's scale. By contrast, for smaller issuers the same ladder stage may interact with financing access, auditor confidence, special-attention risk, lender covenants, and delisting probability.

Therefore, sanction type and penalty amount must not be used as raw ordinal severity without issuer-normalized context.

## Proposed features

Record the following at each sanction-stage event:

- penalty amount,
- penalty / market capitalization,
- penalty / trailing operating profit,
- penalty / cash and equivalents,
- penalty / average daily traded value,
- issuer market segment and free float,
- net debt, interest coverage, and going-concern flags,
- auditor opinion and internal-control opinion state,
- financing need within 12 months,
- equity issuance or refinancing dependence,
- special-attention / monitoring / delisting state before and after,
- institutional eligibility or index-membership consequences,
- whether the exchange action adds new economic facts,
- whether remediation deadlines are fixed and PIT-visible,
- prior remediation failure fingerprint,
- benchmark- and sector-adjusted returns and volume shock.

## Candidate hypotheses

### H1: Cash-cost irrelevance in large issuers

For large Prime issuers, the direct penalty amount has little explanatory power after controlling for the underlying correction, earnings impact, and governance signal.

### H2: State-transition dominance

The strongest reactions occur when the exchange action changes a discrete state probability: special-attention designation, continuation, monitoring designation, delisting review, or removal.

### H3: Financing-fragility amplification

For small or distressed issuers, even a formally similar sanction has larger negative abnormal returns when it raises expected financing cost, weakens lender or auditor confidence, or constrains capital access.

### H4: Improvement-report submission is not automatically positive

Submission without worse facts may reduce uncertainty, but only when the report supplies credible operating evidence. Boilerplate remediation with no durability evidence should not be classified as resolution.

## Initial official-source anchors

- KDDI (9433): JPX improvement-report request and JPY 91.2 million listing-agreement penalty on 2026-04-30; improvement report submitted 2026-06-02.
- nms Holdings (2162): JPX improvement-report request and public measure on 2026-05-13 after prior-period corrections changed FY2024 profit from black to red; improvement report submitted 2026-06-05.
- eMnet Japan (7036): improvement-report request/public measure followed by submission on 2026-06-16.
- Tokyo Koki (7719): later Special Attention continuation and monitoring decisions demonstrate that state-transition risk can dominate nominal penalty size when prior remediation was not durable.

## Event-study design

Separate the following event families:

1. improvement-report request only,
2. request plus public measure,
3. request plus listing-agreement penalty,
4. report submission,
5. improvement-status report,
6. Special Attention designation,
7. continuation or monitoring designation,
8. removal or delisting.

For each event, use the next executable open after official publication and measure D0, D+1, D+5, and D+20 abnormal returns. Match on market cap, liquidity, misconduct class, financial distress, auditor state, prior drawdown, and concurrent earnings/capital events.

## Net Alpha and execution constraints

Do not treat a statistically negative event return as executable alpha unless:

- publication time is point-in-time reproducible,
- borrow was available before entry,
- spread, gap, and borrow cost are included,
- suspension and limit-down exit risk are modeled,
- microcaps do not dominate PnL,
- the effect survives matched controls and untouched holdout.

For long-side uncertainty-resolution tests, require realistic next-open entry and exclude cases where the removal or submission was already mechanically certain and fully anticipated.

## Falsification

Downgrade or reject this filter if:

- issuer-normalized penalty ratios add no information beyond financial distress and market cap,
- sanction-stage effects disappear after controlling for concurrent corrections or earnings,
- only Special Attention or delisting cases matter, making the broader penalty ladder redundant,
- improvement-report submissions show no consistent uncertainty-resolution effect,
- realistic costs erase Net Alpha,
- untouched holdout fails.

## Current assessment

`USEFUL FILTER CANDIDATE`, not a signal.

The concrete advance is to stop treating exchange sanctions as equally material categorical events. The research should model two separate channels:

1. direct economic burden,
2. change in governance, financing, institutional-eligibility, or listing-state probabilities.

The second channel is likely more important than the nominal fine for large issuers, while both may matter for fragile small issuers.

## Primary-source grounding

- JPX, KDDI improvement-report and listing-agreement penalty request, 2026-04-30.
- JPX, KDDI improvement-report public inspection, 2026-06-02.
- JPX, nms Holdings improvement-report request and public measure, 2026-05-13.
- JPX, nms Holdings improvement-report public inspection, 2026-06-05.
- JPX improvement-report and improvement-status-report issuer list.

## Source policy audit

Used: JPX enforcement pages and issuer chronology.

Not used: SNS, forums, influencers, anonymous posts, or social sentiment.