# Alpha Pon Current Roadmap — 2026-08-06

Status: `ACTIVE_CANONICAL_ROADMAP`
Updated: 2026-08-12 JST
Canonical repository: `m-shogo/alpha-pon`
Production trading use: `PROHIBITED_UNTIL_VALIDATED`

This document supersedes earlier dated roadmaps when priorities or integration state conflict. GitHub exact SHAs, actual workflow steps, committed Research OS records, current sub-roadmaps, and this roadmap are authoritative. Conversation memory and old PR descriptions are not authoritative.

## 1. Product objective

Alpha Pon discovers research candidates early, preserves point-in-time Evidence, makes only evidence-supported decision calls, and later answer-checks them without hindsight rewriting.

```text
world/company event
-> normalized Evidence
-> Claim / Contradiction Graph
-> immutable Evidence Package
-> preregistered Hypothesis and four Scenarios
-> Stock Pro Council deterministic replay
-> cross-stack Decision boundary
-> research candidate / governed Recommendation
-> quantitative Outcome
-> semantic review
-> governed learning proposal
-> human decision
-> independent shadow evaluation
-> final human adoption decision
-> governed change preparation
-> separate reviewed implementation PR
```

It is not an automatic BUY generator and not an automatic trading system.

## 2. Confirmed current state

### Operational foundations

- Repository visibility is public.
- GitHub Actions uses standard `ubuntu-latest` runners.
- Draft/Ready cost controls, PR-aware concurrency, path filters and short artifact retention are active.
- GitHub-hosted runners currently execute real checkout/install/test steps.
- Cloudflare browser-facing behavior remains public read-only. No public write API, BUY path or automatic order path is authorized.
- LINE consolidated notification and pipeline non-fatal behavior remain merged and unchanged.
- Known-Bad Event Repricing remains Research OS research-only; no Production promotion is authorized.
- Runner/workflow controls are not a general-purpose tuning surface. Do not change them without a measured workflow defect and explicit evidence.

### Foundation integration on main

The core Foundation stack is merged:

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

PR #43 is a closed/unmerged legacy reference as of 2026-08-10 and must not be merged. PR #52 is the canonical cross-stack Decision integration.

### EDINET configured / reviewed chain on main

The former “EDINET Version 2 migration” milestone is no longer an unimplemented placeholder. The repository now contains the configured issuer, local acquisition, source-fidelity, human review, parity and Foundation-readiness chain.

Key merged chain:

```text
#54 EDINET v2 authentication
#55 exact document acquisition / lineage
#56 reviewed Foundation preview
#57 local reviewed-preview CLI
#58-#72 Sanrio local review / correction / fidelity / human-review chain
#73 configured issuer registry and exact issuer boundary
#74 configured inventory-only pilot
#75 legacy/configured inventory compatibility audit
#76 local read-only review dashboard
#77 Security Master/PIT/hash/revision Foundation preview mapping
#78 generic configured downstream review plan
#79 explicit configured local acquisition
#80 configured review workspace v2
#81 generic configured pipeline dashboard
#82 deterministic synthetic pipeline exporter
#83-#88 source fidelity, anchor lineage, exact comparison and human review
#89 Sanrio legacy/configured parity workspace
#90 Sanrio parity human finalizer
#92 parity implementation gate closed; real parity Evidence required next
```

Current EDINET sub-roadmap:

`docs/roadmaps/alpha-pon-edinet-nonblocking-status-2026-08-06.md`

Important boundary: GitHub/CI synthetic fixtures cannot satisfy the real local parity/Foundation gate. Do not synthesize or infer that Evidence.

### Recommendation / Outcome / governed learning chain on main

The issue-time Recommendation and later learning governance are now implemented synthetically and enforced by central validation.

```text
#110 Recommendation Persistence v1
#111 benchmark PIT provenance hardening
#112 Quantitative Outcome v1
#113 Corporate Action Clearance v1
#114 raw Outcome corporate-action gate
#116 Semantic Outcome Review v1
#117 deterministic Review Due orchestration
#118 Governed Learning Proposal v1
#119 Proposal schema / central-validation hardening
#120 Human Learning Decision v1
#121 governed Shadow Evaluation v1
#122 Final Human Adoption Decision v1
#123 Change Preparation Manifest v1
#124 human rejection path for provisional AI drafts
#125 deterministic Learning Status read model v1
```

Canonical contract:

`docs/research/recommendation-outcome-contract.md`

The chain intentionally separates:

```text
AI provisional review
!= human-confirmed review
!= learning proposal
!= human advance-to-shadow decision
!= shadow supports_change
!= final human adoption
!= change preparation
!= actual code/rule/Gate mutation
```

No implemented learning record authorizes automatic application or trading.

## 3. What the merged Foundation enforces

### PIT Price / execution reality

- local-only real price storage;
- issue-time cutoff behavior;
- deterministic hash / replay guards;
- no licensed real price rows committed to Git;
- explicit first-executable timestamps.

### Stock Pro Council

- persona jurisdiction;
- abstain preservation;
- dissent and binding veto ledgers;
- deterministic replay;
- calibration / minimum-sample gates;
- majority narrative cannot clear a hard veto.

### Data / Evidence

- stable issuer/security identity;
- bitemporal Evidence and correction chains;
- fact / assumption / forecast / opinion / unknown separation;
- contradiction and invalidation preservation;
- Document Revision / Diff snapshots;
- governed complete Evidence Package;
- preregistered Testable Hypothesis;
- downside / base / upside / null_hypothesis Scenario Set.

### Cross-stack Decision integration

The canonical integration resolves actual repository objects rather than accepting opaque hashes alone and fails closed for missing, superseded, draft, incomplete, future-leaking, identity-mismatched, hash-mismatched, blocking-unknown, contradictory, unregistered, abstaining or vetoed inputs.

### Outcome learning governance

- Recommendation issue-time facts and prices are immutable;
- quantitative Outcome is PIT-reconstructable;
- corporate actions cannot silently become fake returns;
- semantic interpretation is separate from quantitative metrics;
- AI review cannot claim human authority;
- proposed learned changes cannot apply themselves;
- shadow criteria are preregistered and independent Evidence is required;
- final human adoption still authorizes only change preparation;
- Change Preparation rejects workflow/Secret/billing/Production scope;
- the current learning state is derived read-only from validated immutable lineage.

## 4. Milestone status

```text
PIT_PRICE_STORE_V1_REAL_RUNNER_GREEN                 COMPLETE
STOCK_PRO_COUNCIL_V2_CHAIN_MERGED                    COMPLETE
DATA_EVIDENCE_CHAIN_MERGED                           COMPLETE
EDINET_CONFIGURED_REVIEW_CHAIN_GREEN                 COMPLETE — implementation / synthetic validation
RECOMMENDATION_OUTCOME_GOVERNANCE_V1_GREEN           COMPLETE — implementation / synthetic validation
GOVERNED_LEARNING_CHAIN_V1_GREEN                     COMPLETE — implementation / synthetic validation
FOUNDATION_DECISION_INTEGRATION_V1_GREEN             NOT COMPLETE — code merged, real pilot absent
FIRST_REAL_LOCAL_EVIDENCE_PACKAGE                    NOT STARTED
FIRST_REAL_RECOMMENDATION_OUTCOME_CYCLE              NOT STARTED
FIRST_REAL_HUMAN_CONFIRMED_LEARNING_SHADOW_CYCLE     NOT STARTED
FIRST_GOVERNED_LEARNED_CHANGE_PR                     NOT STARTED
FIRST_PREREGISTERED_HYPOTHESIS_SCENARIO_SET          NOT STARTED
FIRST_DETERMINISTIC_COUNCIL_FIREWALL_REPLAY          NOT STARTED
KNOWN_BAD_FIRST_EXECUTABLE_EVENT_STUDY               BLOCKED BY REAL PILOT
FIRST_CONFIRMATORY_SAMPLE_READY                      NOT STARTED
```

“Implementation green” and “real-market milestone green” are different. Synthetic fixtures and real GitHub runner checks prove software integrity, not Evidence quality, Edge validity or investability.

## 5. Immediate next priority: one real local-only Sanrio pilot

Do not expand active Edge count or claim learned improvements from synthetic fixtures. The highest-value next milestone remains one bounded local-only Sanrio Foundation pilot.

Required path:

1. Finish the remaining real local EDINET human review / parity Evidence.
2. Create/confirm verified Security Master entity, listed security, issuer and listing relationships.
3. Acquire authoritative primary disclosures and preserve correction/revision lineage.
4. Reproduce before/after historical cutoffs with Bitemporal Evidence.
5. Separate fact, assumption, forecast, opinion and unknown Claims.
6. Record contradiction, correction and invalidation links.
7. Generate Document Revision / Diff snapshot.
8. Resolve issuer price, issuer benchmark, TOPIX and sector benchmark as local-only actual objects.
9. Confirm Evidence-backed Corporate Action Clearance for the measured price horizon.
10. Generate one governed complete Evidence Package.
11. Register one falsifiable Hypothesis before the outcome window.
12. Register downside, base, upside and null_hypothesis Scenarios.
13. Run deterministic Stock Pro Council Replay.
14. Run Foundation Decision integration.
15. Persist one real governed Recommendation only if the Evidence genuinely supports it.
16. Later run Quantitative Outcome and Semantic Review without hindsight mutation.
17. Re-run identical inputs and prove identical hashes.
18. Apply a correction and prove the prior historical-cutoff result remains unchanged.

Real data, licensed payloads, portfolio information and secrets remain local-only. They must not enter Git, Issue, PR, Actions artifact or chat logs.

## 6. Current human / local executor boundary

The real pilot needs a trusted local executor with access to ignored local stores and required credentials.

Current known Sanrio review boundary remains human/local. GitHub-side implementation must not fabricate completion.

Stop rather than improvise when:

- a paid API or new contract is required;
- a token or Secret must be created or rotated;
- licensed raw data would enter Git or Actions;
- a force-push or destructive local reset appears necessary;
- unknown local changes / stash / worktree could be overwritten;
- actual LINE/BUY notification, brokerage order, Cloudflare deployment or D1 write would occur.

The GitHub connector can maintain code, schemas, tests and governance, but cannot prove a local-only real-data pilot without the local records.

## 7. Known-Bad Event Repricing resumes after the pilot

After the Foundation pilot succeeds:

- separate new facts, previously known facts, assumptions, forecasts, unknowns and opinion;
- preserve eventAt / publishedAt / observedAt / retrievedAt / firstExecutableAt;
- preserve Historical Analogs, Counterfactuals and Confounders;
- calculate issuer, TOPIX and sector-adjusted paths;
- separate previous close, next open, first executable, D0, D+1, D+3, D+5 and mechanism-specific horizons;
- include fees, spread, slippage, liquidity, suspension, borrow reality, corporate actions and concurrent disclosures;
- keep holdout untouched;
- use the governed learning chain for later lessons rather than directly rewriting Edge rules.

No Production promotion before all Gate Evidence exists and a human explicitly approves the separate Production decision.

## 8. Data-source implementation order

Do not add broad sources speculatively. Add only when the real pilot exposes an Evidence Gap.

Current order:

1. Finish real local EDINET parity/Foundation Evidence using the already-implemented configured pipeline.
2. Confirm one licensed PIT issuer/TOPIX/sector price path and storage rights for the pilot.
3. Add/confirm corporate-action source Evidence needed for the measured horizon.
4. Improve TDnet/company IR normalization only for a measured pilot gap.
5. Fix market-calendar/execution reality only when the pilot exposes a concrete defect.
6. Add technology/supply-chain sources only for a specific registered Hypothesis.

Every source requires rights, PIT semantics, revision handling, checkpoints, retry/rate limits, health monitoring, fallback, failure isolation, Secret redaction and local-only boundaries.

External API failure must not stop LINE or the daily pipeline.

## 9. Nonblocking GitHub work while real pilot is human-blocked

Safe nonblocking work may improve operability around already-implemented contracts, for example:

- read-only/local learning status surfaces using `outcome-learning-status.ts`;
- validation/reporting that exposes missing real-pilot prerequisites without inventing them;
- documentation / handoff synchronization;
- deterministic fixture coverage for measured defects.

Do not use the human block as justification to build endless new governance layers, add active Edges, alter Production Gate, fabricate real Evidence or start broad API collection.

## 10. Parallel discovery boundary

Lightweight discovery may continue in `discovery-sandbox`, but it must not:

- add active Edge count;
- change Production Gate;
- create unsupported BUY recommendations;
- affect score, LINE, order, holdout or confirmatory sample;
- use SNS/forums/influencers as canonical Evidence;
- displace the real Foundation pilot.

## 11. GitHub Actions and runner invariants

Canonical policy: `docs/operations/github-actions-cost-control.md`

Executable guard:

```bash
node --import tsx/esm scripts/verify-github-actions-cost-control.ts
```

Mandatory invariants:

- feature branches do not run unrestricted push + pull_request validation;
- push-triggered full validation is main-only;
- one heavy command has one workflow owner;
- Draft is lightweight; Ready/main is full;
- superseded PR runs are cancelled;
- unrelated research/docs changes do not unnecessarily run Cloudflare build CI;
- successful PRs do not upload large artifacts;
- standard `ubuntu-latest` only;
- Larger/GPU/macOS/Windows runners require separate human-approved evidence;
- manual Research OS dispatch does not write commits;
- workflow changes require a measured defect, executable guard and real runner validation.

Cloudflare Build Token failures are separate from GitHub runner failures. Wrangler dry-run success proves bundle validation, not Production deployment.

## 12. Current safety statement

Recent Recommendation/Outcome/Learning work changed code, schemas, tests, handoffs and read-only derived status only.

It did not change:

- Secrets or tokens;
- billing or paid APIs;
- real price/Evidence data;
- LINE delivery behavior;
- BUY notifications;
- brokerage orders;
- Cloudflare Production deployment;
- D1 Production data;
- active Edge count;
- Production Gate;
- GitHub Actions runner class or workflow cost policy.
