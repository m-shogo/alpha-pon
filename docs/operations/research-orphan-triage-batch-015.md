# Research Orphan Human Review — Batch 015 (audit/remediation semantic boundaries)

Status: `AI_PROPOSAL_ONLY_NOT_CANONICAL`
Base main: `e2ed9853f7fea9462e9a7d2768edec54a14824c0`
Canonical triage authority: `research/orphan_triage/decisions.jsonl`
Canonical decisions written by this batch: **0**

## Purpose

Preserve unresolved audit-opinion and remediation research questions without proliferating Formal Edges, while surfacing one strong duplicate candidate for human review.

This batch intentionally distinguishes:

- a durable semantic ResearchItem candidate;
- a probable duplicate note that must not be auto-merged;
- adjacent remediation questions whose temporal estimands differ enough that they should not be collapsed merely because their vocabulary overlaps.

A proposal remains valid only while its listed source blob SHA matches. At actual human review time, resolve the current `candidateKey + candidateFingerprint` from `pnpm research:orphans --json`.

## Batch 015

| # | Candidate key | Source blob SHA | AI proposal | Rationale |
| --- | --- | --- | --- | --- |
| 1 | `unregistered_asset:document:docs/research/audit-opinion-state-transition-edge.md` | `4a914d3a52b342ae008ffd5cb0ba8070a84aadc3` | `research_item_candidate` | Defines a durable unresolved question around formal audit-opinion state transitions, with explicit state machine, reason taxonomy, PIT timing, matched controls, temporal/issuer holdouts and execution constraints. The source ends `RESEARCH CANDIDATE, not a trading signal`; therefore the conservative identity is ResearchItem rather than Formal Edge. |
| 2 | `unregistered_asset:document:docs/research/audit-opinion-recovery-ladder-edge.md` | `d9accd0ea23c480acc298bbe66310fab65ae0ce1` | `duplicate_candidate` | The older 2026-08-01 note asks substantially the same durable question as the 2026-08-03 State-Transition note: whether adverse/qualified/disclaimer audit states and later restoration create incremental abnormal returns beyond misconduct/distress. The newer note expands the same concept into a more granular state machine, reason taxonomy and holdout design. No explicit `supersedes` declaration was found, so this is only a duplicate candidate; no winner, merge or deletion is authorized. |
| 3 | `unregistered_asset:document:docs/research/remediation-half-life-edge.md` | `ecbeca373e1319dfe1211b863da680e333b3bc63` | `research_item_candidate` | Asks a distinct pre-recurrence question: after formal remediation completion/removal, does residual governance-failure hazard decay over time, and can that risk be measured **before** another failure becomes public? The source emphasizes controller persistence, remediation durability and hazard windows, and labels itself a research candidate/risk-control concept rather than a direct short signal. |
| 4 | `unregistered_asset:document:docs/research/remediation-failure-recurrence-edge.md` | `037d37f96393da2ad164ca00c575bae15b698cc0` | `research_item_candidate` | Asks a different realized-recurrence question: when later control failures contradict prior remediation claims, does the market reprice both the new incident and the credibility of prior assurances? Its recurrence fingerprint and event-reaction design operate after evidence of renewed failure; current assessment is `RESEARCH CANDIDATE, not a production signal`. |
| 5 | `unregistered_asset:document:docs/research/remediation-team-attrition-edge.md` | `c2d1f98aa949297273f85b25e431e8807e31cc7c` | `research_item_candidate` | Frames a distinct unresolved implementation-risk question around departure/instability of remediation owners and control functions. The source explicitly says `RESEARCH CANDIDATE, not a trading signal` and proposes later integration as a remediation-continuity / control-function-stability layer rather than immediate production scoring. Preserve the semantic question first; a future governed resolution may narrow it into a subsignal/component. |

## Audit Opinion: why one ResearchItem plus one duplicate candidate

The two Audit Opinion notes overlap on the core causal variable and event family:

- qualified/disclaimer/adverse opinion states;
- repeated abnormal opinions;
- restoration toward qualified/unqualified assurance;
- exchange escalation and delisting interaction;
- financing/institutional eligibility implications;
- generic distress and concurrent-news controls;
- first-executable PIT timing;
- execution-cost and holdout requirements.

The newer State-Transition note makes the same concept materially more explicit by defining:

- clean → qualified → interim disclaimer → annual disclaimer → repeated disclaimer → restoration;
- reason taxonomy such as scope limitation, management obstruction and cash verification;
- issuer and temporal holdouts;
- within-issuer transition comparisons.

That is strong duplicate evidence, but not authority to erase provenance. There is no explicit source declaration that the newer file supersedes the older file.

Therefore this batch does **not**:

- choose a canonical winner;
- delete or rename either Markdown file;
- merge their contents;
- create one ResearchItem automatically;
- register a Formal Edge.

Human review should decide whether the older file is duplicate/superseded documentation, a predecessor that belongs in lineage, or a genuinely distinct recovery-focused subquestion.

## Remediation Half-Life versus Failure Recurrence

These notes deliberately remain separate proposals because they have different temporal estimands.

### Remediation Half-Life / Governance Relapse

Primary question:

> After remediation appears complete, can residual relapse risk be estimated before the next public failure?

Key concepts:

- durability/decay of remediation;
- controller or incentive persistence;
- policy-only versus system-embedded control;
- hazard windows after completion/removal;
- monitoring/ranking value before a fresh incident.

### Remediation Failure Recurrence

Primary question:

> Once a later failure contradicts earlier remediation, does that contradiction create a credibility-revision event?

Key concepts:

- realized repeat failure;
- same/adjacent control recurrence;
- subsidiary contagion / implementation gap;
- contradiction of prior assurances;
- later enforcement-event repricing.

They may ultimately belong to one ResearchFamily or one parent ResearchItem with components, but marking them duplicate today would erase a real distinction between **predicting recurrence risk** and **measuring repricing after recurrence evidence appears**.

## Remediation Team Attrition boundary

Team Attrition is close to a future `ResearchComponent(kind=subsignal)` because it may become an implementation-risk feature inside broader remediation research.

It is proposed as `research_item_candidate` for now because the current source still asks an independent empirical question:

- whether named remediation-owner exits predict escalation;
- whether attrition clusters add information beyond original scandal severity/distress;
- whether control-function continuity improves risk avoidance out of sample.

A human/governed resolution can later choose `component_candidate` if the evidence shows it is only a reusable feature of Half-Life/Failure Recurrence rather than a durable research line.

## Why none are `new_edge_candidate`

All four semantic research sources retain material unknowns or explicit non-production language:

- insufficient independent samples;
- unresolved PIT/event-timestamp reconstruction;
- generic distress and concurrent-event confounding;
- execution, spreads, gaps and borrow uncertainty;
- untouched holdout requirements;
- incremental value versus existing research remains unproven;
- each source calls itself a Research Candidate rather than validated trading authority.

The suffix `-edge.md` is historical naming, not Formal Edge authority.

## Human review contract

A human reviewer should decide:

1. whether Audit Opinion State-Transition deserves one ResearchItem identity;
2. whether Audit Opinion Recovery Ladder is duplicate, predecessor/lineage, or a distinct subquestion;
3. whether Half-Life and Failure Recurrence remain separate ResearchItems or share a parent/family/component structure;
4. whether Team Attrition deserves an independent ResearchItem or should narrow into a `subsignal` component.

Acceptance of a triage classification still does **not** persist any Catalog object.

## Explicit non-actions

- no canonical ledger append
- no AI-authored `human_review`
- no duplicate merge/delete/rename
- no ResearchItem / ResearchFamily / ResearchComponent persistence
- no Study / Case / Edge creation
- no Asset registration
- no Relation or Lineage creation
- no orphan resolution
- no BUY/SELL / Edge Gate / Learning / notification / backtest / runtime changes

## Next safe direction

After this batch, rebuild the Markdown-orphan inventory against Batches 001–015 and the Asset Registry. Do not assume the remaining root-level `*-edge.md` files are unreviewed; subtract proposal coverage by exact path first, then inspect only genuinely uncovered Markdown.
