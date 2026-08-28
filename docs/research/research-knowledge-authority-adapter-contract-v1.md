# Research Knowledge Authority Adapter Contract v1

Status: `ADAPTER_CONTRACT_V1_WITH_ASSET_AUTHORITY`
Parent architecture: `docs/research/research-knowledge-architecture-v1.md`
Semantic contract: `docs/research/research-knowledge-semantic-contract-v1.md`
Asset authority: `research/asset_registry/README.md`

## 1. Purpose

Research Knowledge relations may point to identities owned outside the Research Catalog. Those identities must remain owned by their existing systems.

The adapter layer has one job:

> Convert authoritative records into a deterministic, read-only set of external IDs and conservative `availableAt` timestamps for `ResearchKnowledgeIntegritySnapshot`.

It must not copy external records into Research Catalog, invent identities, infer missing timestamps, or mutate the owning authority.

## 2. Two different clocks

Every adapter must distinguish these concepts:

- **effective time** — when something became true in the world;
- **available time** — when Alpha Pon could first have known the authoritative identity/fact.

Research Knowledge chronology uses **available time**.

Examples:

- a company can legally exist before Alpha Pon retrieves its Security Master record;
- an event can occur before an official disclosure is observable;
- an Edge idea can conceptually describe old history even though the Edge record was created much later;
- a Markdown document can be old while its stable Research Asset identity is newly registered.

Using effective time or target-file age as `availableAt` can create future leakage.

## 3. `externalReferences` vs `externalAvailability`

`externalReferences` contains the IDs visible from the owning authorities.

`externalAvailability` maps those same IDs, when strict repository mode requires them, to timezone-aware ISO-8601 instants representing the earliest **safe first-known timestamp**.

Example shape:

```text
externalReferences.eventIds = [evt_abc]
externalAvailability.event.evt_abc = 2026-08-28T09:10:00+09:00
```

The integrity validator supports two modes:

- contract/in-memory mode: `requireExternalAvailability = false`;
- repository mode: `requireExternalAvailability = true`.

Repository loaders use strict mode. An external endpoint without a safe `availableAt` must fail closed rather than silently disabling chronology checks.

## 4. Formal Edge adapter

### Identity authority

`research/edge_registry/edges/*.yml`, field `id`.

### Critical timestamp constraint

Current `edge.schema.json` defines `createdAt` as a **date**, not a date-time.

Therefore the adapter must **not** convert:

```text
2026-08-05
```

into an invented instant such as:

```text
2026-08-05T00:00:00+09:00
```

That would falsely claim hour/minute precision that the source record never preserved.

### Safe v1 availability strategy

Use deterministic canonical provenance with true instant precision. Preferred sources, in order:

1. earliest Git commit timestamp that introduced the immutable Edge identity on canonical history;
2. an explicit immutable `observedAt`/`registeredAt` instant added through a separately reviewed Edge schema evolution;
3. another provenance record that demonstrably captures first availability.

Do not use filesystem mtime, generated index timestamp, Dashboard timestamp, current checkout time, or AI inference.

## 5. Market Event adapter

### Identity authority

Market Event Foundation, `MarketEvent.eventId` from `src/market-events/contracts.ts`.

`eventId` is generated from stable occurrence identity and remains separate from schedule revisions.

### Availability

The adapter must choose the earliest repository value that actually represents Alpha Pon knowing the Event identity.

Candidate fields/records include canonical Market Event registration/ledger provenance and `createdAt`, subject to their write semantics.

Do not use:

- scheduled event start time;
- economic event date;
- corrected future revision time;
- generated calendar rendering time.

The adapter must be covered by a test where a relation created before Event `availableAt` is rejected.

## 6. Security Master Entity adapter

### Identity authority

Security Master, `SecurityMasterEntityRecord.entityId`.

### Availability

Use a conservative first-known instant from Security Master record history, such as the earliest safe retrieval/observation timestamp supported by repository semantics.

Do not use `validFrom` as Research Knowledge availability. `validFrom` describes entity validity, not when Alpha Pon knew the identity.

When multiple revisions exist, availability is based on the earliest authoritative record that establishes the same stable `entityId`, not the newest revision.

## 7. Document adapter — resolved through Research Asset Registry

Markdown content remains authoritative at its original file location. Cross-file semantic identity is owned by a Research Asset record under:

`research/asset_registry/assets/*.yml`

with:

```text
assetType: document
```

The stable Asset `id` is the Research Relation endpoint. The physical `path` is mutable repository location metadata and is **not** the permanent semantic identity.

Before a canonical `documents` relation may use a Document Asset:

1. the Asset record must validate;
2. its target path must resolve to a regular repository file without symlink/path-boundary escape;
3. the Asset must have exact canonical-main first-known provenance;
4. the relation timestamp must not predate that availability.

Generated output paths and report titles must never become canonical Document IDs accidentally.

## 8. Watch adapter — resolved through Research Asset Registry

Watch runtime/configuration remains authoritative in its existing config/runtime system. Research-semantic identity is owned by a Research Asset record with:

```text
assetType: watch
```

The stable Asset ID is independent of the current config path. This permits:

- file moves without changing Research identity;
- one Watch to operationalize multiple research concepts;
- multiple distinct Watch identities to coexist even when implementation code is shared;
- research concepts to change without rewriting runtime configuration.

A Watch Asset is an observation/operationalization reference. It does **not** imply one config file equals one Edge and it does not turn monitoring output into a trading signal.

Canonical `operationalizes` relations require exact Asset provenance and strict availability just like Document relations.

## 9. Implementation adapter — resolved through Research Asset Registry

Source code remains implementation truth. Research-semantic implementation identity is owned by a Research Asset record with:

```text
assetType: implementation
```

The stable ID survives source-file reorganization; the Asset `path` records the current implementation location.

Canonical `implements` relations require:

- a valid Implementation Asset;
- a regular repository target file;
- exact canonical-main first-known provenance;
- relation creation at or after safe availability.

Implementation identity must not force Research identity to change when code is reorganized. An implementation can point to a Watch rather than redundantly claiming direct causal proof for a ResearchItem or Edge.

## 10. Research Asset provenance

Document, Watch and Implementation Assets use:

`research/asset_registry/provenance.jsonl`

The canonical first-known record is append-only and binds:

- `assetId`;
- `firstKnownAt`;
- `basis: canonical_git_first_presence`;
- exact `sourceCommitSha`;
- exact `sourceCommitAt`;
- `sourcePath` of the stable Asset identity YAML itself.

`sourcePath` is intentionally **not** the target Markdown/config/source path. Otherwise an old physical file could make a newly-created stable Asset identity appear to have existed historically.

A registered Asset may exist without provenance as **Pending**, but strict Research relation use must fail closed until canonical provenance exists.

## 11. Adapter determinism

For the same repository state and the same as-of boundary, an adapter must return the same:

- external IDs;
- availability timestamps;
- ordering.

No network discovery, LLM classification, random IDs, current wall clock, generated Dashboard data, or mutable cache may affect the adapter output used by integrity validation.

## 12. Fail-closed rules

Repository mode must fail when:

- a relation endpoint ID does not exist in the owning authority;
- strict mode requires `availableAt` and no safe timestamp exists;
- availability metadata exists for an undeclared ID;
- `availableAt` lacks an explicit timezone;
- a Research Relation/Lineage claims creation before an endpoint was available;
- an Asset target escapes repository boundaries, is missing, duplicates another active semantic target, or is not a regular file;
- Asset provenance disagrees with canonical Git first presence.

The fix is to repair provenance or remove/defer the relation. The fix is **not** to synthesize a convenient timestamp.

## 13. Read-only rule

Adapters are read-only projections.

They may not:

- create an Edge because Research Catalog references it;
- create a Market Event because a Case mentions it;
- create a Security Master entity because prose names a company;
- rewrite Watch config;
- move documents;
- infer Research Asset identities from filenames automatically;
- write generated IDs back into source systems automatically.

Any write into another authority requires that authority's own explicit workflow.

## 14. Persistence gate implications

The stable sequence for external references is:

1. define or reuse the owning authority's stable identity;
2. construct a read-only authority projection;
3. establish a conservative `availableAt` with exact provenance;
4. validate repository mode with `requireExternalAvailability: true`;
5. only then persist Research relations using that endpoint.

For Document/Watch/Implementation this sequence is now implemented through Research Asset Registry. New Assets must repeat the same identity → canonical provenance → relation order; do not batch all three concepts into one speculative migration.

If any adapter or Asset provenance is unresolved, omit/defer that relation. Do not weaken strict validation to make a seed pass.

## 15. Milestone wording

`RESEARCH_KNOWLEDGE_AUTHORITY_ADAPTER_CONTRACT_V1` means the authority boundary is specified.

Current repository state additionally includes implemented read-only adapters and stable Research Asset Authority for Document/Watch/Implementation. That still does **not** mean:

- every repository document/watch/implementation has been registered;
- orphan detection is complete;
- Dashboard reads Research Knowledge;
- any research conclusion or Edge is validated;
- a Watch or implementation proves alpha.
