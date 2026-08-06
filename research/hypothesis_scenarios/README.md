# Testable Hypothesis / Scenario v1

This directory stores local append-only TestableHypothesisRecord,
HypothesisScenarioRecord and HypothesisScenarioSet JSONL rows. Real records are
ignored by Git. Schemas, validators, synthetic fixtures and this README remain
versioned.

## Runtime files

```text
research/hypothesis_scenarios/hypotheses.jsonl
research/hypothesis_scenarios/scenarios.jsonl
research/hypothesis_scenarios/scenario-sets.jsonl
```

Do not commit real hypotheses, scenario assumptions, price/benchmark data,
portfolio data or licensed Evidence.

## Purpose

Convert a governed complete Evidence Package into a preregistered,
falsifiable research proposition. The system must know before outcomes are
observed:

- which facts are accepted;
- which assumptions remain assumptions;
- which forecasts are being tested;
- how the mechanism is expected to work;
- what would weaken or invalidate the idea;
- which metrics and benchmarks will judge it;
- which downside, base, upside and null paths must be considered.

A hypothesis is not a Recommendation, BUY, target price or order.

## Evidence Package boundary

A registered hypothesis pins one exact complete Evidence Package:

```text
evidencePackageId
evidencePackageHash
candidateId
listedSecurityEntityId
informationCutoff
```

The package must have no blockers. Claim IDs, support Evidence IDs and Document
change references must be exact subsets of the package.

## Claim-class separation

Every registered hypothesis separates:

```text
factClaimIds
assumptionClaimIds
forecastClaimIds
```

The sets are disjoint. Each ID must resolve to the matching Claim class in the
Claim / Contradiction Graph. Scenario assumptions may use only registered
assumption and forecast Claims.

## Mechanism and falsification

Mechanism steps are ordered from 0 and must be contiguous. Every step pins its
input Claim IDs and an explicit output statement.

Each hypothesis has at least two falsification conditions and at least one must
invalidate the hypothesis. Registration must occur before the earliest
falsification deadline.

## Evaluation plan

A registered hypothesis pins:

- primary and secondary metrics;
- issuer, TOPIX and sector benchmark roles;
- entry rule;
- trading-day horizon;
- evaluation delay;
- transaction-cost model version;
- corporate-action policy version;
- registered holdout / walk-forward / out-of-sample policy.

The entry rule is descriptive research governance. It does not authorize an
order.

## Required scenario set

A registered scenario set contains exactly one of each:

```text
downside
base
upside
null_hypothesis
```

Each scenario pins:

- the exact hypothesis and Evidence Package hash;
- assumption Claim IDs;
- observable triggers;
- invalidation conditions;
- operational and market-reaction outcome dimensions;
- evidence references and horizons.

Downside must have negative market-reaction direction, upside positive, and the
null hypothesis neutral or unknown. Target-price fields are not permitted.

## Registration timing

A governed scenario set is registered only when:

- the hypothesis is registered;
- the Evidence Package is complete;
- all four scenarios are registered;
- scenario set registration follows all component registrations;
- registration occurs before the earliest trigger/invalidation check window.

Missing or late registration keeps the set draft with explicit blockers.

## Append-only lifecycle

```text
draft -> new draft record through supersession
registered -> terminal
```

Registered hypotheses, scenarios and scenario sets cannot be rewritten or
superseded. New Evidence requires a new Evidence Package and a new hypothesis.

The ledgers reject duplicate IDs/hashes, missing parents, identity changes,
time/cutoff regression, self-reference, cycles and multiple active heads.

## Authoritative APIs

```text
validateTestableHypothesisRecord
validateHypothesisScenarioRecordGoverned
buildHypothesisScenarioSetGoverned
validateHypothesisScenarioSetGoverned
validateHypothesisScenarioBundle
appendHypothesisScenarioRecordsGoverned
validateHypothesisScenarioRepository
```

## Persistence safety

The writer validates existing + incoming history inside one owner-token lock,
then writes a three-file journal:

```text
prepared
hypotheses_appended
scenarios_appended
committed
```

It appends and fsyncs each file. If
`hypotheses.jsonl.batch-journal.json` remains, do not auto-resume or delete it.
Inspect all three tails and perform an explicit versioned repair.

## Validation

```bash
node --import tsx/esm src/research/cli/validate-testable-hypothesis-scenarios.ts
pnpm research:validate
pnpm research:test
pnpm typecheck
pnpm typecheck:tests
```

No local record means the contracts may validate, but the milestone remains
unproven. Registered scenarios remain research inputs only and never authorize
Recommendation or execution.
