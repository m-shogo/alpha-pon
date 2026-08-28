# Research Knowledge Authority Adapter Contract v1

Status: `ADAPTER_CONTRACT_ONLY`
Parent architecture: `docs/research/research-knowledge-architecture-v1.md`
Semantic contract: `docs/research/research-knowledge-semantic-contract-v1.md`

## 1. Purpose

Research Knowledge relations may point to identities owned outside the future Research Catalog. Those identities must remain owned by their existing systems.

The adapter layer has one job:

> Convert existing authoritative records into a deterministic, read-only set of external IDs and conservative `availableAt` timestamps for `ResearchKnowledgeIntegritySnapshot`.

It must not copy external records into Research Catalog, invent identities, infer missing timestamps, or mutate the owning authority.

## 2. Two different clocks

Every adapter must distinguish these concepts:

- **effective time** — when something became true in the world;
- **available time** — when Alpha Pon could first have known the authoritative identity/fact.

Research Knowledge chronology uses **available time**.

Examples:

- a company can legally exist before Alpha Pon retrieves its Security Master record;
- an event can occur before an official disclosure is observable;
- an Edge idea can conceptually describe old history even though the Edge record was created much later.

Using effective time as `availableAt` can create future leakage.

## 3. `externalReferences` vs `externalAvailability`

`externalReferences` contains the IDs visible from the owning authorities.

`externalAvailability` optionally maps those same IDs to strict timezone-aware ISO-8601 instants representing the earliest **safe first-known timestamp**.

Example shape:

```text
externalReferences.eventIds = [evt_abc]
externalAvailability.event.evt_abc = 2026-08-28T09:10:00+09:00
```

The integrity validator supports two modes:

- contract/in-memory mode: `requireExternalAvailability = false`;
- repository mode: `requireExternalAvailability = true`.

Once a real repository loader is introduced, it must use repository mode. An external endpoint without a safe `availableAt` must fail closed rather than silently disabling chronology checks.

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

Before strict repository mode can expose Edge endpoints, choose a deterministic authoritative timestamp with true instant precision. Preferred candidates, in order:

1. earliest Git commit timestamp that introduced the immutable Edge identity on the canonical history;
2. an explicit future immutable `observedAt`/`registeredAt` instant added through a separately reviewed Edge schema evolution;
3. another provenance record that demonstrably captures first availability.

Do not use filesystem mtime, generated index timestamp, Dashboard timestamp, current checkout time, or AI inference.

## 5. Market Event adapter

### Identity authority

Market Event Foundation, `MarketEvent.eventId` from `src/market-events/contracts.ts`.

`eventId` is generated from stable occurrence identity and remains separate from schedule revisions.

### Availability

The adapter must choose the earliest repository value that actually represents Alpha Pon knowing the Event identity.

Candidate fields/records include the canonical Market Event registration/ledger provenance and `createdAt`, subject to confirming their write semantics.

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

Use a conservative first-known instant from the Security Master record history, such as the earliest safe retrieval/observation timestamp supported by repository semantics.

Do not use `validFrom` as Research Knowledge availability. `validFrom` describes entity validity, not when Alpha Pon knew the identity.

When multiple revisions exist, availability is based on the earliest authoritative record that establishes the same stable `entityId`, not the newest revision.

## 7. Document adapter — intentionally unresolved

Markdown content remains authoritative at its original file location, but a stable cross-file Document identity contract is not yet declared.

Before canonical `documents` relations are persisted, decide whether identity is based on:

- a durable explicit document ID embedded in metadata;
- a registry-owned ID independent of path;
- another deterministic migration-safe identity.

A repository path alone is currently **not approved** as permanent semantic identity because files may move or be renamed.

Generated output paths and report titles must never become canonical Document IDs accidentally.

## 8. Watch adapter — intentionally unresolved

Watch runtime/configuration remains authoritative in its existing config/code system.

Before canonical `operationalizes` relations are persisted, define a stable Watch ID that survives:

- file moves;
- implementation refactors;
- multiple watch rules in one config file;
- one watch operationalizing multiple research concepts.

Do not equate one config filename with one Research Edge.

## 9. Implementation adapter — intentionally unresolved

Source code remains the implementation truth, but source path alone is not yet approved as permanent semantic identity.

Before canonical `implements` relations are persisted, define whether the durable reference is:

- an explicit implementation capability ID;
- module + exported contract identity;
- another migration-safe identifier.

Implementation identity must not force Research identity to change when code is reorganized.

## 10. Adapter determinism

For the same repository state and the same as-of boundary, an adapter must return the same:

- external IDs;
- availability timestamps;
- ordering.

No network discovery, LLM classification, random IDs, current wall clock, generated Dashboard data, or mutable cache may affect the adapter output used by integrity validation.

## 11. Fail-closed rules

Repository mode must fail when:

- a relation endpoint ID does not exist in the owning authority;
- strict mode requires `availableAt` and no safe timestamp exists;
- availability metadata exists for an undeclared ID;
- `availableAt` lacks an explicit timezone;
- a Research Relation/Lineage claims creation before an endpoint was available.

The fix is to repair provenance or remove/defer the relation. The fix is **not** to synthesize a convenient timestamp.

## 12. Read-only rule

Adapters are read-only projections.

They may not:

- create an Edge because Research Catalog references it;
- create a Market Event because a Case mentions it;
- create a Security Master entity because prose names a company;
- rewrite Watch config;
- move documents;
- write generated IDs back into source systems automatically.

Any write into another authority requires that authority's own explicit workflow.

## 13. Persistence gate implications

The first Research Catalog persistence PR must not attempt to solve all adapters at once.

Recommended order:

1. implement and test Edge/Event/Entity read-only adapters;
2. construct an empty/minimal `ResearchKnowledgeIntegritySnapshot`;
3. call `validateResearchKnowledgeIntegrity(snapshot, { requireExternalAvailability: true })`;
4. prove deterministic output across repeated loads;
5. separately design stable Document/Watch/Implementation identities;
6. only then persist relations using those node types.

If an adapter is unresolved, omit that relation type from the first seed. Do not weaken strict validation to make the seed pass.

## 14. Milestone wording

`RESEARCH_KNOWLEDGE_AUTHORITY_ADAPTER_CONTRACT_V1` means only that the boundary is specified.

It does not mean:

- adapters are implemented;
- repository data is migrated;
- orphan detection is enabled;
- Dashboard reads Research Knowledge;
- any research conclusion or Edge is validated.
