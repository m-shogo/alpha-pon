# Research Orphan Human Review — Batch 010 (proposal-only control/fixture Components)

Status: `AI_PROPOSAL_ONLY_NOT_CANONICAL`
Base main: `1a3f045f237f37550477d64f8b238fe94de58824`
Canonical triage authority: `research/orphan_triage/decisions.jsonl`
Canonical decisions written by this batch: **0**

## Purpose

Classify three low-ambiguity reusable research controls/fixtures without creating new ResearchItems or Edges.

The canonical ResearchComponent contract exists specifically to preserve reusable non-Edge building blocks and permits `guard` and `fixture` kinds. These sources explicitly describe themselves as a research fixture/control or synthetic acceptance matrix and are reused across event-study research.

A proposal is valid only while the listed source blob SHA matches. At actual human review time, use the current `candidateKey + candidateFingerprint` from `pnpm research:orphans --json`.

## Batch 010

| # | Candidate key | Source blob SHA | AI proposal | Suggested component kind | Rationale |
| --- | --- | --- | --- | --- | --- |
| 1 | `unregistered_asset:document:docs/research/improvement-status-report-calendar.md` | `14d03611bb3d4ae61f475ffb449667bca7ca683e` | `component_candidate` | `fixture` | Source status is explicitly `RESEARCH_FIXTURE`; it creates a PIT-safe event-calendar queue for Exchange Sanction Ladder follow-up reports and explicitly says it is not a standalone trading signal. Its durable role is reusable scheduling/event-window input. |
| 2 | `unregistered_asset:document:docs/research/overnight-disclosure-pit-test-matrix.md` | `1a4d995da7b2b50d881190ed4bf6414886245700` | `component_candidate` | `fixture` | Source status is explicitly `RESEARCH_CONTROL_FIXTURE`; its 18 cases are intentionally synthetic and exist to test PIT execution logic without contaminating historical holdout. It is a reusable acceptance fixture, not an empirical Study result. |
| 3 | `unregistered_asset:document:docs/research/overnight-disclosure-execution-validator.md` | `9d7369b7922410a1a4dba0b11ab670f79ea82414` | `component_candidate` | `guard` | Source status is explicitly `RESEARCH_CONTROL`; it prevents false alpha from look-ahead execution across misconduct, accounting, governance, capital-structure and demand event studies. The source says this validator is more important than the standalone timing hypothesis and should gate backtest acceptance. |

## Why the event calendar is a `fixture`, not an Edge

The source explicitly says the approximately six-month schedule is a research queue and that the passage of six months alone has no alpha. The fixture holds expected windows and PIT fields used by several hypotheses. A calendar becoming useful for research scheduling does not make it a tradable market mechanism.

## Why the PIT matrix is a `fixture`, not a Study

Its cases are synthetic acceptance tests. They deliberately avoid untouched historical issuers and assert deterministic execution invariants. Treating synthetic test cases as a completed empirical Study would mix software/research-control validation with market evidence.

## Why the execution validator is a `guard`, not infrastructure

This control is research logic applied to specific market observations: disclosure time, market session, trading halt, first executable price, borrow availability and causal cleanliness. It is reusable across Edges and Studies and can invalidate apparent alpha. That is a ResearchComponent-style guard rather than generic platform architecture.

## Relationship to Overnight Disclosure Gap

`docs/research/overnight-disclosure-gap-edge.md` remains a separate unresolved semantic question about whether disclosure timing adds incremental information after event severity and execution are controlled. The validator and synthetic matrix do not prove that hypothesis; they are prerequisites for testing it without look-ahead bias.

This batch therefore does not classify the Overnight Disclosure Gap research identity itself.

## Human review contract

A human reviewer should decide whether each reusable control deserves stable ResearchComponent identity or should remain supporting documentation. Acceptance of `component_candidate` still does not create a component or a relation.

Do not copy this proposal into the canonical ledger while changing only `decisionSource` to `human_review`.

## Explicit non-actions

- no canonical ledger append
- no AI-authored `human_review`
- no ResearchComponent persistence
- no ResearchItem / Study / Case / Edge creation
- no Asset registration
- no Relation creation
- no duplicate merge
- no orphan resolution
- no BUY/SELL / Edge Gate / Learning / notification / backtest changes

## Next safe direction

Review the remaining `*-edge.md` research notes as semantic research questions. Prefer `research_item_candidate` when the source says `RESEARCH CANDIDATE` and evidence/promotion remains unresolved. Separately review obvious predecessor/successor pairs as `duplicate_candidate` proposals without deleting either source.
