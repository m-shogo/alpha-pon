# Pre-Open Official-Source Completeness Guard

Status: `RESEARCH_GUARD`
Production use: `ENABLED_AS_FAIL_CLOSED_POLICY`
Last updated: 2026-08-03 JST

## Problem

A pre-open scan can find no new misconduct disclosure and still be incomplete. Official sources do not all refresh at the same time, some JPX lists are weekly, company IR pages may publish independently of aggregators, and a disclosure can arrive after the scan but before or during the session.

Therefore, "no official-source hit before the open" must never be interpreted as evidence that no new event exists.

## Guard

Before 09:00 JST, a negative scan result is classified as:

`NO_CONFIRMED_EVENT_YET / SOURCE_COMPLETENESS_UNPROVEN`

It is not classified as:

`NO_EVENT` or `SAFE`.

Any trading or notification decision that depends on absence of new information must remain `ABSTAIN` until the required source set has passed its freshness checks.

## Required source set

For misconduct and governance events:

- issuer IR / official news page,
- TDnet or equivalent timely-disclosure record,
- JPX market-news and enforcement pages where relevant,
- EDINET for statutory filing changes,
- regulator / ministry / court source when the event class requires it,
- reliable major reporting only as corroboration, never as a substitute for an available primary source.

SNS, forums, anonymous posts and social sentiment are excluded.

## Freshness contract

Record for each source:

- query timestamp in JST,
- latest visible publication timestamp,
- source-specific update cadence when known,
- whether the source is event-complete or only a curated/weekly list,
- whether publication time is precise enough for point-in-time execution,
- retry window.

A weekly JPX list is useful for cohort maintenance but cannot prove same-morning completeness. It must be paired with issuer and real-time disclosure sources.

## Retry policy

Minimum same-day checks for an unresolved pre-open result:

1. pre-open scan,
2. opening-window recheck,
3. post-lunch or immediate recheck when price/volume deviates materially,
4. after-close reconciliation.

The exact cadence can be reduced only when all required sources publish a confirmed timestamped no-change state, which is uncommon.

## Price-action exception

If the stock shows an unexplained abnormal gap, volume shock or sector-relative move while official-source completeness is unproven:

- do not infer misconduct from price alone,
- set `UNEXPLAINED_MOVE_WATCH`,
- expand official-source checks,
- withhold BUY/SHORT classification until a confounder or confirmed event is identified.

## Edge implications

This guard protects Known-Bad Event Repricing, Personal/Executive Shock, audit-opinion, sanction-ladder and remediation-clock studies from two errors:

- false negatives caused by publication latency,
- look-ahead bias caused by attaching a later-found disclosure to an earlier executable entry.

## Falsification and audit

The guard is considered insufficient if retrospective replay shows that a required official source published before the decision checkpoint but the scan failed to capture it. Such cases must be logged as source-health failures, not strategy losses.

## Current evidence

JPX maintains authoritative enforcement and audit-opinion lists, but some pages explicitly state weekly updating or function as curated lists rather than real-time event feeds. This supports using them for cohort validation, not as a sole same-morning completeness proof.

## Source policy audit

Used: JPX official enforcement and audit-opinion pages; issuer/TDnet/EDINET required by contract.

Not used: SNS, forums, influencers, anonymous posts, social sentiment.
