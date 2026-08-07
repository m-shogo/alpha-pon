# Handoff — Outcome Learning Human Decision v1

Status: `IMPLEMENTED_SYNTHETIC_VALIDATION_GREEN`
Updated: 2026-08-07 JST

## Purpose

Add an explicit human decision boundary after a governed Outcome Learning Proposal. This layer decides only whether a proposal should be rejected, deferred, or advanced into shadow evaluation.

It does **not** apply research-rule changes, Edge Gate changes, code changes, production changes or brokerage actions.

## Input boundary

Every Human Decision requires:

- an exact Learning Proposal ID and content hash;
- the proposal to recompute to that hash;
- an upstream validator witness for the proposal hash;
- a registered human reviewer;
- a decision timestamp strictly after proposal creation;
- Evidence refs selected only from the frozen proposal Evidence refs.

For `defer` or `advance_to_shadow`, the Proposal must be `proposalStage=human_review_ready`.

A `draft_proposal` may be acted on only by a human `reject`. This deliberately gives provisional AI proposals an explicit terminal disposal path without allowing them to enter a defer/advance revision chain.

If newer Evidence is required, create a new governed review/proposal first. Do not inject it directly into the Human Decision.

## Decisions

- `defer`: human-review-ready Proposal only; no shadow evaluation authorization; may later be revised into a terminal decision.
- `advance_to_shadow`: human-review-ready Proposal only; authorizes only shadow evaluation against the proposal's frozen evaluation/falsification/rollback plan.
- `reject`: terminal rejection. It may also be used by a human to close a provisional AI `draft_proposal`.

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

## Downstream chain

Merged downstream layers now include:

- governed Shadow Evaluation;
- Final Human Adoption Decision;
- Governed Change Preparation Manifest.

No downstream layer converts an AI draft directly into a rule/code/Gate change.
