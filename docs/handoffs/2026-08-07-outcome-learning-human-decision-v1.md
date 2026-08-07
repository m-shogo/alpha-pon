# Handoff — Outcome Learning Human Decision v1

Status: `IMPLEMENTED_SYNTHETIC_VALIDATION_PENDING`
Updated: 2026-08-07 JST

## Purpose

Add an explicit human decision boundary after a governed Outcome Learning Proposal. This layer decides only whether a proposal should be deferred, rejected, or advanced into shadow evaluation.

It does **not** apply research-rule changes, Edge Gate changes, code changes, production changes or brokerage actions.

## Input boundary

A Human Decision requires:

- an exact Learning Proposal ID and content hash;
- the proposal to recompute to that hash;
- an upstream validator witness for the proposal hash;
- `proposalStage=human_review_ready`;
- a registered human reviewer;
- a decision timestamp strictly after proposal creation;
- Evidence refs selected only from the frozen proposal Evidence refs.

If newer Evidence is required, create a new governed review/proposal revision first. Do not inject it directly into the Human Decision.

## Decisions

- `defer`: no shadow evaluation authorization; may later be revised once into a terminal decision.
- `advance_to_shadow`: authorizes only shadow evaluation against the proposal's frozen evaluation/falsification/rollback plan.
- `reject`: terminal rejection of this proposal decision chain.

`advance_to_shadow` and `reject` are terminal at this decision layer.

## Safety constants

Every record fixes:

- `proposalReviewed=true`
- `evaluationPlanAcknowledged=true`
- `rollbackPlanAcknowledged=true`
- `humanDecisionConfirmed=true`
- `automaticApplyAuthorized=false`
- `ruleMutationAuthorized=false`
- `edgeGateMutationAuthorized=false`
- `codeMutationAuthorized=false`
- `automaticTradingAuthorized=false`

`shadowEvaluationAuthorized=true` is permitted only for `advance_to_shadow`.

## Revision model

- one root decision per Learning Proposal;
- revisions are linear via `supersedesDecisionId`;
- no forks;
- only `defer` may be revised;
- decision timestamps strictly increase;
- proposal ID/hash cannot change across a decision revision;
- rejected append attempts must not modify existing JSONL bytes.

## Next slice after merge

Add a deterministic Shadow Evaluation record that consumes only a terminal `advance_to_shadow` Human Decision and records preregistered success/failure evidence without automatically mutating the proposal target.
