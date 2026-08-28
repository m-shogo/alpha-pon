# Research Knowledge Semantic Contract v1

Status: `SEMANTIC_CONTRACT_V1`
Parent design: `docs/research/research-knowledge-architecture-v1.md`
Schema/Type contract: `research/schemas/research-*.schema.json`, `src/research/research-knowledge-types.ts`
Semantic validator: `src/research/research-knowledge-semantics.ts`
Integrity entry point: `src/research/research-knowledge-integrity.ts`

## 1. Purpose

JSON Schema proves that one record has an allowed local shape. It cannot prove that the repository-wide research knowledge graph makes sense.

This contract defines the deterministic cross-record invariants required for canonical Research Catalog persistence.

The validator does **not** decide whether an investment thesis is true, profitable, original, or worthy of Production. It prevents structural and temporal contradictions that would make later research unreliable.

## 2. Validation layers

The layers are intentionally separate.

1. **Schema / Type** — field shape, enum, local format, ontology version.
2. **Semantic validation** — endpoint matrix, cross-record existence, cardinality, cycles, lifecycle compatibility, PIT cutoffs.
3. **Integrity hardening** — chronology against node availability, completed-study result preservation, duplicate exclusion/reference guards.
4. **Repository wiring** — read-only loaders that assemble a snapshot from canonical authorities.
5. **Read Model** — future generated projection for Dashboard/Agent/Search. Never a source of truth.

Do not push layer 2/3 rules back into misleading JSON Schema conditionals merely to reduce file count.

## 3. Snapshot boundary

`ResearchKnowledgeSnapshot` is an in-memory validation boundary, not a new database.

It contains Research-owned records plus ID sets supplied by other authorities.

### Current authoritative ID sources

| Node | Authority | ID |
| --- | --- | --- |
| Formal Edge | `research/edge_registry/edges/` | Edge `id` |
| Market Event | Market Event Foundation (`src/market-events/contracts.ts`) | stable `MarketEvent.eventId` |
| Entity/Security | Security Master | stable `entityId` |
| Document | Research Asset Registry (`research/asset_registry/assets/*.yml`, `assetType: document`) | stable Research Asset `id` |
| Watch | Research Asset Registry (`research/asset_registry/assets/*.yml`, `assetType: watch`) | stable Research Asset `id` |
| Implementation | Research Asset Registry (`research/asset_registry/assets/*.yml`, `assetType: implementation`) | stable Research Asset `id` |
| ResearchItem / Question / Observation / Mechanism / Family / Component / Case / Study / StudyResult / Opportunity | Research Catalog (`research/knowledge_catalog/`) | Research Knowledge ID |

### Resolved Asset adapter identities

Document, Watch and Implementation semantic identities are now supplied by the Research Asset Registry. Their stable ID is independent of the physical repository path; the Asset record owns the current path while the original Markdown/config/source file remains the content or runtime truth.

Canonical `documents`, `operationalizes`, or `implements` relations may only use a Research Asset ID when:

- the Asset record exists and validates;
- the referenced physical target exists within the repository boundary;
- the Asset has exact canonical-main first-known provenance in `research/asset_registry/provenance.jsonl`;
- strict authority availability accepts the relation timestamp.

A registered Asset without exact provenance may exist as **Pending**, but strict repository relation use must fail closed until provenance is repaired. Never substitute target-file age, filesystem mtime, a generated output timestamp, display title, or AI-produced slug for stable Asset identity or first-known time.

## 4. Fail-closed external references

If a Research Relation points to an Edge/Event/Entity/Document/Watch/Implementation ID, the supplied authority snapshot must contain that ID.

Missing authority IDs are errors, not warnings and not auto-created placeholders.

This prevents:

- typos becoming durable graph nodes;
- renamed files creating ghost identities;
- generated output becoming accidental truth;
- AI suggestions materializing unknown entities silently.

## 5. Relation endpoint ontology

The v1 machine-semantic matrix is narrow on purpose.

| Relation | Source | Target |
| --- | --- | --- |
| `observes_event` | Observation | Event |
| `includes_event` | Case | Event |
| `involves_entity` | Case | Entity |
| `addresses` | ResearchQuestion | ResearchItem |
| `member_of` | ResearchItem / Edge | ResearchFamily |
| `part_of` | ResearchComponent | ResearchItem / Edge |
| `considers_mechanism` | ResearchItem / ResearchQuestion / Edge | Mechanism |
| `studies` | Study | ResearchItem / Question / Mechanism / Component / Edge |
| `used_in` | Case | ResearchItem / Question / Component / Edge |
| `documents` | Document | research semantic nodes / Edge |
| `operationalizes` | Watch | ResearchItem / Component / Edge |
| `implements` | Implementation | Watch / ResearchItem / Component / Edge |
| `applies_edge` | Opportunity | Edge |
| `triggered_by` | Opportunity | Event |
| `depends_on` | research dependency node | research dependency node |

No generic `related_to`, no stored inverse `parent_of`/`child_of`, and no automatic semantic relation creation from filename similarity.

## 6. Relation invariants

The integrity suite enforces:

- source endpoint exists;
- target endpoint exists;
- source/target types are allowed by relation type;
- meaningless self-reference is rejected;
- duplicate semantic relations are rejected even when record IDs differ;
- `informationCutoff <= createdAt`;
- relation creation cannot predate a Research-owned source/target becoming available;
- strict external authority endpoints cannot be used before their safe first-known availability;
- `order` is reserved for `includes_event`;
- `member_of` requires `primary` or `secondary` role;
- `used_in` requires an explicit Case-use role;
- at most one primary ResearchFamily per ResearchItem/Edge;
- every ResearchComponent has exactly one `part_of` parent;
- every ResearchQuestion addresses at least one ResearchItem;
- every Study has at least one explicit study target;
- every Opportunity applies at least one formal Edge;
- `depends_on` graph is acyclic.

## 7. Event Chain invariants

A Case may contain multiple canonical Market Events.

For every Case using `includes_event`:

- every relation declares `order`;
- order values are unique;
- order is contiguous from `0`;
- Event truth/timestamps remain owned by Market Event Foundation.

The Research graph stores the Case narrative ordering, not a copied Event body.

v1 intentionally does not yet prove that every `order=N` is chronologically consistent with the current Event revision timestamp. That requires PIT-aware Event revision access beyond the current stable identity/availability checks.

## 8. Case and Entity boundary

`Case != Company` remains mandatory.

A Case is a bounded episode. Security/entity identity is linked with `involves_entity` and remains owned by Security Master.

This allows:

- one issuer to have many Cases;
- one Case to involve many entities;
- ticker/name/listing changes without changing Case identity;
- historical cases to survive Security Master revisions.

## 9. ResearchFamily and Component cardinality

ResearchFamily is a causal-mechanism family, not a theme label.

A ResearchItem or Edge may have many secondary families/contextual links, but no more than one `primary` family in v1.

Every ResearchComponent has exactly one structural `part_of` parent. A cross-cutting tool or infrastructure item that genuinely has many owners should not be disguised as a Component; classify it separately.

## 10. Lineage invariants

Lineage preserves research history. It is not a status field.

The validator enforces:

- lineage endpoints exist;
- no self-lineage;
- semantic duplicate lineage is rejected;
- `merged_into`, `split_into`, `supersedes` keep the same semantic node type;
- `reclassified_as` changes semantic node type;
- one source cannot have multiple different `merged_into` destinations;
- the combined lineage graph is acyclic;
- lineage decisions cannot predate Research-owned source/target availability.

Valid examples include:

- one broad ResearchItem `split_into` two independently testable ResearchItems;
- a revised formulation `supersedes` an old ResearchItem without deleting it;
- an intake ResearchItem `reclassified_as` a reusable Mechanism;
- `known-bad-event-repricing merged_into misconduct-overreaction-recovery` while the old Edge remains historical/deprecated.

## 11. ResearchItem lifecycle invariants

- `resolved` requires a concrete `resolution`;
- active states (`captured`, `triage`, `investigating`, `synthesized`) cannot carry a final `resolution` or `stopReason`;
- `lastReviewedAt` cannot predate `createdAt`.

The contract intentionally does **not** require confidence, sample count, entry/exit or Gate fields for an early ResearchItem.

## 12. Study preregistration and PIT invariants

For Study:

- `registered`, `running`, `completed` require `registeredAt`;
- `registeredAt >= createdAt`;
- when both exist, `informationCutoff <= registeredAt`.

This blocks a Study from pretending that post-registration information was known at registration.

Exploratory work remains allowed; the contract does not falsely relabel exploratory research as preregistered confirmatory work.

## 13. Sample Manifest invariants

A Study Sample Manifest is an auditable selection record.

The validator enforces:

- referenced Study exists;
- manifest `role == Study.mode`;
- manifest is not created before the Study;
- `selectionCutoff <= manifest.createdAt`;
- included Cases exist;
- excluded Cases exist;
- a Case cannot be both included and excluded;
- the same excluded Case cannot appear multiple times with competing reasons.

One Case gets one canonical exclusion row per manifest. Additional reasoning belongs in the reason text or supporting research record, not duplicate rows.

## 14. StudyResult and anti-survivorship invariants

`StudyResult` is final preserved study knowledge, not an interim notebook observation.

The integrity layer enforces:

- referenced Study exists;
- referenced Sample Manifest exists;
- manifest belongs to the same Study;
- result cannot predate Study or Manifest;
- result cannot predate Study registration when registration exists;
- final StudyResult requires Study status `completed` or `archived`;
- every `completed` Study must preserve at least one StudyResult.

The final rule is deliberate: null, negative, confounded and non-executable findings must remain visible. A completed study cannot disappear merely because it failed to find an Edge.

Interim observations while a Study is running belong in Research Log / Observation / evidence notes, not in a final StudyResult record.

## 15. Opportunity PIT boundary

Opportunity means a live applicability candidate for a formal Edge. It is not a Recommendation.

- at least one `applies_edge` relation is required;
- `informationCutoff <= detectedAt`;
- BUY/SELL state is not encoded in Opportunity status.

Recommendation and Outcome remain owned by their existing decision/outcome contracts and are projected into future Read Models rather than duplicated into Research Relations.

## 16. What this validator intentionally does not prove

A zero-error snapshot does **not** prove:

- an Edge is profitable;
- a Mechanism is causally true;
- a Family classification is economically useful;
- a Case is sufficient evidence;
- a Study has enough statistical power;
- an Event caused a price move;
- an Opportunity should be bought or sold;
- an embedding similarity is a duplicate;
- an orphan candidate should be promoted;
- a deprecated Edge has the correct runtime status transition.

Those claims require Evidence/Claim/Study/Outcome/Gate logic in their own authorities.

## 17. Persistence gate and current continuation

Canonical Research Catalog rows must **not** be mass-created merely because the persistence path is now operational.

The safe order remains:

1. Schema/Type contracts;
2. semantic/integrity validator with green CI;
3. deterministic authority adapters for Edge/Event/Entity and stable Asset refs for Document/Watch/Implementation;
4. read-only repository loader that builds `ResearchKnowledgeSnapshot`;
5. empty/minimal repository validation;
6. a very small set of known research identities;
7. concrete Kioxia / Misconduct / Ex-rights / REVOLUTION representations and narrowly supported Asset relations;
8. **next: warning-only orphan discovery**;
9. only after orphan discovery is safe, generate a Research Read Model and connect Dashboard/Agent.

Steps 1–7 are infrastructure/persistence milestones, not proof of alpha. No bulk migration, auto-merge, auto-Edge promotion or AI-created canonical node is permitted in the persistence gate.

## 18. Database portability

The semantic validator accepts an in-memory snapshot rather than reading YAML paths itself.

That is intentional. Today repository loaders can read Git/YAML; later a DB adapter can construct the same snapshot. Semantic meaning and tests do not depend on storage technology.

Moving to D1/Postgres/graph storage must not require redefining Research identity, lineage or anti-bias rules.

## 19. Current milestone meaning

`RESEARCH_KNOWLEDGE_SEMANTICS_V1_GREEN` may only mean:

- contract code exists;
- semantic/integrity tests pass;
- existing Research OS and repository CI remain green.

It must **not** mean that orphan migration, Dashboard integration, automated research conclusions, or any Edge research result is complete. Canonical Catalog persistence and the first narrow Asset relations now exist, but those are storage/integrity milestones only.
