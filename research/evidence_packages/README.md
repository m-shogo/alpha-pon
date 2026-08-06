# Evidence Package Manifest v1

This directory stores local append-only EvidencePackageManifest JSONL rows.
Real manifests are ignored by Git. Schemas, validators, synthetic fixtures and
this README remain versioned.

## Purpose

Freeze the exact governed inputs that may be sent to Stock Pro Council and the
Decision Firewall. A package prevents later evidence, corrected documents,
changed Claims, different benchmarks or unrecorded unknowns from being silently
substituted into an earlier decision.

## Runtime file

```text
research/evidence_packages/manifests.jsonl
```

Do not commit real package rows, licensed evidence, price snapshots, benchmark
rows, portfolio data or user-specific suitability information.

## Pinned inputs

Each package pins:

- Security Master snapshot hash;
- full Bitemporal Evidence snapshot hash;
- governed Claim Graph snapshot hash;
- governed Document Revision / Diff snapshot hash;
- issuer price snapshot hash;
- issuer / TOPIX / sector benchmark snapshot hashes;
- market-calendar, code and rule versions;
- exact Evidence, supporting Evidence, Claim, revision and diff IDs;
- confirmed Claim-eligible document-change references;
- completeness flags;
- required Unknown Budget categories;
- unresolved material/binding contradiction IDs;
- deterministic package content hash.

## Lineage vs support Evidence

`evidenceIds` preserves package lineage, including older corrected Evidence when
it remains part of the pinned Evidence Snapshot.

`supportEvidenceIds` contains only Evidence that actively supports eligible
Claims or confirmed material/binding document changes at the exact cutoff.
Every support Evidence ID must resolve as Recommendation-eligible in the
Bitemporal Evidence Store.

## Security boundary

A governed package resolves:

```text
listed security
-> exactly one verified issuer_of relationship
-> legal entity

listed security
-> exactly one verified listed_on relationship
-> listing entity
```

The security, issuer and listing must all be present in `entityIds`. A raw ticker
or company-name match is insufficient.

## External snapshot boundary

A 64-character hash is not proof that a price or benchmark snapshot exists.
The authoritative builder receives a role-specific resolver for:

- issuer price;
- issuer benchmark;
- TOPIX benchmark;
- sector benchmark.

All four roles must resolve independently. Reusing one hash across roles is
rejected. Without the resolver, a package remains draft and cannot become a
governed complete head.

## Completeness

Completeness is recomputed from pinned inputs. It is not trusted from caller
booleans alone.

```text
securityResolved
normalizedEvidence
correctionChainComplete
claimGraphComplete
documentDiffReviewed
benchmarkComplete
priceSnapshotComplete
executionRouteComplete
licenseComplete
contradictionsReviewed
```

Any false field creates an explicit blocker.

## Unknown Budget

Every package stores all eleven categories:

```text
entity
time
license
source
evidence_gap
execution
confounder
counterfactual
valuation
liquidity
portfolio_exposure
```

Unknown entity/time/license/source/evidence/execution/confounder/
counterfactual/valuation/liquidity entries are blocking even if a caller tries
to mark them informational. Known or resolved entries require evidence
references.

## Status

```text
draft
complete
```

The status is derived from blockers. Old rows are never mutated. A corrected
package uses a new `packageId` and optional `supersedesPackageId`, preserving the
same candidate, listed security, entity set and information cutoff.

## Authoritative APIs

```text
buildEvidencePackageManifestGoverned
validateEvidencePackageManifestGoverned
appendEvidencePackageManifestsGoverned
validateEvidencePackageRepository
```

The lower-level `buildEvidencePackageManifest` is a deterministic core helper,
not the final Council input boundary.

## Persistence safety

The writer:

- requires an owner token;
- refuses partial JSONL tails;
- validates every incoming manifest against its pinned context;
- validates existing + incoming supersession chains;
- rejects duplicate IDs/hashes, cycles and multiple active heads;
- appends and fsyncs;
- removes the lock only after owner verification.

## Validation

```bash
node --import tsx/esm src/research/cli/validate-evidence-packages.ts
pnpm research:validate
pnpm research:test
pnpm typecheck
pnpm typecheck:tests
```

No local manifest means the contracts may validate, but the milestone remains
unproven. A complete package is only an input to Council and the Decision
Firewall. It is not a Recommendation, BUY, target price or order authorization.
