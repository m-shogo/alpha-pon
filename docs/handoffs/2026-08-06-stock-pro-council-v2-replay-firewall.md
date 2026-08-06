# Handoff — Stock Pro Council v2 Deterministic Replay Firewall

Status: `IMPLEMENTED_AWAITING_FULL_VALIDATION`
Updated: 2026-08-06 JST
Parent branch: `feat/stock-pro-council-v2-ledgers`
Branch: `feat/stock-pro-council-v2-replay-firewall`

## Purpose

Reproduce a council decision from immutable issue-time inputs and prevent a
majority narrative from bypassing missing specialists, abstentions or binding
hard vetoes.

## Implemented

- `CouncilReplayManifest` schema;
- replay firewall result schema;
- deterministic input/result hashes;
- Evidence Package and PIT Price Snapshot hash pins;
- code/rule/persona catalog version pins;
- exact verdict/dissent/veto hash sets;
- case-specific required persona matrix;
- manifest creation-time and information-cutoff checks;
- bidirectional PersonaVerdict / veto-ledger consistency;
- active dissent and binding-veto head reconstruction;
- local replay repository scanner;
- focused validator CLI;
- Research OS validation/test integration;
- local-only replay directory and README.

## Required persona matrix

### Event-driven

- Japan Event-Driven PM
- Market Execution
- Quant/Causal
- Short Red Team
- Data/PIT Auditor
- CIO

### Misconduct/accounting

- Japan Event-Driven PM
- Forensic/Governance
- Market Execution
- Quant/Causal
- Short Red Team
- Data/PIT Auditor
- CIO

### Technology

- Industry/Supply Chain
- Valuation/Expectations
- Short Red Team
- Data/PIT Auditor
- CIO

### Short research

- Forensic/Governance
- Market Execution/Borrow
- Quant/Causal
- Short Red Team
- Portfolio Risk
- Data/PIT Auditor
- CIO

### Position sizing

- Portfolio Risk
- Data/PIT Auditor
- Personal Suitability
- CIO

### General

- Valuation/Expectations
- Short Red Team
- Portfolio Risk
- Data/PIT Auditor
- CIO

## Firewall blockers

```text
missing_required_persona:<personaId>
required_persona_abstained:<personaId>
required_persona_veto:<personaId>
binding_veto:<vetoId>
```

Support votes are deliberately not counted. One valid binding veto blocks the
Recommendation candidate regardless of the number of supporting personas.

## Structural failures

Replay construction fails rather than returning a soft blocker when:

- manifest content hash is invalid;
- pinned verdict/dissent/veto hashes do not resolve exactly;
- run ID or information cutoff differs;
- a record was issued after the manifest was created;
- case type and required persona matrix differ;
- a non-support verdict has no dissent head;
- a veto verdict has no matching veto ledger record;
- a binding veto has no matching veto PersonaVerdict;
- ledger or PersonaVerdict validation fails.

## Activation gate

`deterministicReplayImplemented` remains `false` until:

1. exact latest HEAD passes full typecheck and tests;
2. GitHub Actions executes real runner steps and passes;
3. at least one local replay manifest resolves all pinned records;
4. the replay output is reproduced with an identical result hash.

Code and synthetic fixtures alone do not mark the milestone green.

## Validation

```bash
pnpm exec tsc --noEmit
pnpm exec tsc --noEmit -p tsconfig.test.json
pnpm research:validate
pnpm research:test
node --import tsx/esm src/research/cli/validate-stock-pro-council-replays.ts
node --import tsx/esm tests/research/stock-pro-council-replay.test.ts
```

## Protected boundaries

- no Recommendation persistence integration;
- no BUY label or target-price generation;
- no automatic order placement;
- no active Edge or Production Gate movement;
- no live LINE send;
- no secrets, real prices, Cloudflare, D1 or billing changes.

## Next slice

1. persona calibration record and minimum-sample policy;
2. calibration-aware confidence gate;
3. Decision Firewall record between replay and Recommendation candidate;
4. portfolio suitability remains a separate downstream decision;
5. Recommendation integration only after all preceding gates are validated.
