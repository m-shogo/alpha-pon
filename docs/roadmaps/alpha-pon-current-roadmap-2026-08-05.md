# Alpha Pon Current Roadmap — 2026-08-05

Status: `ACTIVE_CANONICAL_ROADMAP`
Updated: 2026-08-05 JST
Base main at creation: `61c505d386fcabc2f0fa0187b9ffdfa91bbda89a`
Production trading use: `PROHIBITED_UNTIL_VALIDATED`

This document is the current cross-track roadmap for Alpha Pon. Older dated roadmaps remain historical evidence, but when priorities conflict, this document and the current Research OS queue/checkpoint take precedence.

## 1. Product objective

Alpha Pon supports real investment decisions, up to and including
BUY候補 / WATCH / WAIT / AVOID calls with price ranges and scenarios when the
evidence genuinely supports them. It is **not** an automatic-trading system:
no order is placed on a brokerage account without the user's explicit action.

Every recommendation must fix its issue-time conditions immutably and be
answer-checked later. Groundless assertions, stale-as-current facts, SNS-only
BUY calls, fabricated probabilities/targets, retroactive edits to forecasts,
deletion of failed forecasts/Edges, and BUY from catalog-only Edges are
forbidden. See `docs/research/recommendation-outcome-contract.md`.

```text
world / policy / technology / company events / misconduct / special situations
  -> theme & industry-structure change
  -> next bottleneck
  -> beneficiary layers (final / platform / tier1 / tier2 / material /
     equipment / inspection / infrastructure / service)
  -> testable Edge hypotheses
  -> point-in-time-safe evidence and historical analogs
  -> executable event studies
  -> measured net alpha after costs
  -> BUY / WATCH / WAIT / AVOID with ranges, scenarios and confidence
  -> outcome answer-check -> lessons -> better next forecast
```

New facts, previously known facts, assumptions, forecasts and opinion must
always be presented separately. GitHub is the source of truth. Conversation
memory is not authoritative.

## 2. Current confirmed state

### Completed foundations

- Market Event Calendar v1 is operational on Cloudflare Workers Static Assets.
- Public market-event runtime is GET-only; no public write API exists.
- Cloudflare Access / Zero Trust is not part of the current runtime design.
- D1 canonical and remote rows were verified equal in dry-run Run `30970892738`.
- Research OS v1 is implemented: Registry, Queue, Checkpoint, PIT guards, immutable history, Backtest framework, Net Alpha engine, Holdout, Decay, Gate, Dashboard and CI.
- First real Research OS Edge is registered: `known-bad-event-repricing`.
- Current Edge state: `research`, Gate `0/11`, sample `0/40`, real measured Net Alpha `0` cases.
- LINE consolidated notification is COMPLETED and merged: PR #34, final head `32cc958`, merge commit `97a95bc`. Foundation code and tests are on `main`; do not rebuild it.
- Data Source Governance / Technology Edge Foundation (PR #35, `1fb437d`) and the Data Source / Edge Catalog Validator (PR #36, `9c68e57`) are merged.

### Known blockers and incomplete work

- PIT Price Store v1 (PR #37) is contract-complete with green local verification but cannot merge: GitHub Actions is blocked at runner startup by an account billing / spending-limit issue (`steps: []`, no job log). This is a billing-origin blocker requiring human action, not a code failure. See `docs/research/pit-price-store.md`.
- Historical market prices, benchmark series, borrow availability and borrow costs are not connected.
- Historical Analog, Counterfactual and Confounder records for the first Edge remain empty.
- The latest docs/research-only branch builds have received Cloudflare Git deployment failure notifications; the last-known-good production runtime and the latest main deployment must remain distinguished until Dashboard logs are inspected. This is separate from the GitHub Actions billing block.
- No Edge is eligible for Production.

## 3. Priority order

Work in this order unless a P0 safety event overrides it.

### P0 — Same-day safety and material alerts

Owner: ChatGPT scheduled research orchestration.

- Check official/public primary sources for material misconduct, governance, accounting, sanctions, lawsuits, executive exits and Named Watch transitions.
- Separate new facts, previously known facts, assumptions and opinion.
- Notify only material changes; otherwise persist silent research progress.
- Do not use SNS, forums, anonymous posts, influencers or social sentiment.

### P1 — LINE consolidated notification — COMPLETED

Status: `COMPLETED`. Merged as PR #34 (final head `32cc958`, merge commit `97a95bc`).
Do not rebuild this foundation unless a new critical defect is found.

Merged code and tests on `main`: `src/send-consolidated-line.ts`, `src/notify.ts`,
`src/line-batch-queue.ts`, `src/line-delivery.ts`, `src/line-consolidation.ts`,
`scripts/run-daily.sh`, `scripts/run-daily-complete.sh`, `scripts/pipeline-lock.sh`,
`tests/line-consolidation.test.ts`, `docs/operations/line-consolidated-notification.md`.

Delivered contract (all satisfied):

- One normal consolidated morning message; immediate delivery only for genuinely urgent events; urgent is not re-listed in the normal morning message.
- Fragment envelopes stored atomically; ledger is append/state-managed; `sent` only on success; dry-run / missing credentials keep pending.
- Corrupt ledger is quarantined (never overwritten with an empty ledger) and a block marker is written; block markers clear only by explicit human action.
- normal/urgent kind is never inferred from body text or emoji; malformed envelopes and ambiguous legacy `.txt` are not sent.
- Urgent is persisted before transport send; LINE failure does not fail the daily pipeline.
- The complete pipeline is protected by a single-writer lock with an owner token; INT/TERM does not continue downstream work; oversized fragments do not block the queue.
- Secrets never appear in logs, ledger, envelopes or markers.
- No exactly-once guarantee: a crash after remote success but before markSent may resend once. Tested with mock/dry-run only; no real LINE send.

### P2 — PIT Price Store v1

Primary executor: Claude Code or Codex.
Research requirements and review: ChatGPT.

Implement an append-only, point-in-time-safe store for issuer and benchmark prices.

Required contracts:

- issuer / code / market
- trading date
- `observedAt`
- provider and source version
- unadjusted OHLCV
- adjusted/unadjusted distinction and adjustment factor
- corporate actions
- suspension / no-trade / missing reason
- benchmark and sector benchmark
- ingestion run ID and content hash
- revision / supersession rules
- first executable timestamp
- license classification and local-only boundary

Required outputs even without credentials:

- provider interface
- schema and validator
- append-only writer/importer
- deterministic fixtures
- PIT, duplicate/revision, corporate-action and benchmark tests
- data-gap report
- runbook

Do not commit licensed data to Git without an explicit redistribution right.

Status: contract complete (PR #37), local verification green, merge blocked by the GitHub Actions billing block above.

### P2.5 — J-Quants Free `PriceProvider` adapter

Primary executor: Claude Code or Codex. Starts only after P2 merges.
Handoff: `docs/research/jquants-free-adapter-next-slice.md`.

- Reuse the existing `src/fetcher/jquants.ts` client; do not rebuild it. Add a thin `src/research/providers/jquants-free.ts` implementing `PriceProvider` with `plan: "free"`.
- Declare Free capabilities explicitly: `delayDays`, `historyFrom`, adjusted/unadjusted, benchmark and sector benchmark support.
- Map `DailyQuote` to `PitPriceRecord` with `dataAsOf` (market time), `observedAt` (Free availability), `retrievedAt` (fetch time) and `firstExecutableAt` (first executable slot after `observedAt`). Do not assume "next day" — follow the real JST trading calendar for holidays and session times.
- Missing credentials are non-fatal; provider failure must not propagate to LINE/daily; real prices stay local-only; secrets are never stored in records; unknown license stays `unknown` and is rejected by the store.
- Measure with the real Free plan (do not fix by guess): actual delay days and whether the 84-day default holds, earliest history, missing/no_trade/suspended patterns, TOPIX and sector-index retrieval paths and series codes, adjusted/unadjusted coverage, license and local-storage boundary.
- Fixture / dry-run first; leave genuinely unmeasurable items as honest blockers.

### P2.6 — EDINET Version 2 auth migration

Milestone: `EDINET_V2_AUTH_MIGRATION_GREEN`. The existing `src/fetcher/edinet.ts`
assumes the old URL with no API key; do not do a half migration that only swaps the URL.

- Current endpoint, `EDINET_API_KEY`, `Subscription-Key` header.
- Missing credentials are non-fatal; redact secrets; checkpoint, retry and rate limit.
- `docID`, content hash, correction / re-correction / withdrawal and supersession chain.
- Source health, fixture tests, `publishedAt` / `observedAt` / `firstExecutableAt`, document-type classification and company-entity mapping.
- An EDINET failure or missing credentials must not stop LINE/daily.

### P3 — First Edge evidence package (Known-Bad Event)

Research owner: ChatGPT scheduled orchestration.
Implementation support: Claude Code or Codex when scripts/importers are required.

For `known-bad-event-repricing`:

1. Reconstruct the Sanrio calibration timeline from primary/authoritative sources.
2. Classify each item as new fact, known fact, assumption or opinion.
3. Record publication time, event time and first executable time separately.
4. Add the first immutable Historical Analogs.
5. Add explicit Confounder and Counterfactual records.
6. Join PIT-safe issuer, TOPIX and sector prices.
7. Measure separate entry routes; do not combine previous close, next open and first executable price.
8. Keep every Production Gate unknown until evidence genuinely supports movement.

### P4 — Signal Store and Event Study v1

Primary executor: Claude Code or Codex.
Research review: ChatGPT.

- Generate Backtest input signals from Edge and market-event records.
- Persist `signalGeneratedAt`, `publicObservedAt`, `firstExecutableAt`, direction, entry/exit rule, blocking reason, confounder refs and training/holdout split.
- Measure prior-close to next-open, D0 open-close, D0 close-close, D+1, D+3 and D+5; add D+10/D+20 only when mechanism requires them.
- Adjust for TOPIX, sector, beta/matched control, volume, gap, spread, liquidity, borrow availability, borrow cost and concurrent disclosures.
- Report gross return and net alpha separately.

### P5 — Recommendation & Outcome persistence

Primary executor: Claude Code or Codex.
Research review: ChatGPT.
Implemented as a separate PR from the J-Quants Free adapter; never mix the two.

Implement the issue-time-immutable recommendation record and its later
outcome answer-check. Contract: `docs/research/recommendation-outcome-contract.md`
(currently `CONTRACT_DRAFT_NOT_IMPLEMENTED`).

- Persist `RecommendationRecord` at `issuedAt` with `informationCutoff`,
  `decision`, `buyRange`, `targetRange`, scenarios, `confidence`,
  `confirmationConditions`, `invalidationRules`, `exitConditions`, evidence
  tiers, `edgeIds`, benchmark/sector benchmark and `outcomeReviewDate`.
- Never overwrite an issued record; append revisions via `supersedesId`.
- Do not mix information after `informationCutoff` into the original judgment.
- Reject BUY built only from catalog-stage Edges or Discovery-only evidence.
- Omit `confidence` / price ranges when there is no basis; never fabricate them.
- Compute `maxReturn`, `maxDrawdown` and benchmark excess return from the PIT
  Price Store using only prices at or after `issuedAt`; measure TOPIX and sector diff.
- Judge target-reached / invalidation-triggered / expiry.
- Keep failed forecasts and rejected Edges; never delete them.

This phase depends on P2 (PIT Price Store) for price truth and on a validated
Edge for evidence. It does not authorize automatic order placement.

### P6 — Research scale-up

Shared ownership under the routing policy.

- Confounder candidate automation.
- Historical Analog backfill.
- Exchange Sanction Ladder overlap decision.
- External Incident Venue Negative Control.
- Edge diversity/correlation monitoring.
- Opportunity-cost scoring.
- Automated Decay calculation.
- Self-hosted runner contracts for archive scans and heavy backtests.
- Pilot required official data sources one at a time, only after their contracts and dedupe/checkpoint behavior are deterministic.

### P7 — Technology Commercialization Graph

Model the commercialization path so beneficiaries are found by structure, not by
paper counts, patent counts, a single "world first" or SNS hype.

```text
research -> reproduction -> grant -> patent family -> joint research ->
standardization -> prototype -> customer sample -> certification/qualification ->
pilot line -> capex -> long-term supply contract -> mass production -> revenue/profit
```

- Represent beneficiary layers explicitly: final-product / platform / tier-1 / tier-2 / material / equipment / inspection / infrastructure / service.
- Core families: Research-to-Commercialization, Enabling Material, Supplier Cascade, Bottleneck Migration, Research-to-Capex, Standardization and Certification, Regulatory Forced Demand, Technology Substitution, Supplier Qualification Moat, Hidden Capacity Constraint (plus the additional research concepts in the Data Source / Technology Edge roadmap).
- Guiding heuristic: do not try to pick the hero product; find what必ず不足する (must run short) when that hero product scales.

### P8 — First Technology Edge active-research promotion

Promote exactly one technology Edge from the catalog into active-research, in a
separate evidence-backed PR. Lifecycle: `catalog -> candidate -> active-research
-> shadow -> validated / rejected / dormant`.

- Register many Edge candidates, but keep only a small number active at once.
- Promotion requires causal path, objective trigger, beneficiary layer, PIT-safe timing, required data and data rights, confounders, invalidation and entry conditions, horizon, benchmark, holdout design, overlap check against existing active Edges, and the evidence tier usable for a BUY decision.
- No direct catalog -> active promotion; candidates must clear the gate above.

### P9 — Shadow validation and promotion discipline

- Freeze discovery and confirmatory samples.
- Keep an untouched Holdout.
- Include fees, spread, slippage, impact, borrow and execution failure.
- Require issuer/event/year diversity and bounded tail risk.
- Reject or deprecate weak Edges rather than preserving them narratively.
- Production requires all 11 Gate items to pass with evidence and a separate human decision.
- No automatic live trading is authorized.

## 4. Parallel operational track

These tasks do not block Research OS contract work unless they affect production safety.

- Inspect Cloudflare Git build logs and restore latest-main deployment confidence without rerunning D1 bootstrap/migrations or recreating tokens.
- Add official-source collectors only after contracts and dedupe/checkpoint behavior are deterministic.
- Keep calendar UI polish below P0/P1 evidence work.
- Keep Google Calendar API, outbox delivery and recurring D1 apply schedules off until their failure/retry/idempotency contracts are complete.

## 5. Scheduling model

Use one ChatGPT hourly research orchestrator. Do not create one schedule per Edge.

Each cycle:

1. Run a bounded P0 official-source scan.
2. Read `research/checkpoint/latest.json` and the VOI queue.
3. Advance exactly one highest-value research slice.
4. Persist at least one Research Log entry and a new Checkpoint.
5. When implementation or local execution is required, create/update a code-agent handoff instead of pretending the scheduled task performed it.
6. Notify only for a material event, decisive falsification, meaningful Gate movement, severe data/CI failure or required human action.

The schedule is an orchestrator, not a substitute for Claude Code, Codex, a local shell, Cloudflare Dashboard or a self-hosted runner.

## 6. Next concrete milestones

1. `LINE_CONSOLIDATED_NOTIFICATION_GREEN` — DONE (PR #34)
2. `PIT_PRICE_STORE_CONTRACT_GREEN` — P2, contract + local checks green; awaiting Actions billing fix to merge
3. `PIT_PRICE_FIRST_REAL_SERIES_VALIDATED` — P2.5
4. `EDINET_V2_AUTH_MIGRATION_GREEN` — P2.6
5. `KNOWN_BAD_FIRST_ANALOG_PACKAGE` — P3
6. `KNOWN_BAD_FIRST_EXECUTABLE_EVENT_STUDY` — P3/P4
7. `SIGNAL_STORE_V1_GREEN` — P4
8. `RECOMMENDATION_OUTCOME_CONTRACT_GREEN` — P5
9. `CONFOUNDER_AUTOMATION_V1_GREEN` — P6
10. `TECHNOLOGY_COMMERCIALIZATION_GRAPH_V1` — P7
11. `FIRST_TECHNOLOGY_EDGE_ACTIVE_RESEARCH` — P8
12. `FIRST_CONFIRMATORY_SAMPLE_READY` — P9

The next milestone must not be marked complete from narrative evidence alone. It requires committed artifacts and green checks.