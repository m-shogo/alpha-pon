# Adverse-Opinion Live Cohort Snapshot — 2026-08-03

Status: `RESEARCH_INPUT`
Production use: `PROHIBITED`
Captured at: 2026-08-03 JST

## Purpose

Create a point-in-time seed cohort for the Audit Opinion Recovery Ladder Edge without treating the cohort itself as evidence of alpha.

## Official cohort observed

JPX's adverse-opinion attention list showed two issuers with fiscal 2026 annual reports carrying disclaimers dated 2026-06-26:

- Kubotek Co., Ltd. (`7709`)
- Kaihan Co., Ltd. (`3133`)

The list exists to alert investors to adverse, disclaimer, and qualified audit opinions. It is not a trading recommendation and does not establish event profitability.

## Timestamp contract

For backtests, distinguish all of the following:

1. audit-report creation date,
2. issuer filing publication timestamp,
3. JPX list first-observed timestamp,
4. first executable market session after public availability.

The audit-report date alone must never be used as an entry timestamp unless the underlying filing was publicly available before that trading decision. This prevents look-ahead caused by treating a report's signed date as its publication date.

## Required joins

For each issuer, collect:

- first disclosure of the underlying accounting or evidence-scope problem,
- annual-report filing timestamp,
- opinion type and exact limitation basis,
- going-concern language,
- internal-control opinion,
- exchange designation or other enforcement state,
- financing, covenant, restructuring, or dilution events,
- D0, D+1, D+3, D+5, and D+20 returns,
- TOPIX and sector-adjusted abnormal returns,
- volume, spread, gap, price-limit, and borrow data,
- later opinion restoration, continued disclaimer, or delisting outcome.

## Counterfactual design

Use at least three controls:

- distressed issuers with clean opinions,
- issuers with adverse opinions but no exchange designation,
- issuers with exchange measures but no adverse opinion.

Also separate evidence-scope limitations from going-concern uncertainty and detected misstatement. Pooling them would blur economically different mechanisms.

## New research guard

A live JPX list is a state snapshot, not an event-history table. Historical backfill must preserve the date each issuer entered, changed opinion class, and exited the list. Scraping only the current page creates survivorship and state-duration bias.

## Current assessment

No alert and no production state change.

The useful advance is a PIT-safe cohort contract and a survivorship-bias guard for the existing Audit Opinion Recovery Ladder Edge. Profitability remains untested.

## Source policy audit

Used: JPX adverse-opinion list and existing Alpha Pon research contracts.

Not used: SNS, forums, influencers, anonymous posts, social sentiment.
