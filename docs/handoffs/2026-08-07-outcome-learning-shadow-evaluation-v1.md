# Handoff — Outcome Learning Shadow Evaluation v1

Status: `IMPLEMENTED_SYNTHETIC_VALIDATION_PENDING`
Updated: 2026-08-07 JST

## Purpose

Evaluate a governed learning proposal only after an explicit human `advance_to_shadow` decision. Shadow evaluation tests the proposal without changing the real research rule, Edge Gate, code, production runtime or trading authority.

## Entry boundary

A Shadow Evaluation requires:

- a terminal Human Learning Decision with `decision=advance_to_shadow`;
- `shadowEvaluationAuthorized=true`;
- exact Decision ID/hash and validator witness;
- exact Learning Proposal ID/hash and validator witness;
- the Decision and Proposal to share the same frozen proposal lineage.

A defer/reject Decision cannot start shadow evaluation.

## Frozen preregistration

The following come directly from the Learning Proposal and cannot be rewritten during evaluation:

- evaluation method;
- success criteria;
- failure criteria;
- minimum evidence requirements;
- falsification conditions.

Assessment count, order and criterion text must exactly match the frozen Proposal.

## Evidence boundary

Shadow Evidence must:

- be explicitly declared at the evaluation level;
- be used by at least one criterion assessment;
- exist in the Evidence context;
- have an upstream validator witness;
- be observed no later than `evidenceCutoff`;
- contain no secret/token-like reference;
- not reuse the Proposal's own evidence as confirmatory Shadow Evidence.

This prevents circular validation where evidence used to invent the change is also treated as independent confirmation of the change.

## Deterministic verdict

`interim` evaluations are always `inconclusive`.

For a `final` evaluation:

- any failure criterion met -> `rejects_change`;
- any falsification condition met -> `rejects_change`;
- all success criteria met, all failure criteria not met, all minimum-evidence criteria met and all falsification conditions not met -> `supports_change`;
- otherwise -> `inconclusive`.

The stored verdict is recomputed and must match. Re-hashing a manually altered verdict does not make it valid.

## Revision model

- one root Shadow Evaluation per advance Decision;
- linear revisions only;
- no forks;
- Decision/Proposal identity cannot change;
- `evaluatedAt` strictly increases;
- `evidenceCutoff` cannot regress;
- `interim` may advance to `final`;
- `final` is terminal;
- rejected append attempts leave existing JSONL bytes unchanged.

## Safety constants

Every record fixes:

- `humanReviewRequired=true`
- `automaticApplyAuthorized=false`
- `ruleMutationAuthorized=false`
- `edgeGateMutationAuthorized=false`
- `codeMutationAuthorized=false`
- `automaticTradingAuthorized=false`

Even `verdict=supports_change` does not authorize application.

## Next slice after merge

Add a separate Final Human Adoption Decision that consumes only a validated `final` Shadow Evaluation. It may approve preparation of a governed implementation change when the verdict is `supports_change`, but must still not mutate rules/code/Gates automatically.
