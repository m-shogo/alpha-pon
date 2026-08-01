# Overnight Disclosure Gap Edge

Status: `SHADOW_RESEARCH`
Priority: `LOW_TO_MEDIUM`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-02 JST

## Research question

Do material Japanese listed-company disclosures released after the cash-market close, late Friday, or before the next session create a repeatable gap-and-follow-through pattern that is distinct from the underlying news severity?

This is a timing and execution edge, not a claim that late disclosure itself is misconduct. It is only relevant when the event content is already classified by the misconduct, governance, capital-structure, or demand-signal models.

## Primary-source grounding

JPX requires listed companies to use TDnet for timely disclosure and publishes the exact disclosure date and time. JPX also states that disclosure should be made promptly once information is decided or occurs, regardless of whether the cash market is open, and that trading may be halted for important information released during trading hours. TDnet therefore provides a point-in-time timestamp suitable for separating intraday, after-close, late-Friday, weekend, and pre-open events.

## Candidate mechanism

- After-close or late-Friday releases concentrate reaction into the next opening auction rather than allowing continuous intraday price discovery.
- A large opening gap may over-compress the full information response, causing either continuation from forced de-risking or reversal from liquidity overshoot.
- Weekend elapsed time may increase analyst and media digestion, but also increases macro and peer-news contamination.
- Small-cap and low-float names may show larger opening dislocations, but expected alpha may be consumed by spreads, borrow limits, and inability to trade before the gap.
- The useful signal may be conditional: disclosure-time bucket × event severity × prior positioning × liquidity, rather than disclosure timing alone.

## Dataset contract

For each material disclosure, record:

- issuer, code, market segment, float and liquidity,
- TDnet disclosure timestamp in JST,
- timing bucket: intraday, 15:30-17:00, late evening, Friday after close, weekend/holiday, pre-open,
- event class and whether facts are new, known, confirmatory, or uncertainty-reducing,
- severity, evidence confidence, separability and corporate-contagion state,
- prior 5/20-day abnormal return, volume and gap history,
- next-session opening gap, open-to-close, close-to-close D0, D+1, D+3 and D+5 returns,
- TOPIX and sector-adjusted abnormal returns,
- opening-auction volume, spread proxy, limit-up/down constraints,
- borrow availability, short cost and realistic executable entry,
- concurrent macro, peer, earnings, guidance, capital action and index confounders,
- whether the news was tradeable only after the opening gap.

## Initial hypotheses

### H1: Gap continuation after high-confidence negative disclosures

For severe, newly confirmed misconduct or accounting events released after close, a large negative opening gap may continue through D0 when institutional de-risking is not completed in the opening auction.

### H2: Overshoot reversal after known-bad or bounded-loss disclosures

For already-known events where the late disclosure mainly confirms a bounded loss or completed investigation, the opening gap may partially reverse because uncertainty falls while headline severity remains visually high.

### H3: Friday/weekend contamination penalty

Friday-after-close and weekend observations may have weaker standalone edge after controlling for Monday market moves, overseas markets, FX and sector news.

### H4: Non-executable headline alpha

A large portion of apparent alpha may disappear because the next executable price is already the opening gap. Any backtest using the prior close as entry is invalid unless the position was established before disclosure without look-ahead.

## Confounders and falsification

Reject or downgrade the edge if:

- results vanish when entry is moved from prior close to the first executable next-session price,
- timing bucket adds no information beyond event severity and prior momentum,
- Friday/weekend results are explained by Monday market and FX moves,
- microcaps or limit events dominate PnL,
- borrow and spread costs consume short-side returns,
- timestamp quality is incomplete or revised disclosures are misclassified as first publication,
- untouched holdout fails.

## Execution rules

- Never backtest prior-close entry for an unanticipated after-close disclosure.
- Base case entry is next-session open or a documented post-open rule.
- For intraday events, require exact publication timestamp and trading-halt handling.
- Separate gap return from open-to-close return; the gap is not automatically capturable.
- No production short signal without confirmed borrow availability, short cost and limit-risk controls.

## Relationship to existing edges

- `Known-Bad Event Repricing`: explains information state and expectation unwind.
- `Exchange Sanction Ladder`: explains rule-driven enforcement stages.
- `Filing Deadline Extension Escalation`: explains deadline and escalation states.
- This edge only tests whether disclosure timing changes executable price formation after those states are known.

## Promotion gate

Do not promote unless:

- timestamped events cover multiple years, issuer sizes and event classes,
- next-executable-price returns remain positive after costs,
- effect survives severity, momentum, market, sector and weekday controls,
- results are not dominated by untradeable gaps or limit moves,
- untouched holdout passes,
- edge adds incremental information beyond existing event models.

## Current assessment

`RESEARCH CANDIDATE`, likely a conditioning variable rather than a standalone main edge.

The main value is preventing false backtest alpha caused by using the prior close for disclosures that were only knowable after close. The first implementation priority is therefore a point-in-time execution validator, not a trading signal.

## Source policy audit

Used: JPX TDnet rules, disclosure timestamp documentation and market-disclosure procedures.

Not used: SNS, forums, influencers, anonymous posts or social sentiment.
