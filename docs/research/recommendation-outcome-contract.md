# Recommendation & Outcome Persistence Contract v2

Status: `IMPLEMENTED_GOVERNED_LEARNING_CHAIN_REAL_PILOT_PENDING`
Updated: 2026-08-07 JST
Depends on: [PIT Price Store v1](pit-price-store.md), Research OS Registry / Backtest / Gate, Foundation Evidence contracts

## 1. Purpose

Alpha Pon may support BUY candidate / WATCH / WAIT / AVOID decisions when evidence genuinely supports them. It is not an automatic-trading system. No contract in this chain authorizes a brokerage order, automatic Production promotion, silent Edge Gate mutation or automatic learned-rule application.

Every Recommendation freezes its issue-time conditions. Outcomes, reviews, learning proposals, human decisions, shadow evaluations and change-preparation records are append-only descendants. Later knowledge must never be written back into the original judgment.

The chain is deliberately longer than a simple “prediction → correct/incorrect → update rule” loop because each transition has a separate authority boundary.

## 2. Implemented chain

Merged implementation chain:

```text
#110 Recommendation Persistence v1
#111 Recommendation benchmark PIT provenance hardening
#112 Quantitative Outcome Persistence v1
#113 Evidence-backed Corporate Action Clearance v1
#114 Corporate Action gate for raw/unadjusted quantitative Outcomes
#116 Governed Semantic Outcome Review v1
#117 Deterministic Outcome Review Due orchestration v1
#118 Governed Outcome Learning Proposal v1
#119 Learning Proposal schema / central-validation hardening
#120 Governed Human Learning Decision v1
#121 Governed Shadow Evaluation v1
#122 Final Human Adoption Decision v1
#123 Governed Change Preparation Manifest v1
#124 Human rejection path for provisional AI learning drafts
#125 Deterministic Learning Status read model v1
```

Current high-level flow:

```text
issue-time Recommendation
  -> PIT quantitative Outcome
  -> governed Semantic Review
  -> governed Learning Proposal
  -> Human Learning Decision
  -> independent Shadow Evaluation
  -> Final Human Adoption Decision
  -> Governed Change Preparation Manifest
  -> manual PR preparation for human review
```

No arrow above implies automatic application.

## 3. Evidence separation

Every Recommendation persists these buckets separately:

```text
newFacts
knownFacts
assumptions
forecasts
opinions
```

The same statement cannot be stored in multiple buckets.

Evidence tiers usable by governed decisions:

```text
Tier A  IR / TDnet / EDINET / JPX / government / audit / statutory material
Tier B  official/objective exchange, flow, POS, reservation, traffic, demand/supply or capex data
Tier C  confirmed company official SNS/video/presentation supplements
Tier D  general reporting / technical or industry explanation
Discovery only  anonymous/general SNS, boards, rumors, influencer recommendations
```

Discovery-only sources cannot be promoted into canonical decision evidence merely because they were useful for discovery.

## 4. RecommendationRecord — implemented

Canonical schema:

`research/schemas/recommendation-record.schema.json`

Implementation:

`src/research/recommendation-persistence.ts`

The record freezes:

- Recommendation ID, issuer identity, `issuedAt`, `informationCutoff`;
- decision and time horizon;
- current price plus exact PIT Price Store hash / first-executable timestamp;
- buy/target ranges only with explicit basis refs;
- confidence / scenario probabilities only with explicit basis refs;
- bull/base/bear scenarios;
- catalysts, risks, confirmation, invalidation and exit conditions;
- separated fact/assumption/forecast/opinion buckets;
- Evidence refs / tiers;
- Edge IDs;
- exact issuer / TOPIX / sector baseline PIT hashes and executable timestamps;
- review date, status, revision lineage and deterministic content hash;
- `automaticTradingAuthorized=false`.

Key invariants:

- no post-cutoff Evidence;
- no secret/token-like refs;
- no unknown-price-license decision baseline;
- issuer/TOPIX/sector baseline records are hash-recomputed;
- BUY requires an eligible non-catalog-only Edge;
- no fabricated confidence / probability / price range;
- append-only linear revisions; no fork;
- rejected append leaves previous JSONL unchanged.

## 5. Quantitative Outcome — implemented

Schema:

`research/schemas/quantitative-outcome-record.schema.json`

Implementation:

`src/research/quantitative-outcome.ts`

Measurement method:

```text
pit-close-common-date-v1
```

Return basis:

```text
unadjusted-close-price-return-corporate-action-cleared-v1
```

The exact Recommendation baseline hashes are reused for issuer, general benchmark and sector benchmark. All three baselines must share one trading date.

Post-issue rows must be from the same series/source/provider plan, be executable only after issue time, be observable by review time, have valid content hashes and known license. When revisions exist for a trading date, only the latest revision observable at review time is eligible.

The terminal comparison date is the latest common issuer/TOPIX/sector trading date. Issuer-only future rows cannot extend the measurement horizon.

Measured fields include:

- max close return;
- close-to-close max drawdown;
- terminal issuer return;
- benchmark and sector return;
- benchmark and sector excess return;
- deterministic target assessment.

The validator rebuilds the expected record from Recommendation + PIT prices + clearance. Re-hashing fabricated metrics does not make them valid.

### Corporate Action clearance

Raw/unadjusted issuer returns require an immutable `CorporateActionClearanceRecord`:

- exact hash recomputation;
- `status=clear`;
- issuer/source/provider identity match;
- full baseline-to-terminal coverage;
- clearance assessed no later than review time.

The raw issuer path must remain `adjusted=false`, `adjustmentFactor=1`, `corporateActions=[]`. Adjusted/raw mixing or detected corporate actions fail closed.

Current metrics are price returns, not dividend-inclusive total shareholder return.

## 6. Semantic Outcome Review — implemented

Schema:

`research/schemas/outcome-semantic-review.schema.json`

Implementation:

`src/research/outcome-semantic-review.ts`

This layer interprets the immutable Recommendation + Quantitative Outcome without changing either one.

It records:

- invalidation assessment;
- final semantic verdict;
- assumption assessments;
- correct / incorrect assumptions;
- missing Evidence;
- unexpected confounders;
- lessons;
- proposed rule changes;
- exact source Evidence refs and cutoff;
- reviewer identity and authority.

Authority is explicit:

```text
provisional_ai  -> proposal_only
human_confirmed -> human_confirmed
```

An AI review cannot claim human-confirmed learning authority. Human-confirmed authority cannot later regress to provisional AI in the same review lineage.

The validator rejects post-cutoff Evidence, undeclared finding Evidence, hindsight assumptions, invalidation rules not present in the original Recommendation and stale/tampered upstream hashes.

Safety flags remain false for automatic rule mutation, Edge Gate mutation and trading.

## 7. Review Due orchestration — implemented

Implementation:

`src/research/outcome-review-due.ts`

Review status is a pure derivation from immutable Recommendation / Quantitative Outcome / Semantic Review records. It does not rewrite Recommendation status behind the scenes.

Derived states include:

- `not_due`;
- `quantitative_due`;
- `semantic_review_due`;
- `human_confirmation_due`;
- `reviewed_current`.

Due dates and overdue days use JST calendar semantics. A newer Quantitative Outcome revision makes a human review pinned to an older Outcome stale for current completion.

## 8. Governed Learning Proposal — implemented

Schema:

`research/schemas/outcome-learning-proposal.schema.json`

Implementation:

`src/research/outcome-learning-proposal.ts`

Semantic lessons do not modify a rule directly. They may become a Learning Proposal containing:

- target kind / target ref;
- exact proposed change;
- problem and rationale;
- expected effect;
- evaluation method;
- success / failure criteria;
- minimum Evidence requirement;
- falsification conditions;
- rollback plan;
- Evidence refs.

An upstream validator witness for the Semantic Review hash is mandatory.

AI provisional review can produce only `draft_proposal`. A human-confirmed review may produce a conservative draft or `human_review_ready` proposal.

All proposal records fix:

```text
humanApprovalRequired=true
automaticApplyAuthorized=false
ruleMutationAuthorized=false
edgeGateMutationAuthorized=false
codeMutationAuthorized=false
automaticTradingAuthorized=false
```

## 9. Human Learning Decision — implemented

Schema:

`research/schemas/outcome-learning-decision.schema.json`

Implementation:

`src/research/outcome-learning-decision.ts`

Only a registered human reviewer can create this decision.

Possible decisions:

- `defer`;
- `advance_to_shadow`;
- `reject`.

`defer` and `advance_to_shadow` require `proposalStage=human_review_ready`.

A provisional AI `draft_proposal` cannot be deferred or advanced. A human may explicitly `reject` it so AI drafts do not become permanent orphan records.

`advance_to_shadow` authorizes only shadow evaluation. It does not authorize any rule/code/Gate change.

Only `defer` may be revised; `advance_to_shadow` and `reject` are terminal at this layer.

## 10. Governed Shadow Evaluation — implemented

Schema:

`research/schemas/outcome-learning-shadow-evaluation.schema.json`

Implementation:

`src/research/outcome-learning-shadow-evaluation.ts`

Entry requires a validated `advance_to_shadow` Human Decision.

The Proposal preregistration is frozen:

- evaluation method;
- success criteria;
- failure criteria;
- minimum Evidence requirements;
- falsification conditions.

Count, order and criterion text must match the Proposal exactly.

Shadow Evidence must be independently validated, observed by `evidenceCutoff`, used by at least one criterion assessment and must not simply recycle the Evidence that created the Proposal.

Verdict is deterministic:

```text
interim -> inconclusive
failure criterion met -> rejects_change
falsification met -> rejects_change
all success met + all failures absent + minimum Evidence met + falsifications absent
  -> supports_change
otherwise -> inconclusive
```

A manually changed/re-hashed verdict is rejected.

`supports_change` is not adoption authority.

## 11. Final Human Adoption Decision — implemented

Schema:

`research/schemas/outcome-learning-adoption-decision.schema.json`

Implementation:

`src/research/outcome-learning-adoption-decision.ts`

Only a registered human can decide:

- `defer`;
- `approve_change_preparation`;
- `reject`.

Approval is possible only after a validated **final** Shadow Evaluation with `verdict=supports_change`.

Approval means only:

```text
governedChangePreparationAuthorized=true
```

It still fixes automatic apply / rule / Gate / code / trading authority to false.

New Evidence cannot be injected at adoption time. If materially new Evidence appears, create a new governed learning cycle instead of rewriting the final Shadow conclusion.

## 12. Governed Change Preparation Manifest — implemented

Schema:

`research/schemas/outcome-learning-change-preparation.schema.json`

Implementation:

`src/research/outcome-learning-change-preparation.ts`

A validated `approve_change_preparation` Adoption Decision may create a manifest that freezes:

- adopted target;
- exact proposed change;
- rollback plan;
- human adoption conditions;
- planned repo artifacts and purpose;
- validation requirements;
- explicit non-goals;
- preparer identity.

Lifecycle:

```text
draft -> ready_for_pr
```

The manifest rejects absolute/traversal/duplicate paths and protected preparation scope such as `.github/*`, `.env*`, `wrangler.toml`, secret/credential/billing-like paths. A ready manifest containing implementation artifacts requires an explicit test artifact.

The manifest uses `implementationMode=manual_pr_only` and authorizes PR preparation only. It does not mutate code itself.

## 13. Learning Status read model — implemented

Implementation:

`src/research/outcome-learning-status.ts`

The read model creates no new lifecycle state. It derives current status from immutable Proposal / Human Decision / Shadow / Adoption / Change Preparation lineages.

Every input record must recompute to its content hash and have an explicit validator witness. Duplicate IDs, missing parents, cycles and revision forks are rejected before status output.

Derived next actions include:

- review provisional AI proposal;
- make/revisit Human Learning Decision;
- run/continue Shadow Evaluation;
- make/revisit Final Adoption Decision;
- create/finalize Change Preparation;
- prepare a governed PR for human review;
- none.

Human-action states sort ahead of machine/research-executor actions. Decisions attached to superseded Proposal revisions are surfaced as stale downstream records rather than silently treated as current authority.

## 14. Safety boundary

No implemented record in this chain authorizes:

- brokerage orders or automatic trading;
- automatic position sizing;
- real LINE BUY delivery by itself;
- silent Edge Production promotion;
- direct rule/Gate/model mutation from a lesson;
- automatic code changes from a Proposal;
- workflow/runner changes from learned outcomes;
- Secret, billing or Cloudflare Production mutation.

The chain intentionally stops at governed PR preparation. Any actual code/rule/Gate change remains a separate explicit implementation + review action.

## 15. Current Definition of Done

- [x] Recommendation schema / validator / append-only revisions — #110
- [x] issuer/TOPIX/sector PIT baseline pins and hash recomputation — #110/#111
- [x] Evidence separation / post-cutoff / BUY Edge gates — #110
- [x] quantitative Outcome metrics / common-date alignment / revisions — #112
- [x] Evidence-backed Corporate Action Clearance — #113
- [x] raw Outcome corporate-action gate — #114
- [x] governed Semantic Outcome Review — #116
- [x] deterministic JST review-due orchestration — #117
- [x] governed Learning Proposal — #118/#119
- [x] governed Human Learning Decision — #120/#124
- [x] independent governed Shadow Evaluation — #121
- [x] Final Human Adoption Decision — #122
- [x] governed Change Preparation Manifest — #123
- [x] deterministic Learning Status read model — #125
- [x] synthetic tamper / fork / hindsight / authority / append-immutability regressions
- [ ] first real Recommendation / Outcome / Semantic Review cycle using real local Foundation data
- [ ] first real human-confirmed Learning Proposal, Shadow evaluation and Adoption cycle
- [ ] first real governed change PR produced from a validated ready manifest

Synthetic green tests prove implementation integrity, not investment Edge validity. Real milestones remain blocked until the local-only Foundation pilot supplies genuine Evidence, price/benchmark objects and human-reviewed records.
