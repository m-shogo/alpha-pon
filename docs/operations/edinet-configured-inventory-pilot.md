# Configured EDINET inventory-only pilot

Status: `LOCAL_INVENTORY_ONLY`
Updated: 2026-08-06 JST

## Purpose

This entry point connects the configured issuer registry to the EDINET daily document-list API without downloading any filing content.

It is introduced beside the existing Sanrio-specific pilot. The existing `run-sanrio-edinet-pilot.ts` output and behavior remain unchanged while the configured path is validated.

## Command

```bash
bash scripts/run-configured-edinet-pilot-local.sh \
  --issuer sanrio \
  --from 2026-01-01 \
  --to 2026-08-06
```

Issuer identifiers are exact configured values only:

```bash
--issuer sanrio
--issuer E02655
--issuer 81360
--issuer サンリオ
```

Unconfigured, inactive, or ambiguous issuers are rejected before the EDINET scan begins.

## Output

```text
data/edinet/<issuerKey>-edinet-inventory.<from>.<to>.<timestamp>.json
```

The output is mode `0600`, exclusive, and durable with `fsync`. Existing files are never overwritten.

The inventory contains:

- registry hash and issuer boundary hash;
- issuer key, legal name, EDINET code, and security code;
- scanned business-day range and completeness;
- exact primary-disclosure candidates only;
- correction/withdrawal/edit/status review reasons;
- parent-document lineage;
- document acquisition plan filtered by the issuer allowlist;
- `factPromotionPolicy=human_review_required`;
- `requireOfficialPdfVisualReview=true`;
- `appendAuthorized=false`;
- deterministic inventory hash.

## Strict issuer matching

A document is accepted only when every populated primary identity field agrees with the configured issuer:

- populated `edinetCode` must match;
- populated `secCode` must match;
- at least one of the two must be present.

A document where one field matches but the other populated field points to another company is rejected. Third-party filings that merely mention the issuer through `issuerEdinetCode`, filer text, or subject metadata are not primary disclosures.

## Document-type allowlist

The initial Sanrio boundary permits only:

```text
type 1: submitted document and audit ZIP
type 2: official PDF
```

Even when EDINET metadata advertises attachments, English files, or CSV files, types 3–5 are not added to the configured inventory plan unless the issuer registry is explicitly and safely expanded.

This command itself downloads none of types 1–5. It only prepares an inventory and a future acquisition plan.

## Completeness

Every business date in the requested range is scanned sequentially with bounded delay and existing EDINET retry behavior.

If any date fails after retries:

- the inventory is marked partial in memory;
- the CLI prints each failed date and failure class;
- no inventory file is written;
- exit code is `2`.

Credentials missing also exits `2` without printing the key.

## Compatibility boundary

The configured inventory schema is separate from the existing Sanrio inventory schema and includes registry/boundary hashes. Existing Sanrio outputs are not silently rewritten or re-hashed.

Before replacing the Sanrio-specific entry point:

1. run both entry points against the same date range locally;
2. compare candidate docIDs, review reasons, lineage, and type 1/2 plans;
3. investigate all differences;
4. keep both outputs local;
5. version any downstream schema migration explicitly.

## Safety

This command does not:

- download filing ZIPs or PDFs;
- create review, Evidence, Document Revision, or Foundation records;
- promote facts automatically;
- send LINE;
- create BUY notifications or orders;
- deploy Cloudflare;
- write D1;
- change Secrets, billing, workflows, or runners.
