# Handoff — Evidence Package Manifest v1

Status: `IMPLEMENTED_AWAITING_FULL_VALIDATION`
Updated: 2026-08-06 JST
Parent branch: `feat/document-revision-diff-v1`
Branch: `feat/evidence-package-manifest-v1`

## Purpose

Freeze the exact governed research inputs passed to Stock Pro Council and the
Decision Firewall. Prevent later Evidence, changed Claims, corrected documents,
different prices/benchmarks or hidden unknowns from being substituted into an
earlier decision package.

## Implemented

- EvidencePackageManifest schema;
- deterministic package content hash;
- Security Master snapshot hash;
- Bitemporal Evidence snapshot hash pin;
- Claim Graph snapshot hash pin;
- Document Revision / Diff snapshot hash pin;
- price and issuer/TOPIX/sector benchmark hash pins;
- role-specific external hash resolver;
- listed-security -> issuer -> listing closure check;
- Evidence lineage IDs and support Evidence IDs separation;
- eligible Claim and confirmed document-change derivation;
- completeness recomputation;
- eleven-category Unknown Budget;
- unknown-severity spoof protection;
- unresolved contradiction propagation;
- draft / complete derived status;
- append-only package supersession ledger;
- duplicate/cycle/multiple-head/identity validation;
- owner-token append + fsync writer;
- local repository scanner and focused CLI;
- core, governed, ledger/writer and repository synthetic fixtures;
- local-only runtime boundary and README.

## Authoritative APIs

```text
buildEvidencePackageManifestGoverned
validateEvidencePackageManifestGoverned
appendEvidencePackageManifestsGoverned
validateEvidencePackageRepository
```

The lower-level builder remains a deterministic helper. Council, Decision
Firewall and Recommendation integration must use only the governed builder and
validator.

## Snapshot pins

A package pins:

```text
Security Master snapshot
Bitemporal Evidence snapshot
Claim Graph snapshot
Document Revision / Diff snapshot
issuer price snapshot
issuer benchmark snapshot
TOPIX benchmark snapshot
sector benchmark snapshot
```

It also pins exact IDs, versions, completeness, Unknown Budget and final content
hash.

Security, Evidence, Claim and Document snapshots must use the same information
cutoff. Security Master uses the corresponding JST date.

## Security closure

The authoritative builder requires:

```text
legal entity --issuer_of--> listed security --listed_on--> listing
```

Both relationships must be verified and unique. The issuer, security and
listing IDs must all be closed inside the package entity set. Company-name or
ticker inference is not accepted.

## External pin resolver

Price and benchmark hashes are resolved by role-specific sets. A syntactically
valid hash is not enough.

```text
price
issuer benchmark
TOPIX benchmark
sector benchmark
```

Unresolved roles force draft status. The same hash cannot be reused across
multiple roles.

## Evidence selection

`evidenceIds` preserves the complete package lineage represented by Claim and
Document snapshots.

`supportEvidenceIds` is narrower. It contains only Evidence supporting eligible
Claims or confirmed material/binding document changes. Support Evidence must be
Recommendation-eligible at the same cutoff.

This allows corrected historical Evidence to remain visible in lineage without
silently becoming active support.

## Completeness and blockers

Completeness is derived rather than trusted:

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

False fields create `incomplete:<field>` blockers. Other blockers include:

```text
no_eligible_claims
no_eligible_support_evidence
blocking_unknown:<category>
open_contradiction:<edgeId>
```

A package is complete only when the derived blocker set is empty.

## Unknown Budget

All eleven categories are mandatory:

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

Core stock-research unknowns are blocking even if caller input marks them
informational. Known/resolved entries require Evidence references.

## Supersession ledger

Rows remain immutable. A replacement package:

- uses a new package ID;
- references `supersedesPackageId`;
- keeps candidate, listed security, entity set and information cutoff;
- has a later creation timestamp;
- produces a new deterministic hash.

The ledger rejects duplicate IDs/hashes, missing parents, self-reference,
cycles and multiple active heads for one candidate/security/cutoff chain.

## Repository validation

For each stored information cutoff the scanner reconstructs:

- Security Master repository snapshot;
- Bitemporal Evidence repository snapshot;
- Claim Graph repository snapshot and assessments;
- Document Revision repository snapshot and confirmed changes.

It then rebuilds the package and requires an exact governed match. External
price/benchmark pins must be supplied by a resolver. Without them, a stored
complete package fails closed.

## Activation gate

`EVIDENCE_PACKAGE_MANIFEST_V1_GREEN` remains unproven until:

1. exact latest HEAD passes full typecheck and tests;
2. GitHub Actions executes real runner steps and passes;
3. Security Master, Evidence, Claim and Document local pilots are green;
4. price and all three benchmark hashes resolve through real snapshot stores;
5. at least one real package is generated from issue-time-compatible inputs;
6. the same inputs reproduce the same package content hash;
7. before/after correction packages preserve historical lineage correctly;
8. Council Replay pins the exact package hash;
9. Decision Firewall accepts only governed complete package hashes;
10. synthetic packages do not move active Edge or Production Gate state.

Code and synthetic fixtures alone do not mark the milestone green.

## Validation commands

```bash
pnpm typecheck
pnpm typecheck:tests
pnpm research:validate
pnpm research:test
node --import tsx/esm src/research/cli/validate-evidence-packages.ts
node --import tsx/esm tests/research/evidence-package-manifest.test.ts
node --import tsx/esm tests/research/evidence-package-governed.test.ts
node --import tsx/esm tests/research/evidence-package-ledger.test.ts
node --import tsx/esm tests/research/evidence-package-repository.test.ts
```

These commands are documented but have not been executed against the exact
latest HEAD in this session. GitHub Actions has not completed real runner steps,
and the earlier isolated clone attempt could not reach GitHub due outbound DNS.

## Protected boundaries

- no real package rows committed to Git;
- no price/benchmark data fabricated from hash shape;
- no automatic Council verdict;
- no Recommendation / BUY / target price generation;
- no automatic order placement;
- no active Edge / Production Gate movement;
- no live LINE send;
- no secrets, Cloudflare, D1 or billing changes.

## Next slice

1. Testable Hypothesis / Scenario Manifest pinned to one complete package;
2. Council Replay package-hash integration;
3. Decision Firewall package-hash integration;
4. real price/benchmark snapshot resolver;
5. first disclosure/correction package pilot.
