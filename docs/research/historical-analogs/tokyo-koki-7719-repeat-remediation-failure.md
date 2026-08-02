# Tokyo Koki (7719): Repeat Remediation Failure Historical Analog

Status: `HISTORICAL_ANALOG_SEED`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-03 JST

## Why this case matters

Tokyo Koki is a useful Japanese-market analog for testing whether a prior remediation failure materially changes the probability and market meaning of later exchange-enforcement events.

The case contains two separate misconduct/remediation cycles:

1. 2017 disclosure corrections followed by a 2018 JPX improvement-report process.
2. 2023 accounting misconduct followed by Special Attention designation, continuation after the first review, monitoring designation, and eventual removal in 2024.

This makes it more informative than a single scandal because the later exchange decision explicitly referenced the earlier remediation as insufficiently sustained.

## Official chronology

### First cycle

- 2017-08-15: the issuer disclosed corrections to prior-period earnings related to misconduct at an overseas subsidiary.
- 2018-03-09: JPX imposed a public measure and requested an improvement report because false disclosure resulted from internal-control deficiencies.
- 2018-03-26: the issuer submitted the improvement report.
- 2018-08-09: JPX requested an additional improvement-status report after a person who had recognized part of the misconduct but failed to correct it became representative director. JPX required the issuer to revisit and explain remediation measures.

### Second cycle

- 2023-03-03: a third-party committee report disclosed improper accounting in the trading business.
- 2023-03-08: prior-period financial statements were corrected.
- 2023-03-30: JPX designated the shares as a Special Attention Security and imposed a JPY 14.4 million listing-agreement penalty.
- JPX explicitly noted that some measures described in the 2018 improvement report had not been sustained and had become one-off responses.
- 2024-05-24: JPX continued the designation after finding operational deficiencies and newly discovered misconduct involving inflated subcontracting costs and kickbacks.
- 2024-09-30: the shares entered monitoring designation pending the renewed internal-control review.
- 2024-11-23: JPX removed the Special Attention and monitoring designations after confirming that internal controls had been established and operated without identified problems.

## Research implication

### Candidate feature: prior-remediation failure fingerprint

A prior improvement report should not be treated merely as a historical event count. It may be a structural feature when later misconduct occurs.

Proposed fields:

- prior formal remediation required: yes/no,
- years since prior remediation,
- same business unit or control domain,
- same actor or supervisory chain,
- whether prior measures were one-off or embedded,
- whether later JPX findings explicitly cite prior remediation failure,
- repeat accounting or disclosure misconduct,
- prior and current auditor/control-warning history,
- actor separation quality,
- remediation operating-evidence duration.

### Hypothesis

When a new misconduct event occurs after a prior formal remediation cycle, downside and escalation risk may be larger than for a first-time issuer because:

- the market and exchange can infer remediation non-durability,
- management credibility is impaired,
- the probability of Special Attention continuation or delisting review rises,
- the issuer may need a longer operating-evidence period before uncertainty resolves.

The hypothesis must be tested against first-time control issuers matched on market cap, liquidity, misconduct class, auditor opinion, financial distress and initial abnormal return.

## Counterfactual requirements

Use at least two control groups:

1. first-time accounting misconduct issuers that completed remediation without recurrence,
2. repeat-misconduct issuers where the second event was unrelated to the original control domain.

This separates generic repeat-offender effects from failure of the same remediation architecture.

## Event windows

Pre-register and test separately:

- second-event first disclosure,
- JPX Special Attention designation,
- first review continuation/removal decision,
- monitoring designation,
- final removal or delisting decision.

Use next executable open after each official publication. Measure D+1, D+5 and D+20 benchmark- and sector-adjusted returns, volume, spreads, borrow availability and suspension/exit risk.

## Falsification and confounders

Downgrade or reject if:

- repeat-remediation status adds no information beyond financial distress and audit opinion,
- results are driven only by illiquid microcaps,
- later misconduct differs so materially that the prior control failure is not causally relevant,
- event timing cannot be reconstructed point-in-time,
- realistic spreads, gap risk and borrow costs erase Net Alpha,
- a holdout cohort fails.

## Current assessment

`USEFUL HISTORICAL ANALOG`, not a signal.

The concrete advance is a recurrence feature that distinguishes prior formal remediation from ordinary prior controversy. Tokyo Koki shows that JPX may explicitly treat non-durable prior measures as evidence in a later enforcement decision. The next step is to identify additional issuers with two documented JPX remediation cycles and compare their escalation paths with first-time cases.

## Primary sources

- JPX, public measure and improvement-report request, 2018-03-09: https://www.jpx.co.jp/news/1021/20180309-12.html
- JPX, additional improvement-status report request, 2018-08-09: https://www.jpx.co.jp/news/1021/20180809-11.html
- JPX, Special Attention designation and penalty, 2023-03-29: https://www.jpx.co.jp/news/1023/20230329-12.html
- JPX, continuation decision, 2024-05-24: https://www.jpx.co.jp/news/1023/20240524-11.html
- JPX, monitoring designation, 2024-09-27: https://www.jpx.co.jp/news/1023/20240927-11.html
- JPX, removal decision, 2024-11-22: https://www.jpx.co.jp/news/1023/20241122-11.html

## Source policy audit

Used: JPX enforcement and designation pages.

Not used: SNS, forums, influencers, anonymous posts or social sentiment.
