# Stock Pro Council Persona Calibrations

This directory stores local append-only PersonaCalibrationRecord JSONL files.
Real calibration rows are ignored by Git. Schemas, validators and synthetic
tests remain versioned.

## Purpose

Calibration measures a persona only inside its own jurisdiction. A stock price
rising does not by itself prove that a persona was correct.

Examples:

- Event PM: event classification and entry-route accuracy;
- Forensic: later correction or impairment warning recall;
- Supply Chain: beneficiary ranking and revenue/profit realization;
- Valuation: scenario range coverage;
- Execution: expected versus realized slippage;
- Quant: out-of-sample Net Alpha and false-discovery control;
- Red Team: invalidation/drawdown warning recall;
- Portfolio Risk: concentration incidents;
- Data/PIT: leakage, entity and replay incidents.

## Governance

- records are append-only and content-hashed;
- revisions keep persona/version/jurisdiction/metric/segment/model identity;
- outcome cutoffs and evaluation times cannot move backwards;
- one logical calibration chain has one active head;
- confidence requires an active `eligible` calibration;
- minimum sample policy is enforced by metric class;
- confidence cannot exceed `confidenceCap`;
- a verdict cannot use outcomes after its information cutoff;
- recommended weight changes are capped at 0.05 per revision;
- weight changes require explicit human approval;
- automatic weight application is never authorized;
- hard vetoes are never bypassed by calibration or weight.

## Replay pinning

When confidence is used, the exact calibration record hash must be included in
the CouncilReplayManifest `calibrationHashes` set. A later calibration cannot
be substituted into an older replay.

## Validation

```bash
node --import tsx/esm src/research/cli/validate-stock-pro-council-calibrations.ts
pnpm research:validate
pnpm research:test
```

No local records means the contract exists, but the calibration milestone is
not proven.
