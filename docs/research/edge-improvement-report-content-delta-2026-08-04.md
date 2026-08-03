# Improvement-Report Content-Delta Edge

Date: 2026-08-04 JST
Status: Research
Scope: Japan listed-company misconduct / Known-Bad Event Repricing
SNS used: No

## Hypothesis

A TSE-requested improvement report or improvement-status report is often a **predictable regulatory-clock event**. The filing itself should not be treated as fresh bad news. The potentially tradable signal is the **content delta** between what was already known and what the filing newly reveals.

Candidate decomposition:

1. `clock_only`: expected filing on a known deadline, no material new facts;
2. `remediation_positive_delta`: measurable implementation progress, accountability, controls, auditability, or uncertainty reduction beyond prior disclosure;
3. `remediation_negative_delta`: delays, incomplete implementation, recurring exceptions, weak ownership, new losses, expanded scope, or new regulator concerns;
4. `mixed_or_unscorable`: content cannot be separated from same-day earnings, index, sector, financing, or other confounders.

The edge candidate is therefore not "sell every improvement-report event". It is:

> Compare the filing's newly disclosed remediation state with the market-implied and previously disclosed state, then test abnormal returns only for high-magnitude content deltas.

## Official historical analog seeds

### KDDI (9433)

- 2026-03-31: disclosed a special investigation committee report concerning suspected inappropriate transactions at subsidiaries and corrections to past earnings.
- 2026-04-30: TSE requested an improvement report.
- 2026-06-02: improvement report submitted and made available for public inspection from 2026-06-03.
- Official TSE explanation attributes the case to deficiencies in the organization for appropriate timely disclosure.

Initial label: `clock_only_or_content_delta_pending`.

### nms Holdings (2162)

- 2026-03-16: disclosed a special investigation committee report concerning losses at a subsidiary that had not been appropriately expensed.
- 2026-04-28 and 2026-05-11: disclosed corrections to past earnings.
- 2026-05-13: TSE requested an improvement report and imposed a public-announcement measure, citing false disclosure and governance weaknesses including concentration of authority/information, insufficient accounting-finance function, and inadequate information flow to the board.
- 2026-06-05: improvement report submitted and made available for public inspection from 2026-06-06.

Initial label: `clock_only_or_content_delta_pending`.

### Fisco (3807)

- 2025-08-04 and 2025-08-08: disclosed corrections to prior consolidated financial statements and past earnings.
- 2025-09-19: TSE requested an improvement report.
- 2025-10-17: improvement report submitted.
- 2026-04-20: six-month improvement-status report submitted.

Initial label: `six_month_status_clock_content_delta_pending`.

### Kasai Kogyo (7256)

- 2025-10-08: disclosed corrections to past earnings and the causes.
- 2025-10-10: TSE requested an improvement report.
- 2025-11-11: improvement report submitted.
- 2026-05-15: six-month improvement-status report submitted.

Initial label: `six_month_status_clock_content_delta_pending`.

## Why this is distinct from the existing remediation-clock work

The regulatory clock identifies **when** a filing is likely. This candidate adds a separate cross-sectional variable: **how much the filing changes the known remediation state**.

Required state variables:

- deadline predictability;
- prior remediation promises;
- implementation evidence;
- unresolved findings count;
- newly disclosed recurrence or scope expansion;
- board/accountability changes;
- internal-control test evidence;
- auditor/regulator language delta;
- content novelty score;
- disclosure quality score;
- confounder flags.

## Falsification conditions

Reject or merge this candidate if any of the following holds:

- content-delta labels cannot be produced reliably from PIT documents;
- abnormal returns are explained by same-day earnings, financing, index, sector, or liquidity effects;
- `clock_only`, positive-delta, and negative-delta cohorts do not separate after costs;
- results disappear in untouched holdout periods;
- sample size remains too small for stable inference;
- the candidate adds no information beyond the existing remediation-stage variables.

## Event-study contract

For each filing, record:

- first misconduct disclosure timestamp;
- TSE request timestamp and stated deadline;
- report submission timestamp;
- whether the event was expected;
- content-delta label and evidence excerpts;
- prior-close-to-event abnormal return;
- event-day, next-day, +3-day, and +5-day abnormal return;
- TOPIX and industry benchmark;
- volume and liquidity;
- borrow availability, lending fee, reverse stock-loan risk where relevant;
- same-day earnings, guidance, financing, litigation, index, sector, and large-flow confounders;
- counterfactual twin;
- gross and net alpha after execution costs.

## Current conclusion

This is a **research candidate**, not a production edge. The official sequence supports the existence of predictable regulatory filing clocks, but no market conclusion is made in this update because verified event-window price and execution data have not yet been joined.

Next highest-value step: ingest the four filing documents and prior remediation disclosures, generate blind content-delta labels, then join PIT price/benchmark/confounder data.

## Primary sources

- JPX, Listed Company Measures status: https://www.jpx.co.jp/regulation/listing/measure/
- JPX, Improvement report / improvement-status report list: https://www.jpx.co.jp/listing/measures/improvement-reports/index.html
- JPX, KDDI improvement report public inspection, 2026-06-02: https://www.jpx.co.jp/news/1023/20260602-12.html
- JPX, nms Holdings request/public-announcement measure, 2026-05-13: https://www.jpx.co.jp/news/1023/20260513-13.html
- JPX, nms Holdings improvement report public inspection, 2026-06-05: https://www.jpx.co.jp/news/1023/20260605-12.html
- JPX, Fisco improvement-status report public inspection, 2026-04-20: https://www.jpx.co.jp/news/1023/20260420-11.html
- JPX, Kasai Kogyo improvement-status report public inspection, 2026-05-15: https://www.jpx.co.jp/news/1023/20260515-17.html
