# Research Orphan Human Review — Batch 001 (proposal-only)

Status: `AI_PROPOSAL_ONLY_NOT_CANONICAL`
Base main: `12b4ba9559a132b59f8e1114d575e43edb3cd527`
Canonical triage authority: `research/orphan_triage/decisions.jsonl`
Canonical decisions written by this batch: **0**

## Purpose

Prepare the first small Human Triage batch without fabricating a `human_review` decision.

This document is an operational review packet only. It is not Research Catalog authority, not a Research Graph node, not an Edge, and not an orphan-resolution action.

The five candidates below were intentionally selected because their source text describes the Research OS / Research Knowledge system itself rather than a market hypothesis, issuer case, study result, or investable mechanism. The proposed classification is therefore `infrastructure`, but a human must still make the canonical decision.

A proposal is valid only while the listed source path and source blob SHA still match. If the source changes, re-read the current source and use the current orphan fingerprint from `pnpm research:orphans --json`; never copy a stale proposal into the append-only ledger.

## Batch 001

| # | Candidate key | Source blob SHA | AI proposal | Why this is a low-ambiguity first review |
| --- | --- | --- | --- | --- |
| 1 | `unregistered_asset:document:docs/research/research-knowledge-architecture-v1.md` | `a11102b84c71c9523409ce9f489466a69592be30` | `infrastructure` | The document defines Alpha Pon's Research Knowledge architecture, authority model, invariants, and system constitution. It explicitly says generated output is not authority and Edge is a research result, not every research file. |
| 2 | `unregistered_asset:document:docs/research/research-knowledge-architecture-v1-stress-test.md` | `df5aa798c8bec5181a7ac770e6394c5c383b0797` | `infrastructure` | The document is a design companion / representability stress test for Research Catalog persistence and identity boundaries, not a market study or Edge candidate. |
| 3 | `unregistered_asset:document:docs/research/research-knowledge-semantic-contract-v1.md` | `97a16b23dedd97695a841d6cf3ee56671629b06d` | `infrastructure` | The document defines deterministic cross-record semantic validation, integrity layers, snapshot boundaries, and external authority rules. |
| 4 | `unregistered_asset:document:docs/research/research-knowledge-authority-adapter-contract-v1.md` | `50ce008aeb0d3bcf0775337cb164822f160d0d6a` | `infrastructure` | The document defines the read-only adapter boundary between Research Knowledge and external authorities and explicitly forbids identity invention or authority mutation. |
| 5 | `unregistered_asset:document:docs/research/research-os-spec.md` | `f981e7b4cac48ffe0c3bb1f5f49557b41741d9cd` | `infrastructure` | The document is the Research OS specification itself and defines Research OS as the container that stores, validates, and audits research rather than performing research. |

## Source evidence summary

### 1. Research Knowledge Architecture v1

The source states that Alpha Pon is a long-lived market research system and then defines a system-level constitution and authority model. It explicitly separates Evidence, Claim Graph, Research Catalog, Edge Registry, Watch config, implementation, and generated read models.

### 2. Architecture representability stress test

The source says it exists to prevent the abstract ontology from being declared complete before known research can be represented. Its examples stress-test identity and authority boundaries such as `Case != Company` and Research-owned IDs versus external authority IDs.

### 3. Semantic Contract v1

The source says JSON Schema alone cannot prove repository-wide Research Knowledge consistency, then defines schema/type, semantic validation, integrity hardening, repository wiring, and future Read Model layers.

### 4. Authority Adapter Contract v1

The source says adapter code converts authoritative external records into deterministic read-only IDs and availability timestamps and must not copy external records into Research Catalog, invent identities, infer missing timestamps, or mutate the owning authority.

### 5. Research OS specification

The source explicitly assigns Research OS the role of storing, validating, and auditing research and prohibits it from inventing Edges. Its layout and invariants are platform / governance infrastructure.

## Human review contract

For each candidate, the human reviewer should choose one of the canonical triage classifications from `research/schemas/research-orphan-triage.schema.json` using the **current** `candidateKey + candidateFingerprint` pair.

If the human agrees with `infrastructure`, the resulting canonical row may acknowledge only the current fingerprint. Any later content change must reopen the candidate as `review_stale`.

If the human disagrees, use the human classification and rationale. Do not alter this proposal document to make it appear that the AI prediction was correct.

## Explicit non-actions in this batch

- no row appended to `research/orphan_triage/decisions.jsonl`
- no `decisionSource: human_review` authored by AI
- no Research Asset registration
- no ResearchItem / Study / Case / Component / Edge creation
- no Research Relation creation
- no duplicate merge
- no orphan resolution
- no BUY/SELL or Edge Gate change
- no Learning adoption

## Next safe step

After an actual human decision exists for these five exact current fingerprints, append only those reviewed decisions in one small ledger change and run:

```bash
pnpm research:orphans --json
pnpm research:check
pnpm check
```

Then confirm that acknowledged `infrastructure` candidates leave the review queue only for the reviewed fingerprint and that the historical decision remains auditable.
