# Handoff — Foundation Implementation PR Slices

Status: `PLANNED_BLOCKED_BY_PR37_PR38`
Updated: 2026-08-05 JST
Parent review: `docs/research/pre-edge-foundation-hardening-review.md`

## Purpose

Implement the Pre-Edge Foundation in small, reviewable pull requests without mixing unrelated stores, runtime behavior, collectors or recommendation logic.

This handoff does not authorize implementation before PR #37 and PR #38 are reconciled. It defines the safe order and acceptance tests so work can begin immediately after the blockers clear.

## Global rules for every slice

- branch from the latest measured `main`;
- one PR per bounded responsibility;
- one commit per coherent contract/test/documentation change;
- no secret, credential or licensed raw market data in Git;
- no live LINE send, Cloudflare/D1 mutation, brokerage order or automatic trading;
- no active Edge count or Production Gate movement;
- schema/validator first, runtime integration later;
- append-only records; corrections are new records;
- deterministic issue ordering and fixtures;
- fail closed at recommendation boundaries;
- preserve rejected, superseded, failed and dissenting records;
- CI green on exact PR HEAD before Ready/merge.

## Slice F00 — PIT Price Store review fixes

Branch suggestion: `fix/pit-price-store-review-gaps`
Target: PR #37 branch or a follow-up only if explicitly declared blocking.

Responsibilities:

- adjusted/unadjusted price-basis identity and selector;
- `firstExecutableAt >= max(observedAt, retrievedAt)`;
- explicit provider-available vs system-replay cutoff mode;
- reject/quarantine unknown provider plan;
- provider/source/query batch coherence;
- status/missing-reason matrix;
- corporate-action effective-time/factor safety;
- append concurrency/recovery contract.

Required tests:

- adjusted and unadjusted rows coexist without revision collision;
- mixed basis without selector throws;
- retrieval after proposed execution throws;
- system replay excludes a record retrieved after cutoff;
- provider-availability study may include it only under explicit mode;
- unknown plan and incompatible status/reason are rejected;
- future-effective action cannot alter an earlier basis;
- interrupted/partial/concurrent append fails safely.

Milestone: `PIT_PRICE_STORE_REVIEW_GAPS_GREEN`

## Slice F01 — Stock Pro Council v2 catalog schema and validator

Branch suggestion: `feat/stock-pro-council-v2-contract`

Files:

- `research/schemas/stock-pro-council-v2.schema.json`
- `research/schemas/persona-verdict.schema.json`
- `src/research/council/catalog-validation.ts`
- focused CLI/test integration

Validate:

- unique persona IDs;
- jurisdiction, required inputs, abstain and calibration fields;
- known veto-code registry;
- CIO has no hard-veto override authority;
- named-investor lenses cannot issue BUY/veto directly;
- automatic trading remains false;
- conditional personas do not inflate required quorum;
- required-persona matrix references existing personas;
- deterministic issue ordering.

Do not integrate Recommendation runtime in this slice.

Milestone: `STOCK_PRO_COUNCIL_V2_CONTRACT_GREEN`

## Slice F02 — Security Master v1

Branch suggestion: `feat/security-master-v1`

Identity model:

```text
legalEntityId
issuerId
listedSecurityId
listingId
marketId
ticker/code history
validFrom/validTo
observedAt/retrievedAt
parent/subsidiary relationships
brand/product/facility/segment relations
official source links
identifier confidence and collision state
```

Required safeguards:

- issuer and security are separate objects;
- fuzzy name alone cannot create a verified link;
- old names/codes remain resolvable by cutoff;
- parent/subsidiary and listed-subsidiary links are temporal;
- relationships are append-only/revisioned;
- ambiguous collisions are quarantined and consume Unknown Budget.

Fixtures:

- same-name companies;
- code/name change;
- merger/spin-off;
- parent and listed subsidiary;
- brand owned by a subsidiary but referenced by parent media;
- invalid overlapping validity windows.

Milestone: `SECURITY_MASTER_V1_GREEN`

## Slice F03 — PIT Universe and Benchmark Membership

Branch suggestion: `feat/pit-universe-membership-v1`

Responsibilities:

- listed/delisted/IPO/relisting states;
- market transfer and code history;
- TOPIX/sector/index membership by cutoff;
- research-universe inclusion/exclusion reason;
- membership source/revision/hash.

Required tests:

- delisted security remains in historical universe;
- today's TOPIX members are not substituted for past members;
- membership correction appends a revision;
- event study blocks when benchmark membership is unknown.

Milestone: `PIT_UNIVERSE_MEMBERSHIP_V1_GREEN`

## Slice F04 — Bitemporal Evidence Store v1

Branch suggestion: `feat/bitemporal-evidence-store-v1`

Core record:

```text
evidenceId
rawArtifactRef
normalizedClaimRef
entityRefs
eventAt
publishedAt
observedAt
retrievedAt
firstExecutableAt
effectiveFrom/effectiveTo
timestampPrecision
timezone/calendarVersion
source/license/provenance
contentHash
revision/supersession/retraction links
evidenceTier
expiry/recheckAt
```

Required tests:

- later correction does not overwrite earlier evidence;
- historical cutoff returns the then-known version;
- date-only publication uses conservative explicit timing;
- retraction/supersession chain is replayable;
- unknown license/entity/time cannot enter Recommendation evidence.

Milestone: `BITEMPORAL_EVIDENCE_STORE_V1_GREEN`

## Slice F05 — Claim, Contradiction and Revision Graph

Branch suggestion: `feat/claim-contradiction-revision-graph`

Relations:

```text
supports
contradicts
corrects
retracts
supersedes
confirms
invalidates
expires
better_peer
external_confounder
```

Required properties:

- directed typed edges;
- evidence and claim hashes;
- valid-time and knowledge-time boundaries;
- no orphan relation;
- cycles allowed only for explicitly versioned correction chains where valid;
- unresolved Tier A contradiction blocks strong recommendations.

Milestone: `CLAIM_CONTRADICTION_GRAPH_V1_GREEN`

## Slice F06 — Document Diff and State-Transition Engine

Branch suggestion: `feat/document-revision-diff-v1`

Start fixture-only with already licensed/committable synthetic documents.

Detect:

- additions/deletions;
- numeric changes with unit/context;
- wording strength changes;
- delay/withdrawal/expansion;
- responsibility/actor changes;
- correction/re-correction/withdrawal;
- unchanged material sections.

Output must reference source document versions and confidence/unknown state. Narrative-only diffs cannot advance a milestone without validator-tested records.

Milestone: `DOCUMENT_REVISION_DIFF_V1_GREEN`

## Slice F07 — Market Calendar and Execution Route v1

Branch suggestion: `feat/execution-reality-v1`

Responsibilities:

- versioned JPX sessions/holidays;
- opening/closing auction and continuous sessions;
- halt/suspension/limit state;
- first executable route;
- lot/odd-lot and order-size assumptions;
- spread/slippage/impact proxy contract;
- fees/taxes/pre-tax-vs-after-tax output;
- borrow availability/cost contract for short research.

Required tests:

- disclosure before/after close;
- holiday/weekend;
- morning/afternoon session boundary;
- halt and limit state;
- first tradable print differs from nominal next open;
- odd-lot rounding and no-fill path;
- missing execution data blocks Net Alpha.

Milestone: `EXECUTION_REALITY_V1_GREEN`

## Slice F08 — Research Preregistration and Feature Lineage

Branch suggestion: `feat/research-preregistration-v1`

Freeze before confirmatory tests:

- mechanism/hypothesis;
- sample rules;
- event timestamp rule;
- entry/exit routes;
- controls/benchmarks;
- costs;
- split/holdout;
- primary metric and stopping rule.

Feature lineage stores input refs, transform version, cutoff, first executable time and missing policy.

Required tests:

- post-outcome edits create a new registration version;
- holdout contamination is rejected;
- feature input after signal time is rejected;
- selection/universe rule is replayable.

Milestone: `RESEARCH_PREREGISTRATION_V1_GREEN`

## Slice F09 — Recommendation and Outcome persistence

Branch suggestion: `feat/recommendation-outcome-v1`

Implement the existing contract only after P2/F02/F04/F07 foundations required by the fields are available.

Add:

- immutable RecommendationRecord;
- revision via `supersedesId`;
- OutcomeRecord using explicit price basis/execution route;
- no BUY from catalog/discovery-only evidence;
- no precise probability/range without assumptions and calibration eligibility;
- preserve failed/rejected forecasts.

Required tests:

- information after cutoff cannot enter original recommendation;
- original record cannot be updated in place;
- target price with future share count is rejected;
- missing benchmark/execution blocks outcome Net Alpha;
- revised recommendation does not erase prior outcome obligation.

Milestone: `RECOMMENDATION_OUTCOME_V1_GREEN`

## Slice F10 — Decision Firewall and Unknown Budget

Branch suggestion: `feat/decision-firewall-v1`

Stages:

```text
raw -> normalized evidence -> claim -> evidence package -> hypothesis ->
scenario -> recommendation -> portfolio suitability -> explicit human order
```

Each transition returns either accepted output or structured block reasons.

Unknown types are separate and policy-driven. Define fatal-for-BUY, downgrade-to-WAIT/WATCH and informational classes.

Required tests:

- raw text cannot create Recommendation directly;
- unknown entity/license/time/execution blocks BUY;
- discovery sandbox cannot alter score/Gate/active Edge count;
- hard veto cannot be bypassed by a higher stage.

Milestone: `DECISION_FIREWALL_V1_GREEN`

## Slice F11 — Council verdict, veto and dissent ledger

Branch suggestion: `feat/council-verdict-veto-v1`

Responsibilities:

- append-only PersonaVerdict;
- sealed independent first pass;
- optional deliberation revision;
- first-class abstain/missing evidence;
- versioned veto lifecycle;
- required-persona matrix;
- append-only dissent ledger;
- CIO synthesis with no veto override.

Required tests:

- majority support cannot override PIT/accounting/execution veto;
- missing required persona => incomplete;
- abstain is not counted as support;
- veto clearance requires specified new evidence/rule revision;
- original dissent remains after a changed final decision.

Milestone: `COUNCIL_HARD_VETO_GREEN`

## Slice F12 — Decision Snapshot and Deterministic Replay

Branch suggestion: `feat/deterministic-decision-replay-v1`

Manifest pins all input/store/code/rule/model/prompt/calendar versions and hashes.

Required tests:

- replay produces byte-stable structured decision from fixture inputs;
- missing/mismatched pinned input fails closed;
- provider-available and system-replay modes remain distinct;
- manual override is preserved in an audit ledger;
- source health and Unknown Budget state are replayed.

Milestone: `DETERMINISTIC_DECISION_REPLAY_V1_GREEN`

## Slice F13 — Persona calibration v1

Branch suggestion: `feat/persona-calibration-v1`

Record by persona/jurisdiction/regime/horizon:

- sample size;
- calibration error/interval;
- false positive/negative;
- veto usefulness and false-block rate;
- economic outcome relevant to jurisdiction;
- model/persona/rule version.

No automatic production reweighting. Sparse samples shrink toward neutral. Weight changes are capped, reviewed and versioned.

Milestone: `COUNCIL_CALIBRATION_V1_GREEN`

## Slice F14 — Portfolio and Personal Suitability overlay

Branch suggestion: `feat/portfolio-suitability-v1`

Keep independent stock thesis separate from user implementation.

Inputs:

- available capital;
- holdings/exposure graph;
- NISA/account/lot constraints;
- horizon/loss tolerance;
- intended size and liquidity;
- correlated event/theme/customer risk.

A user suitability downgrade cannot rewrite the company evidence verdict.

Milestone: `PORTFOLIO_SUITABILITY_V1_GREEN`

## Slice F15 — First complete Known-Bad reconstruction

Branch suggestion: `research/known-bad-first-evidence-package`

Only after the required foundation slices are green:

- immutable primary-source timeline;
- new/known/assumption/opinion separation;
- Security Master mapping;
- corrections/retractions;
- PIT issuer/TOPIX/sector prices;
- explicit execution routes/costs;
- analog/confounder/counterfactual;
- preregistered event study;
- Recommendation candidate remains shadow-only;
- outcome/replay package.

Milestone: `KNOWN_BAD_FIRST_COMPLETE_PACKAGE_GREEN`

## Merge dependency summary

```text
PR37 fixes
  -> F01 council contracts may proceed independently
  -> F02 Security Master
  -> F03 Universe Membership
  -> F04 Evidence Store
  -> F05/F06 Graph + Diff
  -> F07 Execution Reality
  -> F08 Preregistration/Lineage
  -> F09 Recommendation/Outcome
  -> F10 Decision Firewall
  -> F11 Council runtime
  -> F12 Replay
  -> F13 Calibration
  -> F14 Portfolio overlay
  -> F15 Known-Bad complete reconstruction
```

Parallelism is allowed only where stores and contracts do not create unresolved base dependencies. Do not combine all slices into one PR.

## Final reporting template for each slice

- starting/ending main and branch HEAD;
- commits and changed files;
- exact contract implemented;
- migrations and backward compatibility;
- fixtures and commands executed;
- typecheck/test/CI/Check/Research OS results;
- active Edge/Gate count before and after;
- real prices/secrets/live LINE/orders/Cloudflare/D1/billing untouched;
- blockers classified as code/data/permission/credential/external service;
- next smallest safe slice.
