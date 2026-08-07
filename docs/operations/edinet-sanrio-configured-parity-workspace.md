# Sanrio legacy/configured EDINET parity workspace v1

Status: `LOCAL_HUMAN_MAPPING_PREPARATION_ONLY`
Updated: 2026-08-07 JST

## Purpose

Prepare a local migration-parity workspace after both the legacy Sanrio review and the configured issuer-neutral review have been completed by a human.

This workflow does **not** decide semantic equivalence or authorize replacing the legacy entry point. Machine comparison is intentionally limited to:

- same EDINET `docID`;
- exact SHA-256 equality between the legacy reviewed `sourceText` and configured reviewed structured/PDF anchor text hashes;
- already-recorded human decisions and impact fields, summarized without copying raw reviewed text.

## Required inputs

1. A green inventory compatibility audit:

```text
data/edinet/sanrio-edinet-inventory-compatibility-v1.<timestamp>.json
```

It must remain:

```text
equivalentCoreCandidateSet: true
migrationReadyForHumanReview: true
mismatchCandidateCount: 0
legacyOnlyCandidateCount: 0
configuredOnlyCandidateCount: 0
replacementAuthorized: false
appendAuthorized: false
```

2. A completed legacy Sanrio human review:

```text
data/edinet/sanrio-acquisition.<timestamp>/revision-human-review-record-v1.<timestamp>.json
```

3. A completed configured human comparison review:

```text
data/edinet/sanrio-acquisition.<timestamp>/configured-human-comparison-record-v1.<timestamp>.json
```

The configured record's `registryHash` and issuer `boundaryHash` must match the inventory audit.

## Command

```bash
bash scripts/run-sanrio-configured-parity-workspace-local.sh \
  --inventory-audit data/edinet/sanrio-edinet-inventory-compatibility-v1.<timestamp>.json \
  --legacy-review data/edinet/sanrio-acquisition.<timestamp>/revision-human-review-record-v1.<timestamp>.json \
  --configured-review data/edinet/sanrio-acquisition.<timestamp>/configured-human-comparison-record-v1.<timestamp>.json
```

## Output

The workspace is written beside the configured review:

```text
legacy-configured-parity-workspace-v1.<timestamp>.json
legacy-configured-parity-workspace-v1.<timestamp>.md
```

Files are mode `0600`, exclusive, and `fsync`ed.

## Machine relations

Legacy anchor side:

```text
exact_structured_hash_match
exact_pdf_hash_match
exact_structured_and_pdf_hash_match
same_document_no_exact_hash_match
no_configured_document
```

Configured coverage side:

```text
exact_legacy_source_hash_match
same_document_no_legacy_exact_hash_match
no_legacy_document
```

An exact hash relation is navigation evidence only. It is **not** proof of semantic equivalence, completeness, accounting equivalence, or migration safety.

## Human fields intentionally left pending

Every legacy mapping starts with:

```text
selectedConfiguredAnchorIds: []
humanMappingDecision: pending_human_review
humanNotes: ""
completed: false
```

Every configured coverage item starts with:

```text
humanDisposition: pending_human_review
humanNotes: ""
completed: false
```

A separate workflow must finalize these decisions before any replacement proposal is considered.

## Privacy / source minimization

The workspace does not copy the legacy `sourceText`, configured confirmed-fact prose, assumptions, opinions, or raw filing text. It stores hashes, counts, identifiers, and already-recorded decision categories only.

## Boundary

A successful workspace always remains:

```text
machineStatus: parity_workspace_ready_for_human_mapping
semanticEquivalenceInferred: false
automaticAnchorMappingAuthorized: false
automaticReplacementDecisionAuthorized: false
replacementReviewStatus: pending_human_review
replacementAuthorized: false
foundationPreviewEligible: false
appendAuthorized: false
```

## Non-actions

The command performs no network request, EDINET download, fuzzy/embedding/semantic match, fact promotion, accounting/materiality/direction inference, legacy replacement, Evidence/Foundation append, BUY/order, LINE send, Cloudflare deploy, D1 write, Secret change, workflow change, or runner change.
