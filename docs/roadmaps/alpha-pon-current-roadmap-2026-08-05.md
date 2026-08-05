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

### Known blockers and incomplete work

- Mac-local LINE consolidation changes are not in GitHub and must be protected before editing.
- Historical market prices, benchmark series, borrow availability and borrow costs are not connected.
- Historical Analog, Counterfactual and Confounder records for the first Edge remain empty.
- The latest docs/research-only branch builds have received Cloudflare Git deployment failure notifications; the last-known-good production runtime and the latest main deployment must remain distinguished until Dashboard logs are inspected.
- No Edge is eligible for Production.

## 3. Priority order

Work in this order unless a P0 safety event overrides it.

### P0 — Same-day safety and material alerts

Owner: ChatGPT scheduled research orchestration.

- Check official/public primary sources for material misconduct, governance, accounting, sanctions, lawsuits, executive exits and Named Watch transitions.
- Separate new facts, previously known facts, assumptions and opinion.
- Notify only material changes; otherwise persist silent research progress.
- Do not use SNS, forums, anonymous posts, influencers or social sentiment.

### P1 — Protect and finish LINE consolidated notification

Primary executor: Claude Code or Codex on the Mac-local checkout.
Reviewer/orchestrator: ChatGPT.

Required first actions:

1. Measure `git status`, stash list and diffs.
2. Protect current local changes on a dedicated branch without reset/clean/restore.
3. Review `src/send-consolidated-line.ts`, `src/notify.ts`, `scripts/run-daily.sh`, `scripts/run-daily-complete.sh` and generated JSON provenance.
4. Add dry-run/mock transport and tests for zero, one, many, urgent mixed and partial-failure cases.
5. Ensure secrets never appear in logs, errors or generated artifacts.
6. Commit in small coherent slices and keep existing stash until CI is green and changes are pushed.

Definition of done:

- One normal consolidated morning message.
- Immediate delivery only for genuinely urgent events.
- No duplicate pipeline/stock summary delivery.
- LINE failure does not fail the entire daily pipeline.
- Tests, typecheck and relevant build/check commands pass.

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

### P3 — First Edge evidence package

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
- Adjust for TOPIX, sector, beta/matched control, volume, gap, spread, liquidity and concurrent disclosures.
- Report gross return and net alpha separately.

### P5 — Research scale-up

Shared ownership under the routing policy.

- Confounder candidate automation.
- Historical Analog backfill.
- Exchange Sanction Ladder overlap decision.
- External Incident Venue Negative Control.
- Edge diversity/correlation monitoring.
- Opportunity-cost scoring.
- Automated Decay calculation.
- Self-hosted runner contracts for archive scans and heavy backtests.

### P6b — Recommendation & Outcome persistence contract

Primary executor: Claude Code or Codex.
Research review: ChatGPT.

Implement the issue-time-immutable recommendation record and its later
outcome answer-check. Contract: `docs/research/recommendation-outcome-contract.md`.

- Persist `RecommendationRecord` at `issuedAt` with `informationCutoff`,
  `decision`, `buyRange`, `targetRange`, scenarios, `confidence`,
  `confirmationConditions`, `invalidationRules`, `exitConditions`, evidence
  tiers, `edgeIds`, benchmark/sector benchmark and `outcomeReviewDate`.
- Never overwrite an issued record; append revisions via `supersedesId`.
- Reject BUY built only from catalog-stage Edges or Discovery-only evidence.
- Compute `maxReturn`, `maxDrawdown` and benchmark excess return from the PIT
  Price Store using only prices at or after `issuedAt`.
- Judge target-reached / invalidation-triggered / expiry.
- Keep failed forecasts and rejected Edges; never delete them.

This phase depends on P2 (PIT Price Store) for price truth and on a validated
Edge for evidence. It does not authorize automatic order placement.

### P6 — Shadow validation and promotion discipline

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

1. `LINE_CONSOLIDATED_NOTIFICATION_GREEN`
2. `PIT_PRICE_STORE_CONTRACT_GREEN`
3. `PIT_PRICE_FIRST_REAL_SERIES_VALIDATED`
4. `KNOWN_BAD_FIRST_ANALOG_PACKAGE`
5. `KNOWN_BAD_FIRST_EXECUTABLE_EVENT_STUDY`
6. `SIGNAL_STORE_V1_GREEN`
7. `RECOMMENDATION_OUTCOME_CONTRACT_GREEN`
8. `CONFOUNDER_AUTOMATION_V1_GREEN`
9. `FIRST_CONFIRMATORY_SAMPLE_READY`

The next milestone must not be marked complete from narrative evidence alone. It requires committed artifacts and green checks.