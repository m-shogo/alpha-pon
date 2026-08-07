# Handoff — Outcome Learning Final Human Adoption Decision v1

Status: `IMPLEMENTED_SYNTHETIC_VALIDATION_PENDING`
Updated: 2026-08-07 JST

## Purpose

Add a final human decision boundary after a validated final Shadow Evaluation. Even when Shadow supports a change, this layer may authorize only preparation of a governed change artifact. It does not apply the change.

## Entry boundary

An Adoption Decision requires:

- exact final Shadow Evaluation ID/hash;
- an upstream validator witness for that Shadow hash;
- exact Learning Proposal ID/hash and validator witness;
- Shadow/Proposal lineage equality;
- a registered human reviewer;
- `decidedAt` strictly after final Shadow `evaluatedAt`;
- Evidence refs selected only from the final Shadow Evaluation.

New Evidence cannot be injected at adoption time. If new evidence materially changes the conclusion, start a new governed learning cycle rather than rewriting the final Shadow result.

## Decisions

- `defer`: wait for explicit reconsideration conditions; may later be revised.
- `approve_change_preparation`: allowed only when final Shadow `verdict=supports_change`; authorizes creation of a governed change artifact only.
- `reject`: terminal rejection.

`approve_change_preparation` and `reject` are terminal at this layer.

## Approval semantics

`approve_change_preparation` requires:

- `governedChangePreparationAuthorized=true`;
- final Shadow verdict `supports_change`;
- frozen rollback plan acknowledgement;
- explicit human confirmation.

It does not mean the target rule, Edge Gate or code is approved for mutation.

## Safety constants

Every record fixes:

- `shadowEvaluationReviewed=true`
- `rollbackPlanAcknowledged=true`
- `humanDecisionConfirmed=true`
- `automaticApplyAuthorized=false`
- `ruleMutationAuthorized=false`
- `edgeGateMutationAuthorized=false`
- `codeMutationAuthorized=false`
- `automaticTradingAuthorized=false`

## Revision model

- one root Adoption Decision per final Shadow Evaluation;
- linear revisions only;
- no forks;
- only `defer` may be revised;
- Shadow/Proposal identity cannot change;
- decidedAt strictly increases;
- terminal decisions cannot be revised;
- rejected append attempts leave existing JSONL bytes unchanged.

## Next slice after merge

Add a Governed Change Preparation Manifest. It should pin the approved Adoption Decision, the exact target, frozen proposed change, rollback plan, validation commands and human-review requirement. The manifest itself must still have all mutation/production/trading authorization flags false and should be usable only as an explicit PR preparation boundary.
