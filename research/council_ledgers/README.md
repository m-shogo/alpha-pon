# Stock Pro Council Append-Only Ledgers

This directory stores local runtime records for Stock Pro Council v2.

Tracked in Git:

- this README only;
- schemas under `research/schemas/`;
- validators and synthetic tests.

Not tracked in Git:

- `dissent.jsonl`;
- `veto.jsonl`;
- lock directories;
- real evidence references or user-specific portfolio information.

## Files

```text
dissent.jsonl
veto.jsonl
```

Both files are append-only JSONL. Existing rows must not be edited or deleted.
Corrections, acknowledgements, resolutions and veto clearances are new rows that
reference the immediately preceding record.

## Dissent rules

- open disagreement is preserved even when the final label differs;
- resolved dissent remains in history;
- one logical chain is identified by run, persona, jurisdiction and `dissentCode`;
- revisions preserve that identity and use a monotonically later `issuedAt`;
- resolution requires evidence references;
- failed or unpopular dissent is never removed.

## Veto rules

- a binding veto cannot be cleared by majority vote or CIO narrative;
- the clearing record must preserve run, persona, jurisdiction, veto code and scope;
- `new_evidence` keeps the same rule version;
- `versioned_rule_correction` requires a new rule version;
- clearance requires explicit evidence references;
- a binding veto remains binding until a valid append-only revision clears it.

## Writer safety

- owner-token single-writer lock;
- stale locks are not stolen automatically;
- malformed or partial JSONL blocks use;
- all existing and incoming rows are validated before append;
- append is followed by `fsync`;
- lock ownership is checked before removal.

## Validation

```bash
node --import tsx/esm src/research/cli/validate-stock-pro-council-ledgers.ts
pnpm research:validate
pnpm research:test
```

These ledgers do not authorize Recommendation issuance, live LINE delivery,
brokerage orders or automatic trading.
