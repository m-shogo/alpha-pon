# Handoff — Governed Outcome Learning Proposal v1

Status: `IMPLEMENTED_AWAITING_CI`
Updated: 2026-08-07 JST
Depends on: Semantic Outcome Review v1 (#116), Review-Due Orchestration v1 (#117)

## Purpose

Convert semantic-review lessons into explicit, testable learning proposals **without** mutating research rules, Edge Gates, production code or trading authority automatically.

This closes the final direct-feedback hazard in the first Recommendation -> Outcome -> Review learning loop:

```text
Semantic Review lesson
  -> governed Learning Proposal
  -> manual evaluation / approval process
  -> only later, separately governed implementation
```

The proposal itself is never an implementation authorization.

## Source review boundary

Every proposal pins:

- `semanticReviewId`
- `semanticReviewContentHash`

The referenced Semantic Review must:

- exist in the supplied canonical review map;
- recompute to its own content hash;
- match the pinned hash;
- have its hash explicitly present in `validatedSemanticReviewHashes`, proving the upstream Semantic Review validator accepted it.

A hash-correct but unwitnessed review cannot become a learning source.

## Proposal stages

```text
draft_proposal
human_review_ready
rejected
```

Authority rules:

- `provisional_ai` Semantic Review may create only `draft_proposal`.
- `human_confirmed` Semantic Review may create a conservative draft or `human_review_ready` proposal.
- `rejected` is terminal for that proposal lineage.
- a root proposal may not start as `rejected`.

`human_review_ready` means eligible for manual consideration, **not approved or applied**.

## Hindsight prevention

`proposedChange` must exactly equal one item already frozen in the referenced Semantic Review's `proposedRuleChanges`.

A proposal cannot invent a new convenient rule change after the review was completed.

Proposal `evidenceRefs` must be a subset of the referenced Semantic Review's declared `sourceEvidence` refs.

Secret/token-like evidence or target refs are rejected.

## Proposal content

Every record freezes:

- target kind;
- target ref;
- problem statement;
- exact proposed change;
- rationale;
- expected effect;
- evaluation method;
- success criteria;
- failure criteria;
- minimum evidence requirement;
- falsification conditions;
- rollback plan;
- supporting Evidence refs;
- deterministic SHA-256 content hash.

Target kinds:

```text
research_rule
edge_gate
evidence_requirement
calibration
scoring
backtest_method
operational_guard
```

## Safety flags

Structurally fixed:

```text
humanApprovalRequired = true
automaticApplyAuthorized = false
ruleMutationAuthorized = false
edgeGateMutationAuthorized = false
codeMutationAuthorized = false
automaticTradingAuthorized = false
```

Even a proposal derived from a human-confirmed Semantic Review cannot directly alter repository code, Registry/Gate state, scoring or trading behavior.

## Revision model

Learning proposals are append-only.

- deterministic content hash;
- `supersedesProposalId` for linear refinement;
- no revision fork;
- createdAt strictly increases;
- source Semantic Review / target / proposedChange identity cannot change within a lineage;
- proposal stage cannot regress;
- rejected proposal is terminal;
- duplicate root proposals for the same review/target/change are rejected.

A later, different Semantic Review should create a new proposal lineage rather than rewriting the source review of an old proposal.

## Regression coverage

- validated AI Semantic Review may create draft proposal;
- AI provisional review cannot create human-review-ready proposal;
- hash-correct but not-upstream-validated Semantic Review is rejected;
- hindsight proposedChange injection is rejected;
- Proposal Evidence must come from source Semantic Review;
- secret-like target refs rejected;
- human-confirmed review may create human-review-ready proposal;
- root proposal cannot start rejected;
- human-confirmed proposal can progress draft -> review-ready -> rejected;
- stage regression rejected;
- revision fork rejected;
- rejected proposal terminal;
- rejected append leaves existing JSONL byte-for-byte unchanged.

## Next governance layer

This v1 deliberately stops before approval/application.

If Alpha Pon later needs a change to be implemented, create a separate explicit approval / implementation record that pins this proposal hash and records a human decision. Do not add an `approved=true` shortcut to this record and do not auto-edit code or Edge Gate state from it.

## Safety

- synthetic fixtures only;
- no actual research rule changes;
- no Edge Gate changes;
- no production code mutation from review output;
- no automatic trading/order authority;
- no LINE BUY;
- no Cloudflare/D1 write;
- no Secret, billing or runner changes.
