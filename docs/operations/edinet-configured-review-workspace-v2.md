# Configured EDINET review workspace v2

Status: `LOCAL_HUMAN_REVIEW_ONLY`
Updated: 2026-08-06 JST

## Purpose

Convert a complete configured acquisition into a generic issuer-aware review workspace after re-verifying every local binary and metadata file.

This is a versioned schema separate from the Sanrio-specific `review-workspace.json` v1. It does not silently rewrite, replace, or reinterpret the existing Sanrio workspace.

## Preconditions

Run the configured pipeline through a complete acquisition:

```text
configured inventory
→ configured review plan
→ explicit configured acquisition
→ acquisition-manifest.json
```

Only the canonical complete manifest is accepted. A partial `acquisition-attempt.json` is rejected.

## Command

```bash
bash scripts/run-configured-edinet-review-workspace-local.sh \
  --manifest data/edinet/<issuerKey>-acquisition.<timestamp>/acquisition-manifest.json
```

Optional explicit registry:

```bash
bash scripts/run-configured-edinet-review-workspace-local.sh \
  --manifest data/edinet/<issuerKey>-acquisition.<timestamp>/acquisition-manifest.json \
  --registry config/research/edinet-issuer-registry.v1.json
```

The command performs no network request.

## Source lineage verification

Before opening source files, the builder revalidates:

- current registry hash;
- active configured issuer and exact issuer identity;
- review-plan hash and safety boundary;
- acquisition-plan hash and source review-plan hash;
- acquisition-manifest hash and source acquisition-plan hash;
- complete/canonical manifest status;
- empty failure list;
- explicit-local execution and local-only storage;
- candidate, lineage root, and type 1/type 2 coverage.

All source contracts must agree on issuer key, legal name, EDINET code, security code, and boundary hash.

## Local file verification

For every manifest success record, the CLI requires direct regular non-symlink files inside the acquisition directory:

```text
binaryFile
metadataFile
```

It verifies:

- binary byte length;
- binary SHA-256;
- metadata maximum size;
- metadata JSON validity;
- metadata registry/boundary/review-plan/acquisition-plan lineage;
- docID, type, format, reason, source docID, and retrieval time;
- binary byte length and SHA-256 repeated in metadata;
- explicit local execution;
- local-only storage;
- `appendAuthorized=false`;
- source endpoint contains no credential query parameter.

The metadata file itself receives a SHA-256 and byte length in the v2 workspace.

## Output

```text
data/edinet/<issuerKey>-acquisition.<timestamp>/configured-review-workspace-v2.json
data/edinet/<issuerKey>-acquisition.<timestamp>/configured-review-workspace-v2.md
```

Files are mode `0600`, exclusive, and durable with `fsync`.

The workspace records:

- `schemaVersion: 2`;
- registry and issuer boundary hashes;
- review-plan, acquisition-plan, and manifest file/hash lineage;
- verified type 1 and type 2 acquisitions;
- binary and metadata hashes and sizes;
- documents grouped by lineage root;
- review priority and reasons;
- document and group checklists;
- deterministic workspace hash.

## Review boundary

A valid workspace means only that the local source files and their governed acquisition lineage are intact.

It does not establish:

- API/PDF semantic equivalence;
- exact amounts, units, periods, recipients, or payers;
- newly reported versus previously known facts;
- financial-statement impact;
- internal-control impact;
- audit-opinion impact;
- materiality or price direction;
- Foundation eligibility.

The output remains:

```text
acquisitionComplete: true
fileIntegrityVerified: true
reviewStatus: pending_human_review
foundationPreviewEligible: false
appendAuthorized: false
```

## Synthetic issuer gate

Tests run a non-Sanrio synthetic issuer through:

```text
inventory
→ review plan
→ acquisition plan
→ complete synthetic manifest
→ verified-file attestations
→ configured review workspace v2
```

They also reject:

- missing file verification;
- binary hash mismatch;
- partial/incomplete manifest;
- acquisition-plan tampering;
- registry drift;
- validly re-hashed missing type 1/type 2 acquisition.

No second real issuer or real filing is downloaded by these tests.

## Non-actions

This command does not contact EDINET, download files, mutate source binaries, append Evidence/Foundation records, replace the Sanrio v1 workspace, send LINE, create BUY/orders, deploy Cloudflare, write D1, modify Secrets, or alter workflows/runners.
