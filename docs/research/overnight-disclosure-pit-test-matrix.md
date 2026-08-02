# Overnight Disclosure PIT Test Matrix

Status: `RESEARCH_CONTROL_FIXTURE`
Priority: `HIGH`
Production use: `REQUIRED_BEFORE_EVENT_BACKTEST_ACCEPTANCE`
Last updated: 2026-08-02 JST

## Purpose

Turn the Overnight Disclosure PIT Execution Validator into a reproducible acceptance matrix before implementation. The matrix is intentionally synthetic: it tests execution logic without contaminating the untouched historical holdout.

## Global assertions

Every accepted observation must satisfy all of the following:

1. the disclosure timestamp is known to minute precision or better,
2. the first executable price occurs strictly after the information became public,
3. market-session and holiday calendars are correct,
4. trading halts and reopening auctions are respected,
5. revisions are linked to the original event,
6. unfilled limit moves are not imputed as executable trades,
7. short entries require contemporaneous borrow availability and cost,
8. reported alpha starts at the first executable price, not at the prior close.

## Synthetic cases

| ID | Scenario | Disclosure time | Entry requested | Expected status | Required treatment |
|---|---|---:|---|---|---|
| PIT-001 | Standard after-close first publication | Mon 16:30 | Monday close | `REJECT_LOOKAHEAD_ENTRY` | Earliest valid entry is Tuesday open or declared post-open VWAP |
| PIT-002 | Standard after-close first publication | Mon 16:30 | Tuesday open | `PIT_EXECUTABLE_NEXT_OPEN` | Decompose close-to-open gap from tradable open-to-close return |
| PIT-003 | Friday after-close disclosure | Fri 18:00 | Friday close | `REJECT_LOOKAHEAD_ENTRY` | Earliest valid entry is Monday open; weekend confounder controls required |
| PIT-004 | Weekend company release | Sun 10:00 | Friday close | `REJECT_LOOKAHEAD_ENTRY` | Monday open is first candidate price; macro contamination flag mandatory |
| PIT-005 | Pre-open disclosure | Tue 07:45 | Monday close | `REJECT_LOOKAHEAD_ENTRY` | Use Tuesday opening auction or predeclared post-open rule |
| PIT-006 | Intraday disclosure without halt and no tick data | Tue 10:15 | 10:15 last price | `NON_EXECUTABLE_INTRADAY` | Reject because reaction buffer and granular post-publication price are unavailable |
| PIT-007 | Intraday disclosure with precise tick data | Tue 10:15:20 | 10:20 VWAP | `PIT_EXECUTABLE` | Accept only if the reaction buffer and VWAP window were declared before testing |
| PIT-008 | Intraday disclosure followed by halt | Tue 13:05 | 13:04 price | `REJECT_LOOKAHEAD_ENTRY` | Pre-halt price prohibited; reopening auction is earliest valid entry |
| PIT-009 | Intraday halted disclosure | Tue 13:05 | 14:00 reopening auction | `PIT_EXECUTABLE_WITH_HALT` | Record halt start/end and reopening execution source |
| PIT-010 | Next session locked limit-down with no fill | Mon 17:00 | Tuesday limit-down price | `UNFILLED_LIMIT` | No synthetic fill; carry as non-executable opportunity |
| PIT-011 | Non-material wording correction | Tue 17:30 | Wednesday open as new event | `REJECT_REVISION_MISCLASSIFIED` | Link to original event and do not count as an independent observation |
| PIT-012 | Material revision adding new loss estimate | Tue 17:30 | Wednesday open | `PIT_EXECUTABLE_NEXT_OPEN` | Classify as `MATERIAL_REVISION`; preserve parent event linkage |
| PIT-013 | Unknown publication time on a known date | Date only | Next open | `REJECT_UNKNOWN_TIMESTAMP` | Not eligible for production backtest |
| PIT-014 | Holiday-calendar error | Holiday 15:00 | Same-date close | `REJECT_CALENDAR_ERROR` | Resolve next actual cash session before assigning an entry |
| PIT-015 | Short signal with no borrow snapshot | Mon 16:00 | Tuesday open short | `REJECT_BORROW_UNVERIFIED` | Observation may remain directional research, but not executable Net Alpha |
| PIT-016 | Short signal with borrow available and recorded fee | Mon 16:00 | Tuesday open short | `PIT_EXECUTABLE_NEXT_OPEN` | Deduct spread, commission, borrow fee and buy-in risk reserve |
| PIT-017 | Scheduled known-bad event with position entered before event | Event Tue 15:30 | Monday close | `PIT_EXECUTABLE_PREPOSITIONED` | Allowed only when the scheduling signal and rule existed before entry; separate from surprise-disclosure studies |
| PIT-018 | Concurrent earnings and misconduct disclosure | Mon 16:00 | Tuesday open | `PIT_EXECUTABLE_CONFOUNDED` | Keep observation but exclude from clean causal cohort unless effects can be decomposed |

## Required enum additions

The implementation should support these additional statuses beyond the first validator draft:

- `REJECT_BORROW_UNVERIFIED`
- `PIT_EXECUTABLE_PREPOSITIONED`
- `PIT_EXECUTABLE_CONFOUNDED`

These are necessary because execution validity and causal cleanliness are different dimensions. A trade can be executable while unsuitable for the clean event-study cohort.

## Two-axis acceptance model

Each observation must carry two independent results:

### Execution status

- executable,
- executable with constraints,
- unfilled,
- rejected.

### Causal-cohort status

- `CLEAN_PRIMARY`
- `CLEAN_SECONDARY`
- `CONFOUNDED_EXCLUDE_PRIMARY`
- `DESCRIPTIVE_ONLY`
- `HOLDOUT_RESERVED`

Do not encode both dimensions into a single loose confidence score.

## Return fields required by the fixture

For accepted after-close observations:

- `prior_close_to_next_open_gap`
- `next_open_to_d0_close`
- `next_open_to_d1_close`
- `next_open_to_d3_close`
- `next_open_to_d5_close`
- `benchmark_adjusted_next_open_to_exit`
- `sector_adjusted_next_open_to_exit`
- `execution_cost_bps`
- `borrow_cost_bps`
- `net_alpha_bps`

The prior-close gap is descriptive unless the strategy was legitimately pre-positioned.

## Property-style invariants

1. Moving a disclosure timestamp from before entry to after entry must never leave an observation executable.
2. Adding a halt must move the earliest executable timestamp to the reopening auction or later.
3. Changing a first publication to a non-material revision must remove it from the independent-event count.
4. Marking the next session unfilled at the limit must remove realized PnL from that observation.
5. Removing borrow evidence from a short observation must make executable Net Alpha unavailable.
6. Adding a concurrent earnings release must not change execution validity, but must downgrade causal-cohort eligibility.
7. A calendar shift caused by a holiday must update the next-session date deterministically.

## Known-Bad Event Repricing implication

Known-Bad Event Repricing may legitimately use a pre-event close when the formal event date was public and the strategy rule was fixed before entry. That is categorically different from using the prior close for an unanticipated after-close disclosure. The implementation must preserve this distinction through `PIT_EXECUTABLE_PREPOSITIONED` and a required `signal_known_timestamp_jst` field.

## Acceptance gate for implementation

The future validator implementation is not accepted until:

- all 18 synthetic cases pass,
- property invariants are covered,
- Japan cash-session holidays are deterministic,
- timestamps are normalized to JST without silent timezone fallback,
- unknown timestamps fail closed,
- event revisions preserve lineage,
- execution and causal-cohort statuses are separate,
- no holdout historical issuer is used in unit fixtures.

## Current research advance

The main advance is separating three concepts that were previously at risk of being conflated:

1. information availability,
2. trade executability,
3. causal attribution.

This separation should reduce false positives across misconduct, governance, capital-structure and future-demand event studies before additional Edge promotion work.

## Source policy audit

Used: existing Alpha Pon PIT validator design, JPX/TDnet market-session and disclosure principles already grounded in the parent research control.

Not used: SNS, forums, influencers, anonymous posts or social sentiment.
