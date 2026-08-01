# Overnight Disclosure PIT Execution Validator

Status: `RESEARCH_CONTROL`
Priority: `HIGH`
Production use: `REQUIRED_BEFORE_BACKTEST_ACCEPTANCE`
Last updated: 2026-08-02 JST

## Purpose

Prevent false alpha in Japanese-equity event studies when a disclosure is published after the prior cash-session close, late Friday, on a weekend/holiday, or during a trading halt.

The core rule is simple:

> A backtest may not enter at a price that existed before the disclosure became public.

This control applies to misconduct, accounting, governance, capital-structure and future-demand event studies, including Known-Bad Event Repricing, Exchange Sanction Ladder and Filing Deadline Extension Escalation.

## Primary-source basis

JPX timely-disclosure infrastructure records publication date and time through TDnet. JPX also requires prompt disclosure once material information is decided or occurs, irrespective of whether the cash market is open, and may halt trading for important information released during trading hours. Therefore the disclosure timestamp, trading calendar and halt state must jointly determine the first executable price.

## Required fields

Each event observation must contain:

- `issuer_code`
- `event_id`
- `event_class`
- `disclosure_timestamp_jst`
- `source_url`
- `source_type`
- `first_publication_or_revision`
- `cash_session_date`
- `cash_session_state_at_disclosure`
- `trading_halt_start_jst`
- `trading_halt_end_jst`
- `next_cash_session_date`
- `first_executable_timestamp_jst`
- `first_executable_price_type`
- `entry_rule`
- `prior_close_price`
- `next_open_price`
- `post_open_vwap_window`
- `limit_up_down_state`
- `borrow_available_at_entry`
- `estimated_borrow_cost`
- `estimated_spread_cost`
- `macro_weekend_contamination_flag`
- `concurrent_event_flag`

## Timing buckets

- `INTRADAY_CONTINUOUS`
- `INTRADAY_HALTED`
- `AFTER_CLOSE_STANDARD`
- `LATE_EVENING`
- `FRIDAY_AFTER_CLOSE`
- `WEEKEND_OR_HOLIDAY`
- `PRE_OPEN`
- `UNKNOWN_TIMESTAMP`

`UNKNOWN_TIMESTAMP` observations are not eligible for production backtests.

## First executable price rules

### Intraday continuous disclosure

Use the first documented post-publication price only when:

- timestamp precision is sufficient,
- there was no trading halt,
- the entry rule includes a conservative reaction buffer,
- quote or trade data is available at the required granularity.

Otherwise mark the observation `NON_EXECUTABLE_INTRADAY`.

### Intraday halted disclosure

The earliest valid entry is the reopening auction or first trade after the halt ends. The pre-halt price is prohibited.

### After-close, late-evening, Friday or weekend disclosure

The default valid entry is:

- next-session opening auction, or
- a pre-declared post-open VWAP rule.

The prior close is prohibited unless the strategy position was independently established before disclosure without using future information.

### Pre-open disclosure

Use the opening auction or a pre-declared post-open rule. Do not assume execution at the previous close or an indicative pre-open quote.

### Limit-up or limit-down session

If the strategy could not realistically obtain a fill, classify the observation as `UNFILLED` rather than imputing the limit price.

## Validation outputs

Each observation receives exactly one status:

- `PIT_EXECUTABLE`
- `PIT_EXECUTABLE_WITH_HALT`
- `PIT_EXECUTABLE_NEXT_OPEN`
- `PIT_EXECUTABLE_POST_OPEN_RULE`
- `UNFILLED_LIMIT`
- `NON_EXECUTABLE_INTRADAY`
- `REJECT_UNKNOWN_TIMESTAMP`
- `REJECT_LOOKAHEAD_ENTRY`
- `REJECT_REVISION_MISCLASSIFIED`
- `REJECT_CALENDAR_ERROR`

## Mandatory return decomposition

Never report only prior-close-to-next-close return for after-close events. Separate:

1. `gap_return`: prior close to next open,
2. `open_to_close_return`: next open to same-day close,
3. `next_open_to_d1_close`,
4. `next_open_to_d3_close`,
5. `next_open_to_d5_close`.

The gap is descriptive unless the position was held before disclosure. Tradable alpha starts at the first executable price.

## Revision handling

TDnet revisions, corrections and supplemental disclosures must be linked to the original event. A revision is not a new first-publication event unless it contains materially new information.

Required states:

- `FIRST_PUBLICATION`
- `MATERIAL_REVISION`
- `NON_MATERIAL_REVISION`
- `DUPLICATE_REPUBLICATION`

## Confounder controls

For Friday/weekend observations, require:

- overseas equity-market move,
- USD/JPY move,
- sector benchmark move,
- commodity move when relevant,
- peer disclosures,
- domestic macro or policy events,
- concurrent earnings/guidance/capital actions.

If contamination cannot be separated, downgrade confidence rather than assigning the full next-session move to the company event.

## Acceptance gate

An event-study result is invalid if any of the following is true:

- prior-close entry is used for an unanticipated after-close disclosure,
- exact disclosure timing is unavailable,
- a trading halt is ignored,
- unfilled limit moves are treated as executable,
- revisions are counted as independent first events,
- borrow availability is assumed rather than observed for short strategies,
- spreads and borrow costs are omitted from Net Alpha,
- weekend macro contamination is not controlled.

## Current research implication

This validator is more important than the standalone Overnight Disclosure Gap hypothesis. Its first role is to remove false positive event-study results. Only after all observations pass this control should disclosure timing be tested as an incremental conditioning variable.

## Source policy audit

Used: JPX timely-disclosure rules, TDnet timestamp structure, trading-halt and market-session principles.

Not used: SNS, forums, influencers, anonymous posts or social sentiment.
