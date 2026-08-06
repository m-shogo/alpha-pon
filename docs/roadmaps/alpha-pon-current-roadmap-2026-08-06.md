# Alpha Pon Current Roadmap — 2026-08-06

Status: `ACTIVE_CANONICAL_ROADMAP`
Updated: 2026-08-06 14:06 JST
Canonical repository: `m-shogo/alpha-pon`
Production trading use: `PROHIBITED_UNTIL_VALIDATED`

This document supersedes the 2026-08-05 roadmap and earlier status statements when priorities or integration state conflict. GitHub exact SHAs, actual workflow steps, committed Research OS records, and this roadmap are authoritative. Conversation memory and old PR descriptions are not authoritative.

## 1. Product objective

Alpha Pon discovers research candidates early and preserves enough point-in-time Evidence to test whether an Edge is real.

```text
world/company event
-> normalized Evidence
-> Claim / Contradiction Graph
-> immutable Evidence Package
-> preregistered Hypothesis and four Scenarios
-> Stock Pro Council deterministic replay
-> cross-stack Decision boundary
-> research candidate
-> outcome review / Event Study / Net Alpha
-> human decision only
```

It is not an automatic BUY generator or automatic trading system.

## 2. Confirmed current state

### Operational foundations

- Repository visibility is public.
- GitHub Actions uses standard `ubuntu-latest` runners.
- PR #50 runner-cost controls and PR #51 regression guards are merged.
- Draft checks, Ready/full checks, PR-aware concurrency, path filters, and short artifact retention are active.
- GitHub-hosted runners execute real checkout, install, and command steps. The former `steps: []` / `steps: null` startup blocker is resolved for current runs.
- Cloudflare Git Build Token was repaired before this integration and a Cloudflare build succeeded. This roadmap update does not claim a new production deployment.
- Browser-facing Worker behavior remains read-only. No public write API, BUY path, or automatic order path is authorized.
- LINE consolidated notification and pipeline non-fatal behavior remain merged and unchanged.
- Known-Bad Event Repricing remains a Research OS Edge at research status only.

### Foundation integration completed on main

The former Foundation PR stack is no longer awaiting integration.

```text
#37 PIT Price Store
#38 Foundation documentation
#39 Council contract
#40 dissent / veto ledgers
#41 deterministic replay
#42 calibration / confidence gates
#44 Security Master
#45 Bitemporal Evidence Store
#46 Claim / Contradiction Graph
#47 Document Revision / Diff
#48 Evidence Package Manifest
#49 Testable Hypothesis / Scenario Set
#52 Foundation Decision Integration
```

Important merge SHAs:

```text
#37  3854ffd10303d505fc68b9461c30b16cf5fb7727
#38  eecf95b59448f36950b36bbd2e8984a4d55eb929
#39  808883c0149a61ea89e38713a930388ea6ce4afa
#40  92abf1dc9af27f9f0ac4da482c21113d2a702f97
#41  c1d3055df8b6ded601fa711b0b386d8f0d48cacb
#42  d1b40b01a54a829e86ae8114f77a4de12ff277f9
#44  3479990ad003a7a43922199bd839f8b282bcbc5a
#45  1286a5eae64e51a06e315cb8caa0b3ea84ca4c8a
#46  c97a89be14a477502ce9ef0a893ca718dbe2375e
#47  62d954bd6e8ab20290e23b24c3d2b011f6439e20
#48  558ac8509c98cdafce9750f1a3e837e045ede04a
#49  ae78c723136d431ea8749937fa7fb1c9ce1a1249
#52  4a333fed15932df11ecf502883b6f5386c50e82a
```

Current generated main after PR #52:

```text
f72b3e7c264f7a788be207ff04f2b5b583a6d780
```

### PR #43 disposition

PR #43 remains Open / Draft and is explicitly titled as a legacy reference that must not be merged.

It may be consulted for deterministic hash, append-only audit, replay blocker propagation, abstain/veto preservation, and `automaticTradingAuthorized=false`. It is not the final Decision boundary because it predates full actual-object resolution across Security Master, Bitemporal Evidence, Claim Graph, Document Revision, Evidence Package, Hypothesis, Scenario Set, and real price/benchmark objects.

PR #52 is the canonical cross-stack implementation.

## 3. What the merged Foundation now enforces

### PIT Price Store

- local-only real prices
- issue-time cutoff behavior
- deterministic hash and replay guards
- no licensed price rows committed to Git

### Stock Pro Council

- persona jurisdiction
- abstain preservation
- dissent ledger
- binding veto ledger
- deterministic replay
- calibration and minimum-sample confidence gates
- majority or CIO narrative cannot clear hard veto

### Data / Evidence

- stable listed-security / issuer identity
- bitemporal Evidence and correction chains
- fact / assumption / forecast / opinion / unknown Claim separation
- contradiction and invalidation preservation
- Document Revision / Diff snapshots
- governed complete Evidence Package
- preregistered Testable Hypothesis
- downside / base / upside / null_hypothesis Scenario Set

### Cross-stack Decision integration

PR #52 resolves actual local repository objects rather than accepting opaque hashes alone.

It pins and validates:

- Security Master snapshot
- Bitemporal Evidence snapshot
- Claim Graph snapshot
- Document Revision / Diff snapshot
- Evidence Package ID/hash/status/completeness
- Testable Hypothesis ID/hash
- Scenario Set ID/hash
- all four Scenario IDs/hashes
- Council Replay Manifest/Result
- eligible calibration records
- issuer price object
- issuer benchmark object
- TOPIX benchmark object
- sector benchmark object
- issuedAt / informationCutoff / firstExecutableAt

It fails closed for missing, inactive/superseded, draft, incomplete, future-leaking, identity-mismatched, hash-mismatched, blocking-unknown, contradictory, unregistered, abstaining, or vetoed inputs.

## 4. Milestone status

```text
PIT_PRICE_STORE_V1_REAL_RUNNER_GREEN              COMPLETE
PRE_EDGE_FOUNDATION_DOCS_CURRENT                  COMPLETE after this roadmap merge
STOCK_PRO_COUNCIL_V2_CHAIN_MERGED                 COMPLETE
DATA_EVIDENCE_CHAIN_MERGED                        COMPLETE
FOUNDATION_DECISION_INTEGRATION_V1_GREEN          NOT COMPLETE — code merged, real pilot absent
FIRST_REAL_LOCAL_EVIDENCE_PACKAGE                 NOT STARTED
FIRST_PREREGISTERED_HYPOTHESIS_SCENARIO_SET       NOT STARTED
FIRST_DETERMINISTIC_COUNCIL_FIREWALL_REPLAY       NOT STARTED
KNOWN_BAD_FIRST_EXECUTABLE_EVENT_STUDY            BLOCKED BY REAL PILOT
FIRST_CONFIRMATORY_SAMPLE_READY                   NOT STARTED
```

“Code merged” and “milestone green” are different. Synthetic fixtures and real-runner CI prove implementation integrity, not real-market Evidence quality.

## 5. Immediate next priority: one real local-only pilot

Do not expand broad API coverage or active Edge count yet. Run one bounded local-only pilot first. The preferred first case is the existing Sanrio research track because it has known disclosure/event chronology.

Required path:

1. Create verified Security Master entity, listed security, issuer, and listing relationships.
2. Acquire authoritative primary disclosure(s).
3. Build revision/correction chain where applicable.
4. Reproduce before/after historical cutoffs with Bitemporal Evidence.
5. Separate fact, assumption, forecast, opinion, and unknown Claims.
6. Record contradiction, correction, and invalidation links.
7. Generate Document Revision / Diff snapshot.
8. Resolve issuer price, issuer benchmark, TOPIX, and sector benchmark as local-only actual objects.
9. Generate one governed complete Evidence Package.
10. Register one falsifiable Hypothesis before the outcome window.
11. Register downside, base, upside, and null_hypothesis Scenarios.
12. Run deterministic Stock Pro Council Replay.
13. Run Foundation Decision integration.
14. Re-run identical input and prove identical hashes.
15. Apply a correction and prove the prior historical-cutoff result remains unchanged.

Real data, licensed payloads, portfolio information, and secrets remain local-only. They must not enter Git, Issue, PR, Actions artifact, or chat logs.

## 6. Human / local executor boundary

The next pilot needs a trusted local executor with access to the local-only stores and any required provider credentials.

Stop rather than improvise when:

- a paid API or new contract is required
- a token or Secret must be created or rotated
- licensed raw data would enter Git or Actions
- a force-push or destructive local reset appears necessary
- unknown local changes, stash, or worktree could be overwritten
- actual LINE, BUY notification, brokerage order, Cloudflare deployment, or D1 write would occur

The GitHub connector can maintain code and governance, but it cannot prove a local-only real-data pilot without the local records.

## 7. Known-Bad Event Repricing resumes after the pilot

After the Foundation pilot succeeds:

- separate new facts, previously known facts, assumptions, forecasts, unknowns, and opinion
- preserve eventAt / publishedAt / observedAt / retrievedAt / firstExecutableAt
- preserve Historical Analogs, Counterfactuals, and Confounders
- calculate issuer, TOPIX, and sector-adjusted paths
- separate previous close, next open, first executable, D0, D+1, D+3, D+5, and mechanism-specific horizons
- include fees, spread, slippage, liquidity, suspension, borrow reality, corporate actions, and concurrent disclosures
- keep holdout untouched

No Production promotion before all Gate Evidence exists and a human explicitly approves it.

## 8. Data-source implementation order

Add sources only when the real pilot exposes an Evidence Gap.

1. EDINET Version 2 authentication migration and correction/re-correction/withdrawal handling.
2. One licensed PIT price/benchmark provider adapter with local-only raw storage.
3. TDnet/company IR normalization improvements.
4. Market calendar/execution reality fixes identified by the pilot.
5. Technology/supply-chain sources only for a specific registered Hypothesis.

Every source requires rights, PIT semantics, revision handling, checkpoints, retry/rate limits, health monitoring, fallback, failure isolation, Secret redaction, and local-only boundaries.

External API failure must not stop LINE or the daily pipeline.

## 9. Parallel discovery boundary

Lightweight discovery may continue in `discovery-sandbox`, but it must not:

- add active Edge count
- change Production Gate
- create BUY recommendations
- affect score, LINE, order, holdout, or confirmatory sample
- use SNS/forums/influencers as Evidence
- displace the real Foundation pilot

## 10. GitHub Actions and runner invariants

Canonical policy: `docs/operations/github-actions-cost-control.md`

Executable guard:

```bash
node --import tsx/esm scripts/verify-github-actions-cost-control.ts
```

Mandatory invariants:

- feature branches do not run unrestricted push plus pull_request validation
- push-triggered full validation is main-only
- one heavy command has one workflow owner
- Draft is lightweight; Ready/main is full
- superseded PR runs are cancelled
- unrelated research/docs changes do not run Cloudflare build CI
- successful PRs do not upload large artifacts
- standard `ubuntu-latest` only
- Larger/GPU/macOS/Windows runners require separate human-approved evidence
- manual Research OS dispatch does not write commits
- workflow changes must pass the executable guard and real runner steps

Cloudflare Build Token failures are separate from GitHub runner failures. Wrangler dry-run success proves bundle validation, not production deployment.

## 11. Current safety statement

The Foundation integration changed code, schemas, tests, documentation, and generated Research OS indexes only.

It did not change:

- Secrets or tokens
- billing or paid APIs
- real price/Evidence data
- LINE delivery behavior
- BUY notifications
- brokerage orders
- Cloudflare production deployment
- D1 production data
- active Edge count or Production Gate
