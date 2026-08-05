# Handoff — Pre-Edge Foundation and Stock Pro Council v2

Status: `PLANNED_NOT_STARTED`
Updated: 2026-08-05 JST
Branch created from: `main`

## Purpose

Strengthen Alpha Pon's data truth, decision boundaries and professional review process before promoting more active Edges.

Do not stop lightweight discovery. Keep discovery in a sandbox that cannot change BUY, scores, Gates or active Edge counts.

## Existing assets to reuse

- `config/stock-pro-agents.yml`
- `src/stock-pro-committee-report.ts`
- `src/legend-pro-agents.ts`
- `src/pro-disagreement.ts`
- Research OS Registry / Gate / Backtest / Holdout
- PR #37 PIT Price Store and Recommendation & Outcome draft contract
- Data Source and Technology Edge catalogs/validators

Do not rebuild these without measuring their current contracts and tests.

## Phase A — Contract and migration design

1. Add a JSON schema for `research/personas/stock-pro-council-v2.yml`.
2. Add a `PersonaVerdict` schema with jurisdiction, abstention, evidence refs, veto codes and information cutoff.
3. Validate duplicate IDs, missing inputs, invalid veto codes and forbidden automatic-trading authority.
4. Map existing functional and investor-style agents into v2 jurisdictions.
5. Keep v1 output available until replay comparison proves v2 is safe.

Milestone: `STOCK_PRO_COUNCIL_V2_CONTRACT_GREEN`

## Phase B — Evidence and decision boundaries

1. Introduce normalized evidence-package references instead of keyword-only source text.
2. Enforce claim categories: facts, assumptions, forecasts and opinion.
3. Require `Data PIT Auditor` pass before a recommendation candidate reaches the council.
4. Separate company thesis, event/Edge validity, valuation/timing, execution and personal suitability.
5. Create an append-only dissent ledger.

Milestone: `COUNCIL_EVIDENCE_FIREWALL_GREEN`

## Phase C — Veto protocol

Implement hard vetoes for:

- PIT leakage;
- unresolved accounting/audit chain;
- unresolved source/entity/license;
- non-executable assumed entry;
- unsupported alpha/probability;
- unbounded downside from poor information quality;
- portfolio concentration/liquidity budget breach.

A majority vote cannot override these. Clearing a veto requires new evidence or a versioned rule correction.

Milestone: `COUNCIL_HARD_VETO_GREEN`

## Phase D — Deterministic replay

1. Add synthetic fixtures with mixed persona views.
2. Prove majority support cannot override a PIT veto.
3. Prove majority support cannot override accounting or execution vetoes.
4. Replay one historical recommendation from immutable inputs.
5. Preserve exact model/config versions and input hashes.

Milestone: `COUNCIL_DETERMINISTIC_REPLAY_GREEN`

## Phase E — Calibration

Record persona outcomes only inside each persona's jurisdiction.

- event classification and entry error;
- later accounting correction recall;
- beneficiary ranking;
- scenario-range coverage;
- slippage error;
- out-of-sample Net Alpha and false discovery;
- invalidation/drawdown warning recall;
- portfolio concentration incidents;
- PIT/replay incidents.

Confidence remains optional until minimum calibration evidence exists. Weights adapt slowly, remain capped and never bypass hard vetoes.

Milestone: `COUNCIL_CALIBRATION_V1_GREEN`

## Phase F — Schedule integration

```text
hourly schedule
  -> bounded discovery sandbox
  -> candidate package only

minimum evidence package complete
  -> selected specialist personas

recommendation candidate
  -> full council and veto protocol

review date reached
  -> outcome and calibration update
```

Do not run all personas for every low-value candidate. Use Value of Information to choose the next evidence action.

## Parallel architectural work

Priority after PIT Price Store:

1. Security Master v1.
2. Bitemporal Evidence Store v1.
3. Document Diff / Revision Graph.
4. Market Calendar / Execution Routes.
5. Recommendation & Outcome implementation.
6. Stock Pro Council v2.
7. Portfolio exposure graph.
8. Deterministic replay.
9. First deeply reconstructed Known-Bad event study.
10. Only then promote the next active Edge.

## Protected boundaries

- no live LINE send;
- no automatic brokerage order;
- no billing or spending-limit changes;
- no Cloudflare/D1 mutation;
- no secrets or licensed raw prices in Git;
- no active Edge count increase;
- no Production Gate movement;
- no majority override of a hard veto;
- no deletion of failed forecasts or dissent.

## Final report requirements

- starting and ending HEAD;
- commits and changed files;
- schemas and validation rules;
- migration mapping from v1 agents;
- veto tests;
- replay tests;
- confidence/calibration status;
- any behavior differences between v1 and v2;
- active Edge and Production Gate unchanged;
- secrets/live orders/live LINE not used;
- unresolved blockers and next implementation slice.
