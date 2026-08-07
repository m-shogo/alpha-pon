# Handoff — Governed Change Preparation Manifest v1

Status: `IMPLEMENTED_SYNTHETIC_VALIDATION_PENDING`
Updated: 2026-08-07 JST

## Purpose

Turn a final human `approve_change_preparation` decision into an inspectable, append-only preparation manifest before any implementation PR changes the adopted target.

The manifest freezes scope and validation expectations. It does not apply any learned change.

## Entry boundary

A Change Preparation Manifest requires:

- exact Final Adoption Decision ID/hash and validator witness;
- `decision=approve_change_preparation`;
- `governedChangePreparationAuthorized=true`;
- exact Learning Proposal ID/hash and validator witness;
- Adoption/Proposal lineage equality;
- `createdAt` strictly after Adoption `decidedAt`.

## Frozen scope

The following must exactly match the adopted Learning Proposal / Final Adoption Decision:

- target kind;
- target ref;
- proposed change;
- rollback plan;
- adoption conditions.

No scope expansion or condition deletion is allowed during preparation.

## Planned artifacts

Each artifact records:

- kind: code / config / schema / test / docs / data_contract;
- repo-relative path;
- purpose.

The validator rejects:

- absolute paths;
- traversal (`..`);
- duplicate paths;
- `.github/*` workflow/control-plane changes;
- `.env*`;
- `wrangler.toml`;
- secret/credential/billing-like paths.

A `ready_for_pr` manifest that includes code/config/schema/data_contract must also include at least one test artifact.

## Lifecycle

```text
draft -> ready_for_pr
```

- root manifests must start `draft`;
- revisions are linear;
- no forks;
- adopted target/change/rollback identity cannot change;
- `ready_for_pr` is terminal.

## Safety constants

Every record fixes:

- `implementationMode=manual_pr_only`
- `humanReviewRequired=true`
- `pullRequestPreparationAuthorized=true`
- `automaticApplyAuthorized=false`
- `workflowMutationAuthorized=false`
- `secretMutationAuthorized=false`
- `billingMutationAuthorized=false`
- `productionMutationAuthorized=false`
- `ruleMutationAuthorized=false`
- `edgeGateMutationAuthorized=false`
- `codeMutationAuthorized=false`
- `automaticTradingAuthorized=false`

The manifest may prepare a PR scope; it is not permission to mutate the target automatically.

## Next slice after merge

Add a Change Implementation Evidence record that describes an actual PR/commit after implementation, pins the exact ready manifest, records changed-path conformance and validation results, and remains non-authorizing until a separate post-implementation human acceptance gate.
