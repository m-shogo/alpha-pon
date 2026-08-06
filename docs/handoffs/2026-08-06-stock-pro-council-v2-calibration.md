# Handoff — Stock Pro Council v2 Persona Calibration

Status: `IMPLEMENTED_AWAITING_FULL_VALIDATION`
Updated: 2026-08-06 JST
Parent branch: `feat/stock-pro-council-v2-replay-firewall`
Branch: `feat/stock-pro-council-v2-calibration`

## Purpose

Allow confidence only when a persona has enough issue-time-compatible outcomes
inside its own jurisdiction, while preventing sparse samples, future outcomes,
automatic weight changes or high confidence from bypassing a hard veto.

## Implemented

- PersonaCalibrationRecord schema;
- deterministic content hash;
- append-only calibration revision chains;
- metric registration against the persona catalog;
- fixed minimum-sample policy by metric class;
- confidence interval and confidence-cap checks;
- persona/version/jurisdiction/model identity checks;
- outcome cutoff and evaluated-at PIT checks;
- bounded weight recommendations;
- explicit human-approval requirement;
- automatic-weight-application prohibition;
- governed lifecycle/status transitions;
- single-writer append with `fsync`;
- local calibration repository scanner;
- focused validator CLI;
- Replay Manifest `calibrationHashes` pins;
- calibration-aware deterministic replay;
- Research OS validation/test integration;
- local-only runtime boundary and README.

## Minimum sample policy

```text
calibration/confidence metric: 50
alpha/excess_return metric:    40
other registered metric:       30
```

This is a conservative governance floor, not proof that the sample is
statistically sufficient for every future use. Wider sector/regime/horizon
segmentation may require more observations.

## Confidence gate

A PersonaVerdict may emit confidence only when:

- `calibrationRef` resolves to an active calibration head;
- status is `eligible`;
- sample size meets the metric minimum;
- persona/version/jurisdiction/model match;
- the calibration was evaluated before the verdict was issued;
- the calibration outcome cutoff is not after the verdict information cutoff;
- confidence does not exceed `confidenceCap`;
- the exact calibration hash is pinned in the Replay Manifest.

No valid calibration means confidence must be omitted rather than guessed.

## Calibration lifecycle

```text
provisional -> provisional / eligible / retired / superseded
eligible    -> eligible / retired / superseded
retired     -> superseded
superseded  -> terminal
```

Additional rules:

- sample size cannot regress;
- period start cannot change inside one chain;
- period end and outcome cutoff cannot regress;
- one logical calibration chain has one active head;
- eligible confidence-cap changes are limited to 0.1 per revision;
- recommended weight multiplier changes are limited to 0.05 per revision;
- weights are recommendations only and require human approval.

## Hard-veto boundary

Calibration never modifies or clears veto records. A highly calibrated support
verdict remains blocked when any required persona returns veto or a binding
veto head exists.

## Runtime path

```text
research/persona_calibrations/*.jsonl
```

Real rows are ignored by Git. Only schemas, validators, README files and
synthetic fixtures are committed.

## Activation gate

`calibrationStoreImplemented` remains `false` until:

1. exact latest HEAD passes full typecheck and tests;
2. GitHub Actions executes real runner steps and passes;
3. at least one local calibration chain is validated;
4. a confidence-bearing replay pins the exact calibration hash;
5. identical inputs reproduce the same replay result hash.

Code and synthetic fixtures alone do not mark the milestone green.

## Validation

```bash
pnpm exec tsc --noEmit
pnpm exec tsc --noEmit -p tsconfig.test.json
pnpm research:validate
pnpm research:test
node --import tsx/esm src/research/cli/validate-stock-pro-council-calibrations.ts
node --import tsx/esm src/research/cli/validate-stock-pro-council-replays.ts
node --import tsx/esm tests/research/stock-pro-council-calibration.test.ts
node --import tsx/esm tests/research/stock-pro-council-replay-calibration.test.ts
```

## Protected boundaries

- no automatic weight application;
- no Recommendation persistence integration;
- no BUY or target-price generation;
- no automatic order placement;
- no active Edge or Production Gate movement;
- no live LINE send;
- no secrets, real prices, Cloudflare, D1 or billing changes.

## Next slice

1. Decision Firewall record between replay and Recommendation candidate;
2. explicit Evidence Package completeness/unknown budget pins;
3. portfolio suitability remains a separate downstream decision;
4. Recommendation integration only after preceding gates pass;
5. real calibration backfill only from issue-time-compatible outcomes.
