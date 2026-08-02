# Weekend Official-Source Latency Guard

Status: `RESEARCH_GUARD`
Priority: `MEDIUM`
Production impact: `FAIL_CLOSED_FOR_ABSENCE_CLAIMS`
Last updated: 2026-08-02 JST

## Problem

Hourly scandal monitoring can falsely treat an empty weekend or holiday scan as evidence that no new material event exists. Official sources do not update uniformly outside business hours, search indexes can lag, and some company or regulator disclosures become discoverable only after the next business-day ingestion cycle.

This is not a trading edge by itself. It is a point-in-time and source-freshness guard for all event-driven edges, especially:

- Personal / Executive Shock,
- Known-Bad Event Repricing,
- Exchange Sanction Ladder,
- Regulator-First Disclosure Lag,
- Overnight Disclosure Gap.

## Observed failure mode

A fresh web scan on Sunday 2026-08-02 returned mainly older May-July official items despite queries targeting August 1-2. That search result cannot support a positive claim that no new event exists. It only supports `NO_VERIFIED_NEW_EVENT_IN_QUERIED_SOURCES`.

## Required classification

Every scan must record:

- `scanStartedAtJst`,
- `isTradingDay`,
- `isWeekendOrHoliday`,
- source families checked,
- newest source publication timestamp per family,
- whether the source has a known publication or indexing delay,
- `absenceClaimConfidence`.

Allowed absence states:

- `CONFIRMED_NONE`: only when all required primary feeds are current through the scan cutoff,
- `NO_VERIFIED_NEW_EVENT`: no qualifying event found, but source freshness is incomplete,
- `SOURCE_LAG_BLOCKED`: one or more critical source families are stale or unavailable.

Weekend and holiday scans must never emit `CONFIRMED_NONE` solely from general web search results.

## Recheck policy

For weekend or holiday discoveries:

1. retain all candidate URLs and timestamps,
2. recheck company IR / TDnet / JPX / EDINET / regulator sources after the next business-day publication window,
3. compare first public timestamp with first searchable timestamp,
4. classify any lag as `source_ingestion_lag`, not issuer disclosure lag,
5. prevent the lag from contaminating event-time backtests.

## Backtest implications

A historical event must use the earliest point-in-time available official timestamp, not the time at which a search engine indexed the page. Search-index timestamps are discovery metadata only.

Reject or quarantine any sample where:

- the primary publication time is unavailable,
- weekend/holiday publication cannot be distinguished from next-business-day indexing,
- entry timing depends on a page becoming searchable before it was actually accessible,
- the event is discovered only through a later recap article.

## Net Alpha implications

False early availability creates look-ahead bias, especially for Monday-open entries. Any weekend-to-Monday gap strategy must prove:

- the event was publicly accessible before the executable entry,
- the relevant market was closed at publication,
- the source was not merely indexed later,
- the simulated entry uses the next tradable session,
- spread and gap slippage are charged.

## Current assessment

This guard should be mandatory before promoting Overnight Disclosure Gap, Regulator-First Disclosure Lag, or any weekend-to-Monday event strategy.

It does not alter the current 12/20 production threshold and does not create a BUY, SHORT, or WATCH signal.

## Source policy audit

Used: JPX official pages, Financial Services Agency / SESC official pages, company and exchange chronology, repository research state.

Not used: SNS, forums, influencers, anonymous posts, social sentiment.
