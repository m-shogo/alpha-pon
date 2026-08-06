# Handoff — Testable Hypothesis / Scenario v1

Status: `IMPLEMENTED_AWAITING_FULL_VALIDATION`
Updated: 2026-08-06 JST
Parent branch: `feat/evidence-package-manifest-v1`
Branch: `feat/testable-hypothesis-scenario-v1`

## Purpose

Turn one governed complete Evidence Package into a preregistered, falsifiable
research hypothesis and a mandatory four-path scenario set. Prevent facts,
assumptions and forecasts from being mixed, and prevent outcomes from being
used to rewrite the original research plan.

## Implemented

- TestableHypothesisRecord schema;
- HypothesisScenarioRecord schema;
- HypothesisScenarioSet schema;
- deterministic hashes for all three record types;
- exact Evidence Package ID/hash/candidate/security/cutoff pins;
- fact / assumption / forecast Claim separation;
- package-subset checks for Claim, Evidence and Document-change references;
- ordered mechanism steps;
- weakening and invalidating falsification conditions;
- preregistration timing checks;
- metric / benchmark / entry / horizon / cost / corporate-action / holdout plan;
- downside / base / upside / null-hypothesis mandatory scenario matrix;
- scenario direction and Evidence checks;
- governed scenario-set registration timing;
- target-price field rejection;
- registered-record terminal lifecycle;
- draft supersession ledgers;
- duplicate / missing parent / identity mutation / cycle / multiple-head checks;
- owner-token three-file writer, journal and fsync;
- local repository scanner and focused CLI;
- core, ledger, writer and file-backed repository fixtures;
- local-only runtime boundary and README.

## Evidence Package boundary

A registered hypothesis requires one exact governed complete package:

```text
evidencePackageId
evidencePackageHash
candidateId
listedSecurityEntityId
informationCutoff
```

The hypothesis may reference only Claims, support Evidence and confirmed
Document-change references pinned by that package.

## Claim separation

Registered hypotheses contain disjoint sets:

```text
factClaimIds
assumptionClaimIds
forecastClaimIds
```

Every ID must resolve to the matching Claim class. Mechanism steps may use only
Claims already registered in one of those sets.

This prevents a model opinion or scenario assumption from being relabeled as a
fact.

## Falsification and registration

A hypothesis requires at least two falsification conditions and at least one
`invalidates` condition. Every check deadline must be after the information
cutoff. Registration must occur:

- after record creation;
- before the earliest falsification deadline;
- while the Evidence Package is complete and blocker-free.

A late record cannot be backdated into a registered hypothesis.

## Evaluation plan

A registered hypothesis pins:

```text
primaryMetric
secondaryMetrics
issuer / TOPIX / sector benchmark roles
entryRule
horizonTradingDays
evaluationDelayDays
transactionCostModelVersion
corporateActionPolicyVersion
holdoutPolicy
```

All three benchmark roles are mandatory for registered hypotheses. The plan is
research governance only; it does not authorize execution.

## Scenario matrix

Each registered set contains exactly one:

```text
downside
base
upside
null_hypothesis
```

Scenarios pin the same hypothesis, Evidence Package hash and information
cutoff. Their assumptions may use only registered assumption/forecast Claims.
Every scenario includes observable triggers, invalidation conditions and at
least two outcome dimensions including market reaction.

Direction contract:

- downside market reaction = negative;
- upside market reaction = positive;
- null hypothesis market reaction = neutral or unknown.

No target-price field is allowed.

## Governed set registration

A set is registered only when:

1. the hypothesis is registered;
2. the Evidence Package is complete;
3. all four scenarios are present and registered;
4. package/hypothesis/cutoff/hash identities agree;
5. set registration follows all component registrations;
6. set registration precedes the earliest scenario check window.

Any failure keeps the set draft with explicit blockers.

## Append-only lifecycle

Registered records are terminal. They are not edited or superseded after
outcomes appear. New Evidence requires:

```text
new Evidence Package
-> new Hypothesis
-> new four-scenario set
```

Draft records may be replaced through append-only supersession while preserving
chain identity. The ledgers reject duplicate IDs/hashes, missing parents,
identity changes, time/cutoff regression, self-reference, cycles and multiple
active heads.

## Persistence safety

Runtime files:

```text
research/hypothesis_scenarios/hypotheses.jsonl
research/hypothesis_scenarios/scenarios.jsonl
research/hypothesis_scenarios/scenario-sets.jsonl
```

The authoritative writer validates existing + incoming records in one critical
section and journals:

```text
prepared
hypotheses_appended
scenarios_appended
committed
```

It appends and fsyncs. A remaining journal is an operations incident and must
not be auto-resumed or deleted.

Real records are ignored by Git.

## Authoritative APIs

```text
validateTestableHypothesisRecord
validateHypothesisScenarioRecordGoverned
buildHypothesisScenarioSetGoverned
validateHypothesisScenarioSetGoverned
validateHypothesisScenarioBundle
validateHypothesisScenarioLedgers
appendHypothesisScenarioRecordsGoverned
validateHypothesisScenarioRepository
```

## Activation gate

`TESTABLE_HYPOTHESIS_SCENARIO_V1_GREEN` remains unproven until:

1. exact latest HEAD passes full typecheck and tests;
2. GitHub Actions executes real runner steps and passes;
3. a real governed complete Evidence Package is available;
4. at least one hypothesis is registered before outcomes;
5. all four scenarios are registered before their check windows;
6. identical inputs reproduce identical record and set hashes;
7. package corrections create new hypotheses instead of mutating registered ones;
8. outcome review uses the pinned evaluation plan and holdout policy;
9. Council Replay pins the exact package/hypothesis/scenario-set hashes;
10. synthetic hypotheses do not move active Edge or Production Gate state.

Code and synthetic fixtures alone do not mark the milestone green.

## Validation commands

```bash
pnpm typecheck
pnpm typecheck:tests
pnpm research:validate
pnpm research:test
node --import tsx/esm src/research/cli/validate-testable-hypothesis-scenarios.ts
node --import tsx/esm tests/research/testable-hypothesis-scenario.test.ts
node --import tsx/esm tests/research/testable-hypothesis-scenario-ledger.test.ts
node --import tsx/esm tests/research/testable-hypothesis-scenario-writer.test.ts
node --import tsx/esm tests/research/testable-hypothesis-scenario-repository.test.ts
```

These commands are documented but have not been executed against the exact
latest HEAD in this session. GitHub Actions has not completed real runner steps.

## Protected boundaries

- no real hypothesis or scenario records committed to Git;
- no probability fabricated without calibration;
- no target-price field;
- no automatic Council verdict;
- no Recommendation / BUY generation;
- no automatic order placement;
- no active Edge / Production Gate movement;
- no live LINE send;
- no secrets, price data, Cloudflare, D1 or billing changes.

## Next slice

1. Council Replay integration for package/hypothesis/scenario-set hashes;
2. Decision Firewall integration through immutable inputs;
3. Outcome Review records using the preregistered plan;
4. real disclosure/correction pilot;
5. scenario calibration only after sufficient issue-time-compatible outcomes.
