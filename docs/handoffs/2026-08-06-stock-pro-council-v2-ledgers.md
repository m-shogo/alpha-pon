# Handoff — Stock Pro Council v2 Dissent and Veto Ledgers

Status: `IMPLEMENTED_AWAITING_FULL_VALIDATION`
Updated: 2026-08-06 JST
Parent branch: `feat/stock-pro-council-v2-contract`
Branch: `feat/stock-pro-council-v2-ledgers`

## Purpose

Preserve disagreement and binding veto history without allowing majority vote,
CIO narrative or retroactive editing to erase the original decision state.

## Implemented

- dissent record schema;
- binding veto record schema;
- deterministic SHA-256 hashes;
- append-only dissent and veto revision chains;
- persona/version/jurisdiction validation;
- persona-specific veto code validation;
- owner-token single-writer append with `fsync`;
- malformed/partial JSONL blocking;
- cycle, duplicate ID/hash and multiple-head detection;
- monotonic issue times and information cutoffs;
- explicit status transition validation;
- focused validator CLI;
- Research OS `research:validate` integration;
- normal Research OS test path integration;
- local-only `.gitignore` boundaries and README files.

## Dissent lifecycle

```text
open -> acknowledged -> resolved
  |          |             |
  +----------+-------------+-> superseded
```

Rules:

- revisions preserve run/persona/jurisdiction/dissentCode;
- resolution requires a new row and evidence references;
- `resolvedAt` cannot precede the resolution revision;
- information cutoff cannot regress;
- resolved history remains immutable;
- one logical chain has one head.

## Veto lifecycle

```text
binding -> cleared
   |
   +------> superseded
cleared -> superseded
```

Rules:

- revisions preserve run/persona/jurisdiction/vetoCode/scope;
- only the persona/jurisdiction that issued the veto can revise its chain;
- CIO cannot clear a foreign veto;
- `new_evidence` keeps the same rule version;
- `versioned_rule_correction` requires a new rule version;
- clearance requires explicit evidence references;
- `clearedAt` cannot precede the clearance revision;
- information cutoff cannot regress;
- a binding head remains binding until a valid clearance row exists.

## Runtime paths

```text
research/council_ledgers/dissent.jsonl
research/council_ledgers/veto.jsonl
research/persona_verdicts/*.jsonl
```

Runtime rows are ignored by Git. Only schemas, validators, tests and README
files are committed.

## Activation gate

`dissentLedgerImplemented` remains `false` until the exact latest HEAD passes:

```bash
pnpm exec tsc --noEmit
pnpm exec tsc --noEmit -p tsconfig.test.json
pnpm research:validate
pnpm research:test
node --import tsx/esm src/research/cli/validate-stock-pro-council-ledgers.ts
```

GitHub Actions must execute real runner steps. A startup failure with
`steps: null` is not green and does not satisfy the gate.

## Non-goals

- no Recommendation integration;
- no automatic order placement;
- no active Edge or Production Gate movement;
- no live LINE send;
- no secrets, real prices, Cloudflare, D1 or billing changes;
- no deletion of dissent, veto or failed verdicts.

## Next slice

1. deterministic committee replay package;
2. required-persona matrix by case type;
3. binding-veto firewall before Recommendation;
4. persona calibration records and minimum sample policy;
5. Recommendation integration only after all gates pass.
