# Configured EDINET source-fidelity plan v1

Status: `LOCAL_REVIEW_PLAN_ONLY`
Updated: 2026-08-06 JST

## Purpose

Create an issuer-neutral review plan that pairs each hash-verified type 1 structured source with its type 2 official PDF before any text extraction or equivalence judgment occurs.

This step consumes the configured review workspace v2 and does not read the filing payloads.

## Command

```bash
bash scripts/run-configured-edinet-fidelity-plan-local.sh \
  --workspace data/edinet/<issuerKey>-acquisition.<timestamp>/configured-review-workspace-v2.json
```

Optional registry:

```bash
bash scripts/run-configured-edinet-fidelity-plan-local.sh \
  --workspace data/edinet/<issuerKey>-acquisition.<timestamp>/configured-review-workspace-v2.json \
  --registry config/research/edinet-issuer-registry.v1.json
```

## Preconditions

The source workspace must remain:

```text
schemaVersion: 2
source: edinet
acquisitionComplete: true
fileIntegrityVerified: true
reviewStatus: pending_human_review
foundationPreviewEligible: false
appendAuthorized: false
```

The command revalidates:

- workspace hash;
- current registry hash;
- active issuer identity and boundary hash;
- document and lineage-root identity;
- exactly one verified type 1 ZIP and one verified type 2 PDF per document;
- binary/metadata hashes, sizes, and retrieval timestamps carried from the workspace;
- document-count consistency.

## Output

```text
data/edinet/<issuerKey>-acquisition.<timestamp>/configured-source-fidelity-plan-v1.<timestamp>.json
data/edinet/<issuerKey>-acquisition.<timestamp>/configured-source-fidelity-plan-v1.<timestamp>.md
```

Files are mode `0600`, exclusive, and durable with `fsync`.

## Initial state

The plan intentionally starts with no review anchors:

```text
anchorCount: 0
anchorInputStatus: pending_human_input
extractionStatus: not_started
reviewStatus: pending_source_fidelity_review
automaticExtractionAuthorized: false
foundationPreviewEligible: false
appendAuthorized: false
```

Each document pair records:

- docID, parent docID, and lineage root;
- filing description and submission time;
- type 1 binary/metadata hashes and sizes;
- type 2 binary/metadata hashes and sizes;
- minimum one and maximum forty future human-review anchors;
- allowed future extraction methods;
- unresolved equivalence, accounting, internal-control, audit, materiality, and direction decisions;
- explicit blockers.

## Why anchors are empty

The configured review workspace verifies file identity, not semantic content. The fidelity plan therefore cannot manufacture source lines or anchors from filenames, descriptions, or metadata.

A later explicit local workflow must:

1. extract visible structured text from the type 1 source;
2. extract layout text from the official PDF locally;
3. retain the original binary hashes;
4. select bounded anchors with section/path/line/text-hash lineage;
5. compare exact normalized anchors;
6. visually confirm the official PDF page;
7. record equivalence and impact decisions separately.

No fuzzy match or automatic materiality/direction decision is authorized by this plan.

## Parent-child corrections

Documents with a parent receive:

```text
parent_child_revision_comparison_required
```

The plan does not infer correction scope, prior record IDs, supersession strength, or financial impact.

## Synthetic gate

Tests consume the exported synthetic configured pipeline and verify:

- non-Sanrio issuer support;
- deterministic type 1/PDF pairing;
- zero anchors and no automatic extraction;
- missing PDF rejection;
- workspace tamper rejection;
- unsafe Foundation boundary rejection;
- registry drift rejection;
- cross-issuer workspace rejection.

Synthetic placeholder binaries are not parsed by this step.

## Non-actions

The command performs no network request, filing read, text extraction, PDF conversion, anchor generation, equivalence decision, Evidence/Foundation append, LINE send, BUY/order action, Cloudflare deploy, D1 write, Secret update, workflow update, or runner update.
