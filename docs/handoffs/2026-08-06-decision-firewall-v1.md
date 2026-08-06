# Handoff — Decision Firewall v1

Status: `IMPLEMENTED_AWAITING_FULL_VALIDATION`
Updated: 2026-08-06 JST
Parent branch: `feat/stock-pro-council-v2-calibration`
Branch: `feat/decision-firewall-v1`

## Purpose

Prevent a valid-looking replay or council narrative from jumping directly into
a Recommendation candidate. Evidence completeness, unknowns, execution reality,
binding vetoes and personal suitability are evaluated at an explicit immutable
boundary.

## Implemented

- DecisionFirewallRecord schema;
- deterministic content hash;
- replay/run/cutoff identity pins;
- Replay Manifest and Replay Result hash pins;
- Evidence Package and PIT Price Snapshot pins;
- Security Master / Evidence Store / Market Calendar versions;
- Evidence Readiness checklist;
- required Unknown Budget categories;
- stock versus personal eligibility separation;
- binding-veto propagation;
- append-only revision chains;
- owner-token single-writer + `fsync`;
- local repository scanner;
- focused validator CLI;
- Research OS validation/test integration;
- local-only directory boundary and README.

## Evidence Readiness

All fields must be true for stock Recommendation-candidate eligibility:

- normalized evidence;
- claim graph;
- falsifiable hypothesis;
- primary sources;
- contradiction review;
- correction chain completeness;
- issuer/TOPIX/sector benchmark completeness;
- executable route completeness;
- reproducible scenario assumptions.

## Unknown Budget

Exactly one entry is required for each category:

```text
entity
time
license
source
evidence_gap
execution
confounder
counterfactual
valuation
liquidity
portfolio_exposure
```

- `known` and `resolved` require evidence references;
- blocking `unknown` values become explicit blockers;
- `portfolio_exposure` is separated from the independent stock thesis;
- unknowns are never collapsed into one opaque confidence number.

## Output separation

```text
stockRecommendationCandidateEligible
personalRecommendationCandidateEligible
```

A stock thesis can remain eligible while personal suitability is not assessed,
WAIT or AVOID. Personal eligibility can never be true when stock eligibility is
false.

## Hard blockers

- replay not eligible;
- required persona abstention/veto propagated from replay;
- active binding veto;
- incomplete Evidence Readiness field;
- blocking unknown outside portfolio exposure;
- unresolved execution, license, entity, time or source boundary;
- Replay/Evidence/Price hash mismatch;
- invalid or future-inconsistent snapshot.

Calibration, support votes and CIO narrative cannot clear a binding veto.

## Append-only lifecycle

- revisions use `supersedesFirewallId`;
- `candidateId` remains stable;
- createdAt increases monotonically;
- informationCutoff cannot regress;
- one candidate has one active head;
- failed or blocked records remain in history.

## Activation gate

Decision Firewall remains `IMPLEMENTED_AWAITING_FULL_VALIDATION` until:

1. exact latest HEAD passes full typecheck/tests;
2. GitHub Actions executes real runner steps and passes;
3. at least one local Council Replay resolves all immutable inputs;
4. at least one local Decision Firewall record is created;
5. repeated validation reproduces the same content/result hashes;
6. no active Edge or Production Gate movement occurs from synthetic evidence.

Code and synthetic fixtures alone do not mark the milestone green.

## Validation

```bash
pnpm exec tsc --noEmit
pnpm exec tsc --noEmit -p tsconfig.test.json
pnpm research:validate
pnpm research:test
node --import tsx/esm src/research/cli/validate-decision-firewall.ts
node --import tsx/esm tests/research/decision-firewall.test.ts
node --import tsx/esm tests/research/decision-firewall-repository.test.ts
```

## Protected boundaries

- no Recommendation persistence integration;
- no BUY/target price generation;
- no automatic order placement;
- no active Edge or Production Gate movement;
- no live LINE send;
- no secrets, real prices, Cloudflare, D1 or billing changes;
- no user portfolio data in Git.

## Next slice

1. Recommendation Candidate record consumes only a valid Firewall head;
2. Recommendation/Outcome persistence remains append-only;
3. portfolio suitability and position sizing remain downstream overlays;
4. real Evidence Package and Unknown Budget backfill;
5. first Known-Bad case replay without live order.
