# Configured EDINET explicit local acquisition v1

Status: `LOCAL_EXPLICIT_EXECUTION_ONLY`
Updated: 2026-08-06 JST

## Purpose

Download only the structured document and official PDF tasks that passed the configured issuer review-plan boundary.

This executor is intentionally explicit and local-only. A review plan alone never starts network access.

## Preconditions

Create a configured inventory and review plan first:

```bash
bash scripts/run-configured-edinet-pilot-local.sh \
  --issuer <issuerKey> \
  --from YYYY-MM-DD \
  --to YYYY-MM-DD
```

```bash
bash scripts/run-configured-edinet-review-plan-local.sh \
  --inventory data/edinet/<issuerKey>-edinet-inventory.<from>.<to>.<timestamp>.json
```

The review plan must pass all of these checks before the executor reads credentials or makes a request:

- deterministic `reviewPlanHash`;
- current registry hash and active issuer boundary;
- exact issuer key, legal name, EDINET code, security code, and boundary hash;
- pending-human-review document state;
- retrievable legal status;
- document types allowed by the issuer registry;
- both type 1 structured data and type 2 official PDF for every candidate;
- no unresolved parent document outside the plan;
- `acquisitionAuthorized=false` and `appendAuthorized=false`.

Missing type 2 or an unresolved external parent is not auto-repaired. The command fails before network access.

## Explicit command

```bash
bash scripts/run-configured-edinet-acquisition-local.sh \
  --review-plan data/edinet/<issuerKey>-edinet-configured-review-plan-v1.<timestamp>.json \
  --execute-local-acquisition
```

The exact `--execute-local-acquisition` flag is mandatory. Without it, the command exits before reading the EDINET credential or creating an output directory.

The API key remains in local `.env` under the existing EDINET environment variable. Its value is never printed.

## Allowed document types

Version 1 accepts only:

```text
type 1: submitted structured document ZIP
type 2: official PDF
```

Types 3–5 are rejected even when a tampered review plan contains them. The current configured issuer registry must also allow types 1 and 2.

## Output directory

```text
data/edinet/<issuerKey>-acquisition.<timestamp>/
```

The directory is mode `0700`. Binary, metadata, plan, attempt, and manifest files are mode `0600`, exclusive, and durable with `fsync`.

Every successful document produces:

```text
<docID>.type-<type>.<sha-prefix>.<zip|pdf>
<docID>.type-<type>.<sha-prefix>.metadata.json
```

Metadata records:

- registry and boundary hashes;
- source review-plan file and hash;
- acquisition-plan hash;
- issuer key, docID, type, format, and reason;
- byte length and SHA-256;
- content headers and retrieval time;
- EDINET endpoint without the API key;
- local-only storage and explicit execution mode;
- `appendAuthorized=false`.

## Failure behavior

Each task uses the existing bounded retry and maximum-byte contracts.

When one or more tasks fail:

```text
acquisition-attempt.json
complete: false
canonicalManifestWritten: false
appendAuthorized: false
```

The canonical `acquisition-manifest.json` is not written. Successfully downloaded local files are retained for diagnostics but cannot enter the generic review workspace as a complete acquisition.

The command exits with code `2`.

## Success behavior

Only when every planned task succeeds:

```text
acquisition-manifest.json
complete: true
canonicalManifestWritten: true
reviewStatus: pending_human_review
appendAuthorized: false
```

The complete manifest still does not confirm any filing fact, PDF equivalence, materiality, accounting impact, or investment meaning.

## Environment limits

```text
EDINET_DOCUMENT_MAX_BYTES
EDINET_ACQUISITION_DELAY_MS
```

Both are bounded positive/non-negative numeric values. Defaults match the existing Sanrio local acquisition path.

## Safety

This executor does not:

- infer or add an issuer;
- fetch an external parent automatically;
- download document types outside the configured plan;
- commit local filings or metadata to Git;
- create Evidence, Document Revision, or Foundation records;
- replace the Sanrio v1 acquisition path;
- send LINE;
- create BUY notifications or orders;
- deploy Cloudflare;
- write D1;
- modify Secrets, billing, workflows, or runners.
