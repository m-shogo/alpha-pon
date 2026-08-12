# Handoff — Security Master v1

Status: `SOFTWARE_GREEN_REAL_PILOT_PENDING`
Updated: 2026-08-12 JST
Canonical branch: `main`

## Purpose

Prevent company-name, ticker, parent/subsidiary, brand, facility and provider-code collisions from attaching evidence or prices to the wrong listed security.

A ticker is an identifier of a time-valid listed security, not a company ID. A brand, facility or product is never attached directly to a ticker by fuzzy text.

## Current implementation

Security Master v1 now includes:

- entity and relationship record schemas;
- deterministic content hashes;
- append-only entity and relationship revisions;
- legal entity / listed security / listing separation;
- name and identifier validity periods;
- old-name / old-ticker preservation;
- listed-security -> issuer -> listing resolution;
- official-link verification boundary;
- relationship endpoint-type validation;
- verified identifier collision detection;
- parent-cycle detection;
- ownership inverse validation;
- overlapping issuer validation;
- owner-token single-writer lock;
- cross-file transaction journal;
- partial-tail and incomplete-journal blocking;
- local repository scanner and focused validator CLI;
- local-only runtime boundary;
- historical revision preservation;
- snapshot relationship endpoint integrity;
- strict historical `asOf` validation;
- revision knowledge-time filtering for historical PIT snapshots.

## 2026-08-09 hardening chain

### PR #187 — historical revision shadowing detection

Detects when a newer active revision would cause a revision that was business-effective at a historical `asOf` date to disappear silently.

### PR #188 — preserve effective historical revisions

Repository snapshot construction prefilters revisions by business validity before core active-head selection so a future-effective revision cannot erase the historical identity that was effective at the requested date.

### PR #192 — snapshot endpoint integrity

Relationships returned by an `asOf` snapshot must have both endpoints present in that same snapshot. Dangling relationships produce explicit issues and are removed from the returned snapshot rather than silently surviving with missing entities.

Current issue codes include:

```text
snapshot_relationship_missing_from_entity
snapshot_relationship_missing_to_entity
```

### PR #194 — strict `asOf`

Repository `asOf` must be an exact, real Gregorian `YYYY-MM-DD` date. Inputs such as `2026-02-31`, `2026-8-09`, and `20260809` fail closed and return an empty snapshot while the repository still performs record/schema integrity validation.

### PR #197 — revision knowledge-time PIT gate

Business validity alone is not enough for a historical snapshot. A revision must also have been observed by the requested knowledge cutoff.

For valid date-level snapshots the current cutoff is JST end-of-day. A later-observed correction cannot be backdated into an earlier PIT snapshot and hide the revision actually known at that time.

Current diagnostics include:

```text
future_entity_revision_shadowed
future_relationship_revision_shadowed
historical_entity_revision_shadowed
historical_relationship_revision_shadowed
```

The repository therefore combines three separate constraints:

1. business-time validity (`validFrom` / `validTo`);
2. knowledge-time availability (`observedAt <= asOf cutoff`);
3. endpoint integrity for relationships returned in the same snapshot.

## Entity types

```text
legal_entity
listed_security
listing
segment
brand
facility
product
official_account
```

## Resolution rule

Only exact identifiers with:

- confidence=`verified`;
- matching market/provider namespace where that identifier type requires one;
- validity covering the requested `asOf` date;
- exactly one matching entity;

may resolve. Zero or multiple matches fail closed.

Recommendation-facing listed-security resolution additionally requires:

- active listed security;
- exactly one verified issuer relationship;
- a valid active legal entity;
- exactly one verified listing relationship in v1;
- a valid active listing.

### Resolver namespace hardening — resolved

The previously documented low-level resolver gap is closed on `main` by commit `6d205931d6932f506d9e28e49f12718ea1b66ffd` (`fix: require Security Master resolver namespaces`).

Current behavior is fail-closed and regression-covered:

- ticker resolution rejects absent/blank `market`;
- provider-code resolution rejects absent/blank `provider`;
- exact `jpx_code` / `isin` resolution remains supported without inventing namespaces;
- matching is still exact/normalized only; fuzzy lookup and automatic alias inference remain out of scope.

Do not treat resolver namespace enforcement as pending work or recreate an overlapping PR. New Security Master work should start from latest `main` and target a separately reproducible PIT/provenance/read-only defect.

## Official-source rule

`verifiedOfficialLinks()` returns only links marked `verified_official` and valid at the requested date. Claimed/unknown SNS accounts cannot become stock facts.

## Relationship safety

- relationship endpoint types are fixed;
- self relationships are rejected;
- verified `parent_of` graph cannot contain cycles;
- verified `subsidiary_of` requires matching inverse `parent_of`;
- verified issuer periods for one listed security cannot overlap;
- ownership percentages are accepted only on ownership relationships;
- unresolved relationships cannot enter Recommendation evidence;
- historical snapshots exclude relationships whose entity endpoints are absent at the same `asOf`.

## Persistence safety

Entity and relationship JSONL are append-only but updated as one governed batch. A transaction journal records:

```text
prepared
entities_appended
committed
```

Any non-committed journal blocks subsequent appends and repository use. The system does not automatically delete or guess recovery from an incomplete batch.

## Git hygiene

Security Master hardening has repeatedly overlapped with generated Research OS commits. The safe procedure is:

1. read the latest `main` SHA;
2. keep only the intended changed-file diff;
3. if the branch becomes stale/diverged, do not force-push or rewrite history;
4. close the stale PR without merge;
5. rebuild the same narrow slice from latest `main`;
6. keep one normal working PR at a time;
7. Draft checks -> Ready -> full checks -> squash merge.

Historical stale/superseded Security Master branches/PRs are reference only. Do not revive them merely because the branch still exists remotely.

PR #1 and PR #43 are both closed/unmerged legacy references as of 2026-08-10. They remain DO NOT MERGE reference material only and are unrelated to this hardening chain.

## Activation gate

Software/CI hardening is green, but `SECURITY_MASTER_V1_GREEN` as a real-pilot milestone remains unproven until local evidence validates the full identity chain.

Still required:

1. local synthetic/real pilot records validate;
2. at least one listed security resolves to issuer and listing at two historical dates using real governed records;
3. identifier collision and old-ticker fixtures remain green;
4. no fuzzy lookup path is used by Recommendation or Evidence Store;
5. provider adapters and Foundation pin the intended Security Master identity at the correct PIT cutoff;
6. the real Sanrio/Foundation pilot reaches its governed local gate without identity ambiguity.

Code and synthetic CI alone do not mark the real milestone green.

## Validation

Core validation remains available through the repository-wide checks. Focused local commands include:

```bash
pnpm exec tsc --noEmit
pnpm exec tsc --noEmit -p tsconfig.test.json
node --import tsx/esm src/research/cli/validate-security-master.ts
node --import tsx/esm tests/research/security-master.test.ts
node --import tsx/esm tests/research/security-master-hardening.test.ts
node --import tsx/esm tests/research/security-master-repository.test.ts
node --import tsx/esm tests/research/security-master-snapshot-endpoint-integrity.test.ts
node --import tsx/esm tests/research/security-master-repository-pit-revision.test.ts
node --import tsx/esm tests/research/security-master-resolver-namespace.test.ts
```

## Protected boundaries

- no real company/security master data committed;
- no API credentials;
- no automatic Edge or Production Gate movement;
- no automatic learning adoption;
- no Recommendation/BUY authority expansion;
- no automatic order placement;
- no live LINE send;
- no Cloudflare/D1/billing changes;
- no runner/workflow changes unless a measured workflow defect requires them.

## Next material milestone

With resolver namespace hardening already merged, stop speculative Security Master hardening unless a new reproducible identity defect is found.

Return to the real Foundation path:

1. real local Sanrio preflight/parity;
2. Security Master identity pinning;
3. Bitemporal Evidence Store entity references using `entityId`, never raw ticker;
4. EDINET/J-Quants/provider-code mapping through governed identity;
5. real price / benchmark provenance and Corporate Action Clearance;
6. Decision Firewall pins the actual Security Master/Foundation snapshot.

The canonical local Sanrio entry point remains:

```bash
bash scripts/run-sanrio-real-pilot-preflight-local.sh
```

Run only the printed `nextCommand`, rerun preflight after each successful stage, and stop at `parity_complete_foundation_gate_pending`.
