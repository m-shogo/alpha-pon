# Alpha Pon Current Roadmap — 2026-08-06

Status: `ACTIVE_CANONICAL_ROADMAP`
Updated: 2026-08-06 JST
Canonical repository: `m-shogo/alpha-pon`
Production trading use: `PROHIBITED_UNTIL_VALIDATED`

This document supersedes the 2026-08-05 current roadmap when priorities conflict. GitHub, exact commit SHAs, actual workflow steps, and committed Research OS records are authoritative. Conversation memory and old PR descriptions are not authoritative.

## 1. Product objective

Alpha Pon exists to discover research candidates early and preserve enough point-in-time evidence to test whether an Edge is real.

```text
world/company event
-> normalized Evidence
-> Claim / Contradiction Graph
-> immutable Evidence Package
-> preregistered Hypothesis and Scenarios
-> Stock Pro Council deterministic replay
-> Decision Firewall
-> research candidate
-> outcome review / Event Study / Net Alpha
-> human decision only
```

It is not an automatic BUY generator or automatic trading system.

## 2. Confirmed current state

### Operational foundations

- Repository visibility is public.
- GitHub Actions uses standard `ubuntu-latest` runners.
- PR #50 was merged to remove duplicate runner work and separate workflow ownership.
- Draft checks, Ready/full checks, PR-aware concurrency, path filters, and short artifact retention are active.
- GitHub-hosted runners are executing real steps again; the former `steps: []` startup blocker is resolved.
- Cloudflare Git integration build token was repaired and the latest build succeeded.
- Public Worker remains read-only for browser users; no public write API or automatic order path is authorized.
- LINE consolidated notification, urgent delivery safety, and pipeline non-fatal behavior are already merged.
- Known-Bad Event Repricing remains the first active Research OS Edge at research status only.

### Foundation branches awaiting integration

Open Draft PRs #37-#49 contain the PIT Price Store, Stock Pro Council v2, Security Master, Bitemporal Evidence, Claim Graph, Document Revision/Diff, Evidence Package, Hypothesis/Scenario, calibration, replay, and Decision Firewall work.

A local integration rehearsal found and fixed branch-level defects, then reached green on the integrated tree. Those branch results do not equal main integration and do not permit milestone promotion by themselves.

Important structural finding:

- PR #43 is a council-side Decision Firewall built before the full Data/Evidence stack.
- It does not yet prove exact cross-stack binding to the final Evidence Package, Hypothesis, Scenario Set, Claim Graph, Document Revision, Bitemporal Evidence, and Security Master snapshots.
- Do not merge PR #43 as the final Decision Firewall integration. Reuse its validated components in a new integration PR after PR #49.

## 3. Immediate priority: integrate the Foundation safely

Do not start broad Edge hunting or add more APIs before this sequence is stable.

### Phase A — PIT and canonical Foundation documentation

1. Sync PR #37 to the latest `main` without losing its governed hardening work.
2. Run exact-head real GitHub Actions steps: Check, CI where applicable, and Research OS.
3. Fix genuine code failures only; do not weaken tests or mark synthetic-only gates green.
4. Ready and merge PR #37 after review.
5. Sync PR #38 to the new main, remove stale billing-blocker statements, verify links and roadmap consistency, then merge.

### Phase B — Stock Pro Council chain

Merge in this order after rebasing each child onto its actual parent:

```text
#39 Council contract
-> #40 dissent/veto ledgers
-> #41 deterministic replay
-> #42 calibration/confidence gates
```

For every PR:

- exact latest HEAD
- real runner steps, not empty jobs
- Draft lightweight checks first
- Ready full checks once
- no duplicate push/PR runs
- no force-push unless history repair is explicitly reviewed
- no milestone green from fixtures alone

### Phase C — Data/Evidence chain

Repair the historical base mismatch and integrate in this order:

```text
#44 Security Master
-> #45 Bitemporal Evidence Store
-> #46 Claim / Contradiction Graph
-> #47 Document Revision / Diff
-> #48 Evidence Package Manifest
-> #49 Testable Hypothesis / Scenario Set
```

Each child must actually contain its declared parent in Git history before Ready review. A PR title or base label is not enough.

### Phase D — Cross-stack Decision integration

Create a new branch and PR based on the final #49 integration, tentatively:

```text
feat/foundation-decision-integration-v1
```

The new integration must pin and validate exact identities and hashes for:

- Security Master snapshot
- Bitemporal Evidence snapshot
- Claim Graph snapshot
- Document Revision / Diff snapshot
- Evidence Package ID/hash and completeness
- Testable Hypothesis ID/hash
- Scenario Set ID/hash
- all four Scenario hashes
- Council Replay Manifest/Result hashes
- calibration hashes when confidence is emitted
- PIT price and benchmark snapshot hashes
- issue time and information cutoff

The Decision Firewall must fail closed when any required object is absent, draft, superseded, future-leaking, unresolved, or hash-mismatched. Opaque hash strings without repository resolution are insufficient.

PR #43 remains Draft as a source implementation until the reusable pieces are incorporated or explicitly superseded.

## 4. First real local pilot

After Foundation integration, run one bounded local-only pilot before expanding scope. Prefer a case with known disclosure chronology and correction/event structure, such as the existing Sanrio research track.

Required pilot path:

1. Create verified Security Master entities and relationships.
2. Ingest at least one real primary disclosure and one revision/correction where available.
3. Reproduce before/after historical cutoffs with Bitemporal Evidence.
4. Build eligible Claims and explicit contradictions/unknowns.
5. Build the Document Revision/Diff snapshot.
6. Resolve local-only issuer, TOPIX, and sector price/benchmark snapshots.
7. Build one governed complete Evidence Package.
8. Register one falsifiable Hypothesis and four Scenarios before the relevant outcome window.
9. Run deterministic Council Replay.
10. Run the cross-stack Decision Firewall.
11. Re-run the same input and prove identical hashes.
12. Confirm no synthetic record changes active Edge count, Production Gate, BUY notification, LINE delivery, or order state.

Real data, licensed content, portfolio information, and secrets remain local-only unless redistribution rights are explicit.

## 5. Known-Bad Event Repricing pilot

Only after the pilot foundation works:

- reconstruct the event timeline from primary/authoritative sources
- separate new facts, previously known facts, assumptions, forecasts, unknowns, and opinion
- preserve event/published/observed/retrieved/first-executable times
- add immutable Historical Analogs
- add Counterfactual and Confounder records
- calculate issuer, TOPIX, and sector-adjusted paths
- separate previous close, next open, first executable, D0, D+1, D+3, D+5, and mechanism-specific longer horizons
- include fees, spread, slippage, liquidity, suspension, and concurrent disclosure effects
- keep holdout untouched

No Production promotion before all Gate evidence exists and a human explicitly approves it.

## 6. Data source implementation order

Add data sources only when an Evidence Gap requires them.

1. EDINET Version 2 authentication migration and correction/re-correction/withdrawal handling.
2. One licensed PIT price/benchmark provider adapter, with local-only raw storage.
3. TDnet/company IR normalization improvements.
4. Market calendar/execution reality improvements only where the pilot exposes a gap.
5. Technology/supply-chain sources remain catalog/discovery until a specific registered hypothesis needs them.

Do not add APIs merely because they are available. Every source requires rights, PIT behavior, revision handling, failure isolation, checkpointing, health monitoring, and a defined fallback.

## 7. Parallel Edge discovery

Lightweight discovery may continue in `discovery-sandbox`, but it must not:

- add active Edge count
- change Production Gate
- create BUY recommendations
- use SNS/forums/influencers as Evidence
- consume large implementation time before Foundation blockers

The research queue may collect candidates such as exchange sanctions, executive-dependence misconduct, external-incident negative controls, commercialization lag, qualification topology, and supply-chain bottlenecks. Promotion waits for the Foundation and an explicit preregistered plan.

## 8. GitHub Actions and runner invariants

The canonical policy is `docs/operations/github-actions-cost-control.md` and the executable guard is:

```bash
node --import tsx/esm scripts/verify-github-actions-cost-control.ts
```

Mandatory invariants:

- feature branches do not run both unrestricted `push` and `pull_request`
- only `main` receives push-triggered full validation
- one command has one workflow owner
- Draft is lightweight; Ready/main is full
- superseded PR runs are cancelled
- unrelated research/docs changes do not run Cloudflare build CI
- successful PRs do not upload the large report artifact
- standard `ubuntu-latest` only
- Larger/GPU/macOS/Windows require an explicit technical justification and reviewed policy change
- local checks precede push; coherent fixes are batched
- manual Research OS dispatch does not write commits
- workflow changes must pass the executable guard and real runner steps before merge

Cloudflare Git build tokens are a separate authentication system. Do not diagnose a deleted/rolled Cloudflare Build Token as a GitHub Actions runner failure, and do not rotate tokens unnecessarily.

## 9. Agent routing

- ChatGPT: roadmap owner, current-state verification, PR/CI review, research design, stock-analysis fact separation.
- Claude Code: heavy local multi-file implementation, stacked branch repair, worktree integration rehearsal, local data pilots.
- Codex: bounded implementation/review tasks when assigned a separate branch and file scope.
- GitHub Actions: validation only; never claim it performed research or human judgment.
- Cloudflare: deployment runtime; keep deployment state separate from GitHub dry-run success.

One branch has one active executor. Do not make ChatGPT, Claude Code, and Codex edit the same branch concurrently.

## 10. Stop and escalation rules

Stop and report rather than improvise when:

- branch ancestry is inconsistent
- a force-push or destructive reset appears necessary
- local uncommitted/stashed work may be overwritten
- a required check has no real steps
- a schema/test would need weakening to pass
- a token, secret, paid API, D1 write, LINE send, BUY notification, or order action is required
- licensed data would enter Git
- an activation milestone lacks real pilot evidence

## 11. Next milestone order

```text
PIT_PRICE_STORE_V1_REAL_RUNNER_GREEN
PRE_EDGE_FOUNDATION_DOCS_CURRENT
STOCK_PRO_COUNCIL_V2_CHAIN_MERGED
DATA_EVIDENCE_CHAIN_MERGED
FOUNDATION_DECISION_INTEGRATION_V1_GREEN
FIRST_REAL_LOCAL_EVIDENCE_PACKAGE
FIRST_PREREGISTERED_HYPOTHESIS_SCENARIO_SET
FIRST_DETERMINISTIC_COUNCIL_FIREWALL_REPLAY
KNOWN_BAD_FIRST_EXECUTABLE_EVENT_STUDY
FIRST_CONFIRMATORY_SAMPLE_READY
```

A milestone is complete only when the exact committed artifacts, real runner steps, and stated real-data conditions are all satisfied.
