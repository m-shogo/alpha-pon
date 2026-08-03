# Alpha Pon Edge Research Automation Roadmap

Status: `ACTIVE`
Owner: Claude implementation / ChatGPT hourly research orchestration
Target foundation deadline: 2026-08-04 JST
Production trading use: `PROHIBITED_UNTIL_VALIDATED`

## 1. Goal

Turn Alpha Pon from an hourly news/research loop into a durable Edge discovery system that:

1. detects same-day Japanese listed-company misconduct and material state changes,
2. converts primary-source events into point-in-time-safe structured records,
3. tests existing Edge hypotheses instead of only writing narrative notes,
4. continuously proposes and falsifies new niche Edge candidates,
5. measures executable net alpha after costs and market constraints,
6. resumes from repository state without repeating prior work,
7. publishes only material alerts while retaining all research progress in Git.

This roadmap separates two parallel tracks:

- Product track: market-event calendar and operator UI.
- Research track: event ingestion, Edge registry, experiments, historical analogs and validation.

They share contracts and data, but must not share an hourly task or compete for the same mutable files.

## 2. Target operating architecture

```text
ChatGPT hourly condition-watch
  -> reads repo research state and current official/public sources
  -> decides alert vs silent research progress
  -> writes small research commits when safe

GitHub main / workflow dispatch
  -> schedules deterministic collectors and experiments

Mac self-hosted runner
  -> local Alpha Pon checkout
  -> large historical DB / sidecar / archive
  -> event backfills, market joins, experiment runner, scanners
  -> commits machine-readable reports and checkpoints

Next hourly ChatGPT run
  -> reads checkpoints and advances the next highest-value slice
```

The hourly ChatGPT task is the research director and reviewer. Heavy collection, archive scans and backtests belong on the self-hosted runner.

## 3. Priority model

### P0 — Same-day safety and alerts

- same-day misconduct detection,
- major actor resignation/dismissal/arrest,
- third-party committee and administrative action,
- accounting/internal-control contagion,
- Sanrio and AEON Named Watch state transitions,
- hard blockers or material uncertainty resolution.

### P1 — Evidence-producing Edge research

- convert hypotheses into datasets and experiments,
- Historical Analog expansion,
- Counterfactual Twin construction,
- event-time and benchmark-adjusted return measurement,
- execution and borrow-cost feasibility,
- untouched holdout validation.

### P2 — New Edge exploration

- at least one candidate or explicit duplicate/rejection per hourly cycle,
- no production promotion without P1 evidence,
- merge overlapping candidates into the registry rather than creating endless documents.

### P3 — Product/calendar polish

Calendar work continues in a separate task. Research contracts must remain compatible with calendar projections, but UI polish must not pre-empt P0/P1 research work.

## 4. Claude implementation plan — complete by 2026-08-04

Claude should implement the foundation in the following order.

### Phase A — Repository authority and state discovery

1. Read `AGENTS.md`, `CLAUDE.md`, README and current research docs.
2. Inventory current schemas, event calendar contracts, scripts, reports, tests and workflows.
3. Identify the canonical paths for:
   - misconduct events,
   - market events,
   - Edge definitions,
   - experiment results,
   - hourly checkpoints,
   - Named Watch state.
4. Do not introduce a second competing source of truth.
5. Add a short authority document if canonical ownership is unclear.

Deliverable: `docs/research/edge-research-authority.md`.

### Phase B — Edge Registry v1

Create a machine-readable registry with one record per Edge.

Required fields:

- `edge_id`, `name`, `family`, `status`, `priority`,
- `structural_thesis`, `causal_mechanism`,
- `event_types`, `universe`, `direction`,
- `entry_candidates`, `exit_windows`,
- `required_data`, `pit_requirements`,
- `confounders`, `falsification_conditions`,
- `execution_constraints`, `hard_blockers`,
- `sample_count`, `train_status`, `holdout_status`,
- `gross_alpha`, `net_alpha`, `confidence`,
- `last_advanced_at`, `next_best_action`,
- `source_policy` and explicit `sns_used=false`.

Seed at minimum:

- Known-Bad Event Repricing,
- Exchange Sanction Ladder,
- Remediation Half-Life,
- Regulatory Clock Slippage,
- Improvement-Status Clock,
- Audit Opinion State Transition,
- Kioxia-type Corporate Structure,
- Starlink-type Future Demand.

Deliverables:

- `data/edge-registry/edges.json`
- schema and validator,
- tests rejecting duplicate IDs, invalid status transitions and missing falsification rules.

### Phase C — Hourly Research Checkpoint

Add one append-only or versioned checkpoint per run.

Required fields:

- run timestamp and source PIT cutoff,
- previous checkpoint reference,
- P0 scan result,
- Edge advanced,
- exact work completed,
- new evidence and source types,
- candidate explored or duplicate/rejection reason,
- missing data,
- next best action,
- notification decision and reason,
- Git commit or runner job reference,
- `sns_used=false` audit.

The scheduler must pick work from `next_best_action`, not restart broad research every hour.

Deliverables:

- `reports/hourly-research/latest.json`
- dated history or append-only ledger,
- validator ensuring monotonic timestamps and no future knowledge.

### Phase D — Event Study Contract

Implement a common contract usable by all event-driven Edges.

Required windows:

- prior-close to next-open,
- D0 open-to-close,
- D0 close-to-close,
- D+1, D+3, D+5,
- optional D+10 and D+20 for resolution effects.

Required controls:

- TOPIX,
- sector benchmark,
- beta-adjusted or matched-control return,
- volume shock,
- gap and spread proxy,
- concurrent earnings/guidance/capital action/index/block trade/macro flags,
- liquidity, borrow availability, borrow cost and reverse-stock-loan constraints where applicable.

Deliverables:

- canonical event-study input/output schema,
- deterministic experiment runner interface,
- tiny fixture dataset and tests,
- no fake production performance numbers.

### Phase E — Work Queue and Value-of-Information Scheduler

Build a queue that ranks research slices rather than treating every Edge equally.

Priority score should consider:

- P0 urgency,
- new primary evidence,
- missing sample value,
- expected information gain,
- closeness to promotion/falsification,
- data availability,
- execution cost,
- duplication risk,
- time since last advance.

Rules:

- no Edge may monopolize more than a configurable number of consecutive cycles,
- Named Watch monitoring is separate from calibration and Edge training,
- candidate creation is capped; duplicates are merged or rejected,
- heavy jobs are delegated to the self-hosted runner.

Deliverables:

- queue builder,
- queue JSON report,
- tests for starvation prevention and deterministic ordering.

### Phase F — Self-hosted Runner Contracts

Prepare workflows, but do not assume the runner or large local DB is available in GitHub-hosted CI.

Jobs:

1. `edge-hourly-light`
   - schema validation,
   - small-source scans,
   - queue generation,
   - checkpoint validation.
2. `edge-research-heavy`
   - archive scan,
   - historical analog backfill,
   - market joins,
   - event studies,
   - holdout experiments.
3. `edge-daily-integrity`
   - duplicate events,
   - PIT leakage,
   - stale source health,
   - registry/report consistency,
   - edge decay summary.

All jobs must be resumable and write machine-readable artifacts before any narrative report.

### Phase G — Claude handoff and operator documentation

Create one copy-paste Claude prompt in:

- `docs/prompts/claude-edge-foundation-implementation.md`

The prompt must tell Claude to:

- work only in `m-shogo/alpha-pon`,
- inspect current repo state before editing,
- preserve existing calendar work,
- implement Phases A–G in order,
- run relevant tests,
- make small intentional commits,
- never fabricate market results,
- keep all new Edges shadow-only,
- stop only for real external credentials/runner blockers,
- leave exact checkpoints and next actions.

Also create:

- `docs/operations/edge-hourly-runbook.md`
- `docs/operations/self-hosted-runner-handoff.md`

## 5. Efficient hourly schedule after foundation

One hourly task remains the orchestrator. Do not create one schedule per Edge.

Each hourly cycle uses this budget order:

1. **P0 scan — mandatory and bounded**
   - official/public same-day misconduct and Named Watch changes.
2. **Read checkpoint and queue — mandatory**
   - resume exactly one highest-value research slice.
3. **Advance one evidence-producing task — mandatory**
   - add samples, complete a join, run a small test, define a missing contract, or falsify a candidate.
4. **Explore one candidate — bounded**
   - register, merge as duplicate, or reject with reason.
5. **Integrity and execution audit — mandatory for changed Edge**
   - PIT, confounder, costs, liquidity, holdout status.
6. **Persist**
   - update registry/checkpoint/reports; commit only coherent changes.
7. **Notify only if material**
   - new P0 case, material state transition, strong promotion evidence, or decisive falsification.

Suggested time allocation for one logical hourly cycle:

- 20% P0 and Named Watch,
- 55% current highest-value research slice,
- 15% new candidate exploration,
- 10% validation, checkpoint and Git hygiene.

Heavy experiments are queued to the runner and may span multiple hours; the orchestrator must not start a second identical heavy job.

## 6. Promotion gates

An Edge may move from `SHADOW_RESEARCH` to `CANDIDATE` only when:

- the mechanism is explicit,
- event timestamps are PIT-safe,
- confounders are encoded,
- enough independent issuers/events exist,
- preliminary net alpha remains positive after realistic costs,
- no single issuer dominates.

An Edge may move to `PRODUCTION_WATCH` only when:

- untouched holdout passes,
- execution and borrow feasibility pass,
- tail-risk and liquidity overrides pass,
- edge diversity and correlation are acceptable,
- decay monitoring is defined,
- a pre-mortem and invalidation rule exist.

No automatic live trading is authorized by this roadmap.

## 7. Definition of done for tomorrow

By 2026-08-04, foundation is considered ready when:

- authority document exists,
- registry schema, seeded registry and validators exist,
- hourly checkpoint format and latest checkpoint exist,
- common event-study contract has fixtures and tests,
- deterministic research queue exists,
- light/heavy/daily workflow contracts exist,
- Claude implementation prompt and runbooks exist,
- calendar code remains green,
- no Edge has been falsely promoted,
- source-policy audit explicitly records SNS non-use.

If all code cannot be completed, Claude must prioritize working contracts, validators, queue/checkpoint persistence and the handoff prompt over UI or broad documentation.

## 8. Anti-patterns

- Do not create a new narrative Edge document every hour without registry state.
- Do not confuse idea count with research progress.
- Do not mix Named Watch calibration observations into model training samples.
- Do not measure returns with event dates discovered after the fact.
- Do not report gross alpha without costs, liquidity and execution.
- Do not let calendar UI work mutate research source-of-truth contracts ad hoc.
- Do not use SNS, forums, influencers, anonymous posts or social sentiment.
