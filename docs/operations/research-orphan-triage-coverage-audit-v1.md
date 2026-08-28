# Research Orphan Triage Coverage Audit v1

Status: `DERIVED_OPERATIONAL_AUDIT_NOT_CANONICAL`
Base main: `161de60483132429d6f1b774318d01abe27775e0`
Canonical triage authority: `research/orphan_triage/decisions.jsonl`
Canonical human-review decisions created by this audit: **0**

## Purpose

Demonstrate whether the current Markdown scope of Research Orphan Discovery has been *review-covered* without pretending that AI proposals are canonical human decisions.

This audit answers only:

> Has every current `docs/research/**` Markdown file either been represented by an existing proven Research Asset with a Catalog Relation, or been surfaced in at least one proposal-only triage batch for human review?

It does **not** answer:

- whether every proposal is correct;
- whether any proposal has been human-approved;
- whether any ResearchItem/Component/Study/Case/Edge should be persisted;
- whether duplicate candidates should be merged;
- whether Research Debt is resolved.

## Discovery boundary

Current orphan discovery scans `docs/research` recursively and considers Markdown files only. Generated discovery paths are excluded. Non-Markdown fixture files such as CSV/JSON are outside the current Markdown orphan-candidate set.

At this base main, the inspected `docs/research/**` inventory contains:

- 51 Markdown files directly under `docs/research/`;
- 2 Markdown files under `docs/research/data/`;
- 1 Markdown file under `docs/research/cases/`;
- 2 Markdown files under `docs/research/historical-analogs/`;
- 2 Markdown files under `docs/research/logs/`;
- 0 Markdown files under `docs/research/fixtures/` (current contents are CSV/JSON).

Total Markdown scope: **58 files**.

## Coverage result

| Coverage class | Count | Meaning |
| --- | ---: | --- |
| Proposal-covered exact Markdown paths | 56 | Exact path appears as a candidate in proposal-only Batches 001–015. This is review preparation only. |
| Already represented by proven Research Asset + Catalog Relation | 2 | No orphan proposal is required unless that canonical representation changes. |
| Uncovered Markdown paths | **0** | No current Markdown path remains outside both coverage classes at this snapshot. |
| Canonical human-review decisions authored by AI | **0** | Required safety invariant. |

Therefore the current deterministic Markdown discovery surface is **proposal-covered**, not canonically resolved.

## Proposal coverage by classification

Across Batches 001–015 there are 56 exact-path proposal entries:

| Proposal classification | Count |
| --- | ---: |
| `infrastructure` | 12 |
| `component_candidate` | 16 |
| `research_item_candidate` | 17 |
| `existing_research_link_missing` | 5 |
| `case_candidate` | 2 |
| `study_candidate` | 2 |
| `duplicate_candidate` | 2 |
| `new_edge_candidate` | 0 |
| `not_research` | 0 |
| **Total** | **56** |

The absence of `new_edge_candidate` is intentional. Historical filenames containing `edge` were not treated as Formal Edge authority merely because of naming.

## Batch ledger

| Batch | Proposal entries | Primary boundary |
| --- | ---: | --- |
| 001 | 5 | infrastructure / architecture |
| 002 | 5 | infrastructure / contracts / adapters |
| 003 | 2 | final low-ambiguity infrastructure boundary |
| 004 | 6 | reusable guard/filter components |
| 005 | 4 | cohort/calibration components |
| 006 | 5 | early semantic ResearchItem candidates |
| 007 | 3 | fixture components + exploratory Study |
| 008 | 4 | exact existing-identity link proposals |
| 009 | 2 | historical analog Case candidates |
| 010 | 3 | fixture/guard execution support components |
| 011 | 1 | remediation-specificity duplicate candidate |
| 012 | 6 | additional unresolved ResearchItem candidates |
| 013 | 2 | parent ResearchItem + confirmatory Study design |
| 014 | 3 | remediation-clock question/log/calibration lineage |
| 015 | 5 | audit duplicate boundary + remediation ResearchItems |
| **Total** | **56** | |

## Already represented Markdown paths

These two Markdown paths are not counted among the 56 proposal entries because current canonical infrastructure already represents them as proven Research Assets participating in Research Relations:

1. `docs/research/exchange-sanction-remediation-clock-seed.md`
   - registered document Asset;
   - canonical `documents` Relation to `research_item:exchange-sanction-ladder`.

2. `docs/research/cases/revolution-8894-special-attention-2026-07.md`
   - registered document Asset;
   - canonical Case `revolution-8894-special-attention-2026-07` exists;
   - canonical `documents` Relation connects the note to that Case.

Do not create duplicate orphan proposals for either unless their Asset/Relation representation is later removed or invalidated.

## Subdirectory audit

### `docs/research/data/`

Two Markdown inputs are proposal-covered by Batch 007 as `component_candidate(kind=fixture)`:

- Exchange Sanction Ladder seed chronology/input;
- JPX remediation-stage PIT snapshot.

They are not promoted to Study results or Edge evidence.

### `docs/research/cases/`

The sole current Markdown case note is the already-modeled REVOLUTION episode described above.

### `docs/research/historical-analogs/`

Both current Markdown analogs are proposal-covered by Batch 009 as bounded `case_candidate`s:

- eMnet Japan executive-control override episode;
- Tokyo Koki repeat-remediation episode.

### `docs/research/logs/`

Both current Markdown logs are proposal-covered by Batch 014:

- JPX remediation-clock research log → existing ResearchItem documentation candidate;
- remediation expected-window calibration log → calibration Component candidate.

A research log is not automatically a Study or ResearchItem.

### `docs/research/fixtures/`

Current files are CSV/JSON, not Markdown. They are outside the current `scanDocumentPaths()` `.md` filter and therefore are not silently counted as reviewed Markdown or ignored Markdown debt.

If orphan discovery expands to CSV/JSON later, this audit must be regenerated rather than reused.

## Important non-equivalence: covered != resolved

`proposal-covered` means only that an AI-prepared review classification exists for the exact path and source snapshot.

It does **not** mean:

- human-approved;
- canonical classification written;
- Asset registered;
- semantic Catalog identity persisted;
- Relation created;
- duplicate merged;
- Edge promoted;
- Research Debt removed.

The append-only human ledger remains the only authority for human review memory.

## Staleness contract

This audit is valid only for the exact base main and repository inventory described above.

It becomes stale if any of the following occurs:

- a Markdown file under `docs/research/**` is added, removed, renamed or materially changed;
- Asset Registry representation changes;
- Catalog Relations change in a way that exposes/removes an existing-link gap;
- orphan-discovery roots or file-extension rules change;
- candidate fingerprint semantics change;
- a proposal source blob changes after its batch was prepared.

After any such change, rerun discovery and compare current candidate keys/fingerprints rather than trusting this static audit.

## Recommended next phase

Do **not** continue generating triage batches simply to increase the batch number.

The next safe value is Human Review preparation:

1. present small groups of current candidates to the human reviewer;
2. refresh each candidate's current `candidateFingerprint` immediately before review;
3. write a canonical ledger row only for an explicitly human-approved classification;
4. keep classification acceptance separate from Catalog persistence;
5. only after human review, create Research Assets / ResearchItems / Components / Cases / Studies / Relations as separate governed changes;
6. re-run coverage after each persistence slice because an accepted classification may change what remains orphaned.

Until explicit human approval occurs, proposal coverage should remain a read-only decision-support layer.

## Explicit non-actions

- no canonical ledger append
- no AI-authored `human_review`
- no candidate fingerprint fabrication
- no Research Asset registration
- no ResearchItem / Component / Study / Case / Edge persistence
- no Relation / Lineage creation
- no duplicate merge/delete
- no orphan resolution
- no BUY/SELL / Edge Gate / Learning / notification / backtest / runtime changes
