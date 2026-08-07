# Handoff — Outcome Learning Status Read Model v1

Status: `IMPLEMENTED_SYNTHETIC_VALIDATION_PENDING`
Updated: 2026-08-07 JST

## Purpose

Derive the current state and next action of every governed learning proposal from immutable records. The read model writes no state and grants no authority.

## Inputs

Only records with matching deterministic content hashes and explicit upstream validator witnesses are accepted:

- Learning Proposal revisions;
- Human Learning Decision revisions;
- Shadow Evaluation revisions;
- Final Adoption Decision revisions;
- Change Preparation Manifest revisions.

Forked, cyclic, missing-parent, duplicate-root or unwitnessed histories are rejected before status output.

## Derived next actions

- `review_provisional_ai_proposal` — human must reject the AI draft or create a separately governed human-confirmed review/proposal.
- `make_learning_decision`
- `revisit_learning_decision`
- `run_shadow_evaluation`
- `continue_shadow_evaluation`
- `make_adoption_decision`
- `revisit_adoption_decision`
- `create_change_preparation_draft`
- `finalize_change_preparation`
- `prepare_pull_request_for_human_review`
- `none`

Human-required actions are surfaced before machine/research-executor actions in deterministic output ordering.

## Revision awareness

The read model follows each Proposal revision chain to its latest record. Human Decisions attached to superseded Proposal revisions are not treated as current authority; their IDs are surfaced as `staleDownstreamRecordIds`.

This prevents an old approval/rejection from silently controlling a newer Proposal revision.

## Terminal states

Terminal reasons are explicit:

- `proposal_rejected`
- `learning_rejected`
- `adoption_rejected`

A `ready_for_pr` preparation is not terminal learning adoption; its next action is preparation of a governed PR for human review. It still carries no automatic mutation/trading authority.

## Summary

The pure summary reports:

- total governed learning chains;
- count requiring human action;
- terminal count;
- count per next action.

No mutable queue or dashboard state is introduced.

## Safety

The read model does not:

- create or modify Proposal/Decision/Shadow/Adoption/Preparation records;
- mutate research rules, Edge Gates or code;
- modify workflows/runners/Secrets/billing/Cloudflare/D1;
- authorize Production, LINE BUY or brokerage actions.

## Next slice after merge

Use this read model as the single input for a local/ops learning queue or dashboard surface. Do not invent a second mutable lifecycle state.
