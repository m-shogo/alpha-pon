# Research Orphan Human Review — Batch 007 (proposal-only specialized objects)

Status: `AI_PROPOSAL_ONLY_NOT_CANONICAL`
Base main: `0174c7052113c0480489350f82db3cd042abb00d`
Canonical triage authority: `research/orphan_triage/decisions.jsonl`
Canonical decisions written by this batch: **0**

## Purpose

Separate research inputs from empirical study execution so Alpha Pon does not collapse every dataset or pilot note into a ResearchItem or Edge.

The canonical ResearchComponent contract permits `fixture` as a reusable non-Edge component. The canonical ResearchStudy contract represents a specific empirical design/run, distinct from the parent research identity and from Formal Edge authority.

A proposal is valid only while the listed source blob SHA matches. At actual human review time, use the current `candidateKey + candidateFingerprint` from `pnpm research:orphans --json`.

## Batch 007

| # | Candidate key | Source blob SHA | AI proposal | Suggested subtype | Rationale |
| --- | --- | --- | --- | --- | --- |
| 1 | `unregistered_asset:document:docs/research/data/exchange-sanction-ladder-seed-2026-08-02.md` | `5d8bac49489bff57b2b61876103ec670604f442e` | `component_candidate` | `fixture` | Explicit `RESEARCH_INPUT` / production prohibited. The file preserves a seed event chronology and says it does not assert alpha, direction, causality or tradability. Its durable role is reusable input/fixture for Exchange Sanction Ladder research, not a Study result or Edge. |
| 2 | `unregistered_asset:document:docs/research/data/jpx-remediation-stage-snapshot-2026-08-03.md` | `d149d4d9af19d2457e70236e6ecd6be9b37ccd21` | `component_candidate` | `fixture` | Explicit `PIT_SOURCE_SNAPSHOT` / production prohibited. It preserves a point-in-time cohort/state snapshot shared by several remediation/sanction research lines. The file advances data hygiene and falsification design but explicitly does not establish tradable Net Alpha. |
| 3 | `unregistered_asset:document:docs/research/organizational-breadth-pilot-coding-2026-08-04.md` | `8387280c2a98d495d14e5e140408c65c3387a8d7` | `study_candidate` | `exploratory` | This is a concrete pilot execution for the Organizational Breadth hypothesis: it applies a coding scheme to a bounded sample, compares breadth vs magnitude, records limitations and defines the next validation queue. The empirical run should be distinct from the parent ResearchItem identity. |

## Why the first two are `fixture`, not `study_candidate`

Both data documents are input snapshots/seed chronology. They contain controls, intended tests and falsification notes, but they do not represent one completed empirical design with a frozen sample manifest and result lineage.

Treating every source cohort table as a Study would conflate:

- research input;
- study design;
- study execution;
- study result.

`ResearchComponent(kind=fixture)` preserves the reusable input boundary without claiming empirical completion.

## Why Organizational Breadth pilot is `study_candidate`

The parent question/mechanism is already separately proposed as a `research_item_candidate` in Batch 006. The pilot note is narrower: it is one exploratory execution against a small sample.

That separation enables future lineage such as:

```text
ResearchItem: organizational breadth escalation
  -> Study: pilot PIT coding
  -> later Study: historical validation
  -> later Study: untouched holdout
```

without rewriting the ResearchItem or treating the first 3-case pilot as formal Edge proof.

The proposed mode is `exploratory`, not `confirmatory` or `holdout`, because the source explicitly describes a pilot and records unresolved limitations / next-sample work.

## Duplicate/existing-identity check performed

Before restaging this batch on latest main:

- the three source blob SHAs were rechecked and remain unchanged;
- current `research/knowledge_catalog/research_components/` has no fixture/cohort/calibration object matching these sources;
- the canonical Catalog README states missing type directories mean zero records;
- no canonical Study matching this pilot is present, so this proposal does not intentionally duplicate an existing Study;
- latest main includes the stricter blank-rationale fail-closed guard from #1392; every proposal rationale in this packet is intentionally nonblank and specific.

This is still proposal evidence, not permission to persist new Catalog objects.

## Explicit exclusion: REVOLUTION case

`docs/research/cases/revolution-8894-special-attention-2026-07.md` is **not** an orphan candidate for new Case creation.

Current main already contains all three layers:

1. Research Asset `document-revolution-8894-special-attention-case`;
2. Research Case `revolution-8894-special-attention-2026-07`;
3. `documents` relation connecting the note Asset to that Case.

Creating or proposing another Case would duplicate an already modeled semantic identity. Leave it untouched.

## Human review contract

For fixture proposals, a human reviewer should decide whether the source deserves stable reusable ResearchComponent identity or is merely documentation/data attached to an existing Research identity.

For the Study proposal, a human reviewer should decide whether the pilot is sufficiently bounded to deserve a Study identity and, if so, what its exact parent ResearchItem/Question and lifecycle status should be.

Acceptance of a triage classification still does **not** create any Catalog object or Relation.

## Explicit non-actions

- no canonical ledger append
- no AI-authored `human_review`
- no ResearchComponent persistence
- no Study persistence
- no ResearchItem / Case / Edge creation
- no Relation creation
- no duplicate merge
- no orphan resolution
- no BUY/SELL / Edge Gate / Learning / notification / backtest changes

## Next safe direction

Next, inspect registered Research Assets against canonical Research Relations to find deterministic `existing_research_link_missing` cases. Prefer exact Asset ID + exact target Research identity evidence. Do not use semantic similarity to invent relations or duplicate candidates.
