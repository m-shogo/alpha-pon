# EDINET inventory compatibility audit

Status: `LOCAL_MIGRATION_REVIEW_ONLY`
Updated: 2026-08-06 JST

## Purpose

The configured EDINET inventory pilot is intentionally separate from the legacy Sanrio pilot. This audit compares both outputs for the same date range before any legacy entry-point replacement is considered.

It verifies the migration-critical core:

- candidate docID set;
- primary issuer identity and filing metadata;
- review priority and review reasons;
- parent-document lineage root;
- required document types 1 and 2.

The configured issuer allowlist intentionally excludes types 3–5. Legacy-only attachment, English, and CSV plans are reported but do not fail core parity by themselves.

## Preconditions

Run both local inventory-only scans for the same complete date range:

```bash
bash scripts/run-sanrio-edinet-pilot-local.sh \
  --from 2026-01-01 \
  --to 2026-08-06 \
  --output data/edinet/sanrio-edinet-inventory.legacy.2026.json
```

```bash
bash scripts/run-configured-edinet-pilot-local.sh \
  --issuer sanrio \
  --from 2026-01-01 \
  --to 2026-08-06 \
  --output data/edinet/sanrio-edinet-inventory.configured.2026.json
```

Both commands use the same EDINET list endpoint and credentials, but the configured path applies the registry identity and document-type allowlist.

## Audit command

```bash
bash scripts/audit-edinet-inventory-compatibility-local.sh \
  --legacy data/edinet/sanrio-edinet-inventory.legacy.2026.json \
  --configured data/edinet/sanrio-edinet-inventory.configured.2026.json
```

Both inputs must be direct JSON children of `data/edinet`, regular non-symlink files, complete inventories, and Sanrio primary-disclosure inventories.

## Output

```text
data/edinet/sanrio-edinet-inventory-compatibility-v1.<timestamp>.json
data/edinet/sanrio-edinet-inventory-compatibility-v1.<timestamp>.md
```

Files are mode `0600`, exclusive, and durable with `fsync`.

The audit reports:

- range and business-day completeness parity;
- legacy and configured candidate counts;
- matched, mismatched, legacy-only, and configured-only candidates;
- core identity/priority parity;
- review-reason parity;
- lineage-root parity;
- common types 1/2;
- configured missing core types;
- unexpected configured non-allowlisted types;
- expected legacy-only types 3–5;
- deterministic audit hash.

## Green interpretation

```text
equivalentCoreCandidateSet: true
migrationReadyForHumanReview: true
```

This means the machine comparison found no core migration difference and a human may review the report.

It does **not** mean:

- the legacy entry point is replaced;
- configured output is automatically canonical;
- document downloads are authorized;
- source facts are confirmed;
- Foundation/Evidence append is allowed.

The output always remains:

```text
reviewStatus: pending_human_review
replacementAuthorized: false
appendAuthorized: false
```

## Blocking differences

Migration review is blocked by any of the following:

- different date ranges;
- different completeness or scanned business-day counts;
- a candidate present on only one side;
- issuer identity, filing timestamp, parent, description, or review-priority differences;
- review-reason differences;
- lineage-root differences;
- missing configured type 1 or 2 plan;
- configured type 3–5 plan appearing despite the allowlist;
- configured inventory hash mismatch.

Every difference must be investigated against the raw list response and current code before changing either path.

## Safety

This audit reads local inventory metadata only. It does not contact EDINET, download filings, mutate inventories, replace the legacy entry point, append Evidence/Foundation records, send LINE, create BUY/orders, deploy Cloudflare, write D1, or alter workflows/runners.
