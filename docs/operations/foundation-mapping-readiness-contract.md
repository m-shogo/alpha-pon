# Foundation mapping readiness contract v1

Status: `CANONICAL_REQUIREMENT_METADATA_ONLY`

## Purpose

Keep the Foundation readiness audit and remediation planner aligned with the actual `ReviewedEdinetFoundationInput` contract.

This contract contains metadata about required input groups, field paths, remediation order, actions, and dependencies. It does not create or validate real Evidence by itself.

## Compile-time drift guards

The contract accounts for every root key in `ReviewedEdinetFoundationInput` as one of:

- system-fixed fields;
- human review-context fields;
- source-lineage fields;
- remediation-group fields.

It also accounts for every key in:

- `ReviewedEdinetFoundationInput["sections"][number]`;
- `ReviewedEdinetFoundationInput["prior"]`.

If the Foundation input type adds or removes a field without updating this contract, TypeScript compilation fails.

## Remediation groups

The canonical order is:

1. `security_master`
2. `document_metadata`
3. `pit_timestamps`
4. `retrieval_and_normalization`
5. `revision_chain`
6. `rights_and_storage`
7. `section_mapping`

The section contract intentionally refers to final Foundation fields:

```text
sections[].sectionId
sections[].path
sections[].ordinal
sections[].titleHash
sections[].contentHash
```

The existing mapping workflow may carry an immutable candidate `sourceContentHash` before finalization; final `ReviewedEdinetFoundationInput.sections[].contentHash` is produced from that reviewed source lineage. These are different stages of the same governed mapping path, not interchangeable evidence claims.

## Planner integration

`foundation-readiness-remediation-plan.ts` reads order, action, and dependency metadata from this contract instead of maintaining a second independent set of constants.

Unknown future readiness groups remain fail-safe in the planner: they receive the generic action and are placed after known groups until this canonical contract explicitly incorporates them.

## Safety boundary

This contract does not:

- collect EDINET data;
- infer missing field values;
- synthesize hashes or timestamps;
- authorize the Foundation mapping gate;
- authorize Foundation preview or governed-store append;
- replace the legacy entry point;
- register a second real issuer;
- trigger BUY/order/LINE or production writes.

The real Sanrio parity Evidence gate remains deferred and blocked until the local human-reviewed evidence exists.
