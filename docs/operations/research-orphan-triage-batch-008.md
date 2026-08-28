# Research Orphan Human Review — Batch 008 (proposal-only exact existing-link candidates)

Status: `AI_PROPOSAL_ONLY_NOT_CANONICAL`
Base main: `25f0e4155982c3ee044d40c727c1d6956b3156f0`
Canonical triage authority: `research/orphan_triage/decisions.jsonl`
Canonical decisions written by this batch: **0**

## Purpose

Identify research-library Markdown whose semantic identity is already explicit elsewhere in canonical Research authorities, so the correct future action is to attach documentation to existing research rather than create another ResearchItem or Edge.

This batch does **not** use lexical similarity, embeddings, or duplicate inference. Every proposed target is named directly by the source document and exists in current canonical authority.

The Research Relation contract allows `documents` from a Research Asset `document` to `research_item` and external `edge` endpoints. The source Markdown is currently unregistered, so accepting the triage classification would still require a separate, explicit Asset-registration step before any Relation could be persisted.

A proposal is valid only while the listed source blob SHA and target identity remain unchanged. At actual human review time, use the current `candidateKey + candidateFingerprint` from `pnpm research:orphans --json`.

## Batch 008

| # | Candidate key | Source blob SHA | AI proposal | Exact existing target(s) | Rationale |
| --- | --- | --- | --- | --- | --- |
| 1 | `unregistered_asset:document:docs/research/exchange-sanction-ladder-edge.md` | `c290d8b23d8aa1141b11b13ca24d4d32ef449abb` | `existing_research_link_missing` | `research_item:exchange-sanction-ladder` | Current Catalog already contains `exchange-sanction-ladder`, preserving the same question about later JPX enforcement/listing-state milestones after misconduct is already known. Creating another ResearchItem because the Markdown title says “Edge” would duplicate the existing semantic identity. |
| 2 | `unregistered_asset:document:docs/research/ex-rights-overreaction-recovery-edge.md` | `0e3308688f08f8b55a8c3dff45531de17e700e16` | `existing_research_link_missing` | `edge:ex-rights-overreaction-recovery` | Current formal Edge Registry contains the exact same ID/title and hypothesis family. The Markdown is a detailed design/research companion for that existing Edge, not a new Edge candidate. |
| 3 | `unregistered_asset:document:docs/research/known-bad-event-repricing-edge.md` | `6d9a9f5e384e70e4a6ac7b8502b88dfbdbcbc7ab` | `existing_research_link_missing` | `edge:known-bad-event-repricing` | The exact Formal Edge still exists as `deprecated` for provenance. Its registry record says the independent short Edge was absorbed into `misconduct-overreaction-recovery` phase 3. Preserve the document against the existing deprecated identity rather than recreating or re-promoting it. |
| 4 | `unregistered_asset:document:docs/research/misconduct-edge-consolidation-2026-08-27.md` | `07cd416b6a632849522d66ec177f85c9f9b946fd` | `existing_research_link_missing` | `edge:known-bad-event-repricing`, `edge:misconduct-overreaction-recovery` | The note is explicitly a consolidation decision: it names the deprecated source Edge and the surviving target Edge and explains why the former became `phase3_formal_event_repricing` inside the latter. It is documentation of an already-made Edge-governance transition, not a new ResearchItem or Edge. |

## Evidence boundary

### Exchange Sanction Ladder

Current canonical Catalog identity:

```text
research_item:exchange-sanction-ladder
status: investigating
```

Its summary preserves the same shadow-research question and unresolved PIT/execution/validation conditions as the Markdown. The existing registered remediation-clock seed document already has a `documents` Relation to this ResearchItem, proving that this is the established semantic home for that research line.

### Ex-Rights Overreaction Recovery

Current formal Edge identity:

```text
edge:ex-rights-overreaction-recovery
status: research
```

The Registry record and Markdown share the exact title and the same core decomposition: mechanical rights value + benchmark effects + residual drop + no dominant bad news + later reclaim/mean reversion.

### Known-Bad Event Repricing

Current formal Edge identity:

```text
edge:known-bad-event-repricing
status: deprecated
```

`deprecated` does not mean delete or recreate. The Registry explicitly preserves the immutable historical hypothesis and routes new work into the surviving Misconduct Edge.

### Misconduct consolidation note

Current surviving formal Edge:

```text
edge:misconduct-overreaction-recovery
status: research
```

The consolidation document directly states that `known-bad-event-repricing` is absorbed into this Edge as `phase3_formal_event_repricing`. Because both exact Edge IDs are explicit in the source, no similarity inference is required to propose documentation links.

## Why these are not `new_edge_candidate`

- Ex-Rights already is a formal Edge.
- Known-Bad already is a formal Edge and is deliberately deprecated.
- Misconduct consolidation documents a merge into an existing formal Edge.
- Exchange Sanction Ladder already has a canonical ResearchItem and remains unresolved research rather than a second Edge registry entry.

A filename ending in `-edge.md` is not authority to create an Edge.

## Why these are not duplicate candidates

The documents themselves are not semantic duplicate Research entities. They are physical documents that should retain provenance and may be useful supporting notes. The missing piece is representation/linkage, not deletion or merge of the files.

No duplicate merge is proposed.

## Human review contract

A human reviewer should confirm, per candidate, that:

1. the exact existing target identity is correct;
2. the source deserves a stable Research Asset identity rather than remaining an unregistered file;
3. after Asset registration, a `documents` Relation is appropriate;
4. for the consolidation note, whether one or both explicitly named Edge targets should receive the Relation.

A human `existing_research_link_missing` decision is memory only. It does not itself register the Asset or write the Relation.

## Explicit non-actions

- no canonical triage ledger append
- no AI-authored `human_review`
- no Asset registration
- no Research Relation creation
- no ResearchItem / ResearchComponent / Study / Case / Edge creation
- no Edge reactivation or promotion
- no duplicate merge
- no orphan resolution
- no BUY/SELL / Edge Gate / Learning / notification / backtest changes

## Registered-Asset audit result

Separately from these unregistered documents, the current Research Asset Registry contains eight proven active Assets. All eight were checked by exact stable ID and already participate in at least one canonical Research Relation. Therefore this batch does not invent any deterministic `registered_asset_without_relation` repair work.

## Next safe direction

Continue the root `docs/research/**` inventory by separating remaining unregistered `*-edge.md` files into:

- existing research companion documents with exact canonical targets;
- unresolved semantic questions that should be ResearchItem candidates;
- reusable guard/filter/cohort/calibration/fixture components;
- concrete Study executions;
- superseded or duplicate research candidates.

Do not infer `new_edge_candidate` from the filename alone.
