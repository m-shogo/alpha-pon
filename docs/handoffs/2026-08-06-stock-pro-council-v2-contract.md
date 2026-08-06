# Handoff — Stock Pro Council v2 Contract

Status: `IMPLEMENTED_AWAITING_FULL_VALIDATION`
Updated: 2026-08-06 JST
Parent branch: `docs/pre-edge-foundation-stock-pro-council`
Branch: `feat/stock-pro-council-v2-contract`

## Implemented

- `research/schemas/stock-pro-council-v2.schema.json`
- `research/schemas/persona-verdict.schema.json`
- `src/research/stock-pro-council-v2-validation.ts`
- `src/research/cli/validate-stock-pro-council-v2.ts`
- `tests/research/stock-pro-council-v2-validation.test.ts`
- integration into `src/research/cli/validate.ts`
- integration into the normal Research OS schema test path

## Catalog invariants

- version 2 and `catalog_only` are fixed;
- simple majority cannot override a hard veto;
- abstention and dissent remain first-class;
- confidence requires a calibration reference;
- stock verdict and personal suitability remain separate;
- automatic trading authority is always false;
- all eleven core personas must exist;
- persona IDs and labels are unique;
- Data/PIT Auditor has no catalog abstention condition;
- CIO requires all persona verdicts and the dissent ledger;
- existing functional agents remain discovery lenses;
- named-investor agents remain question generators, not authorities;
- catalog-only personas do not count as active Research OS Edges.

## PersonaVerdict invariants

- schema, persona and model versions are explicit;
- `issuedAt >= informationCutoff`;
- persona and jurisdiction must exist in the catalog;
- support, oppose and veto require normalized evidence references;
- veto requires registered persona-specific veto codes;
- non-veto stances cannot carry veto codes;
- abstain requires missing evidence and a next evidence action;
- abstain cannot emit a decision or confidence;
- confidence requires `calibrationRef`;
- facts, assumptions and forecasts cannot contain the same claim;
- facts require evidence references;
- oppose, abstain or veto cannot emit BUY;
- duplicate `(runId, personaId)` verdicts are rejected;
- all verdicts in one run must share an information cutoff.

## Activation gates

Marked true:

- `schemaValidated`
- `verdictValidatorImplemented`

Remain false:

- `dissentLedgerImplemented`
- `deterministicReplayImplemented`
- `calibrationStoreImplemented`
- `recommendationIntegrationImplemented`

Do not mark the remaining gates true from documentation or narrative evidence.

## Focused validation

```bash
node --import tsx/esm src/research/cli/validate-stock-pro-council-v2.ts
node --import tsx/esm tests/research/stock-pro-council-v2-validation.test.ts
```

Full validation still required:

```bash
pnpm exec tsc --noEmit
pnpm exec tsc --noEmit -p tsconfig.test.json
pnpm research:validate
pnpm research:test
```

GitHub Actions must execute real steps and pass on the exact latest HEAD before Ready or merge.

## Protected boundaries

- no Recommendation integration;
- no live LINE send;
- no automatic brokerage order;
- no active Edge or Production Gate movement;
- no secrets, prices, Cloudflare, D1 or billing changes;
- no majority override of hard veto;
- no deletion of dissent or failed verdicts.

## Next slice

1. append-only dissent ledger schema and writer;
2. binding veto lifecycle and clearance evidence;
3. deterministic committee replay fixture;
4. calibration record and minimum-sample policy;
5. integration only after a governed Recommendation candidate gate.
