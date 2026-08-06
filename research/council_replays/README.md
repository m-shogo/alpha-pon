# Stock Pro Council Deterministic Replay

This directory is reserved for local `CouncilReplayManifest` JSON files. Real
manifests are ignored by Git because they pin local evidence, price snapshots,
PersonaVerdicts, dissent and veto records.

Tracked in Git:

- this README;
- replay schemas;
- required-persona matrix;
- replay/firewall validators;
- synthetic fixtures.

Not tracked in Git:

- real replay manifests;
- PersonaVerdict JSONL rows;
- dissent/veto JSONL rows;
- raw evidence or licensed price data.

## Manifest pins

Every replay manifest fixes:

- `councilRunId` and `informationCutoff`;
- case type and required persona matrix;
- Evidence Package hash;
- PIT Price Snapshot hash;
- code, rule and persona catalog versions;
- exact PersonaVerdict hashes;
- exact dissent hashes;
- exact veto hashes;
- `automaticTradingAuthorized: false`.

A timestamp alone is not deterministic replay. Every input hash must resolve to
an immutable local record and all records must have existed before the manifest
was created.

## Firewall

Recommendation-candidate eligibility is blocked by:

- a missing required persona;
- a required persona abstaining;
- a required persona still returning veto;
- any active binding veto head.

Support votes are not counted. A majority cannot override one binding veto.
Dissent heads remain visible in the replay result even when they do not create
a hard block.

## Validation

```bash
node --import tsx/esm src/research/cli/validate-stock-pro-council-replays.ts
pnpm research:validate
pnpm research:test
```

No local manifest means the contracts may be present, but the deterministic
replay milestone remains unproven.

Replay eligibility is not a BUY recommendation and never authorizes an order.
