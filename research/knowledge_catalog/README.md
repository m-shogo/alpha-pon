# Research Knowledge Catalog

`research/knowledge_catalog/` is the canonical Git/YAML persistence root for Research Knowledge records owned by Alpha Pon.

## Authority boundary

This directory owns research identity and semantic metadata only. It does **not** copy or replace Formal Edge definitions, Market Events, Security Master entities, Claim/Evidence graphs, Recommendation Outcomes, Watch runtime configuration, implementation source code, or raw market/evidence data. Those remain authoritative in their existing stores and are referenced through Research Relations / projected authority views.

## Storage layout

Records are sharded as one YAML file per identity. Empty type directories do not need to exist in Git; the repository loader treats a missing type directory as zero records. The catalog root itself must exist.

- `research_items/<id>.yml`
- `research_questions/<id>.yml`
- `observations/<id>.yml`
- `mechanisms/<id>.yml`
- `research_families/<id>.yml`
- `research_components/<id>.yml`
- `cases/<id>.yml`
- `studies/<id>.yml`
- `sample_manifests/<id>.yml`
- `study_results/<id>.yml`
- `opportunities/<id>.yml`
- `relations/<id>.yml`
- `lineages/<id>.yml`

Each file is validated against the existing `research/schemas/research-*.schema.json` contract for its type. The filename must equal `<record.id>.yml`.

## Mutation rules

Mutable research identities may evolve as research progresses, but their identity-bearing fields are protected by the Research OS history guard. Historical facts are stricter:

- observations are immutable after creation;
- sample manifests are immutable after creation;
- study results are immutable after creation;
- relations are immutable after creation; corrections use a new fact / lineage rather than rewriting history;
- lineages are immutable after creation.

Deletion of governed Catalog records is forbidden. Reclassification, merge and supersession should be represented explicitly rather than erasing old identities.

## Intake rule

An important idea may enter as a `ResearchItem` with unknown confidence and zero samples. Do not invent Formal Edge fields merely to preserve an idea. Promotion into a Formal Edge remains a separate governed decision.

## Safety

The repository loader rejects malformed YAML, schema-invalid records, filename/ID drift, duplicate IDs across owned node types, symlinks, unexpected nested paths and oversized metadata files. Invalid records are excluded from the owned snapshot and reported as errors.
