# Configured EDINET issuer boundary v1

Status: `FOUNDATION_CONTRACT`
Updated: 2026-08-06 JST

## Purpose

The Sanrio pilot proved the acquisition, revision-diff, PDF cross-check, human-review, and non-appendable Foundation boundaries. The next step is to make issuer identity configurable without weakening those safeguards.

This contract introduces an explicit issuer registry. It does not automatically enable a new company, perform a broad API scan, or migrate existing Sanrio evidence into a generic store.

## Registry

Canonical configuration:

```text
config/research/edinet-issuer-registry.v1.json
```

Each issuer declares:

- stable `issuerKey`;
- legal name and exact aliases;
- EDINET code;
- five-digit security code;
- active/inactive status;
- allowed EDINET document API types;
- storage policy;
- mandatory human fact-promotion policy;
- mandatory official-PDF visual review.

The initial registry contains only Sanrio:

```text
issuerKey: sanrio
edinetCode: E02655
secCode: 81360
allowedDocumentTypes: 1, 2
storagePolicy: local_only
factPromotionPolicy: human_review_required
requireOfficialPdfVisualReview: true
```

## Audit

```bash
bash scripts/audit-edinet-issuer-registry.sh
```

Resolve one configured issuer:

```bash
bash scripts/audit-edinet-issuer-registry.sh --issuer sanrio
bash scripts/audit-edinet-issuer-registry.sh --issuer E02655
bash scripts/audit-edinet-issuer-registry.sh --issuer 81360
```

The audit prints deterministic registry and boundary hashes. It does not download documents or contact EDINET.

## Exact resolution only

Issuer resolution accepts only an exact match against:

- `issuerKey`;
- EDINET code;
- security code;
- configured legal name or alias after Unicode/whitespace normalization.

There is no fuzzy company-name matching, embedding lookup, inferred ticker conversion, or automatic Security Master resolution.

Unconfigured, inactive, ambiguous, or cross-issuer identities fail closed.

## Uniqueness rules

The registry rejects:

- duplicate issuer keys;
- duplicate EDINET codes;
- duplicate security codes;
- aliases that normalize to the same value across issuers;
- invalid document API type values;
- empty allowed-document-type sets;
- unsupported storage policies;
- any fact-promotion policy other than `human_review_required`;
- any issuer that disables official-PDF visual review.

## Adding another issuer

Adding a registry entry alone does not authorize a live pilot.

Before a new issuer is activated:

1. Confirm the legal entity, EDINET code, and security code from primary sources.
2. Add exact aliases only; avoid broad brand names that could map to multiple legal entities.
3. Choose only the document API types required by the measured Evidence Gap.
4. Keep raw document storage local unless license and storage review explicitly permit otherwise.
5. Run the registry audit and central test suite.
6. Run a local inventory-only pilot before document acquisition.
7. Keep all source text unreviewed until official PDF and human review are complete.
8. Do not reuse Sanrio facts, hashes, docIDs, correction relations, or decisions for the new issuer.

## Current migration boundary

This PR establishes the shared configured-issuer contract and audit. Existing Sanrio modules remain valid and are not mass-rewritten in one change.

Subsequent migrations must be small and evidence-backed:

1. use the registry for inventory/pilot issuer resolution;
2. attach boundary evidence to local review workspaces;
3. migrate diff/review utilities while preserving existing hashes or versioning output schemas;
4. add a second synthetic issuer before any second real issuer pilot;
5. run one local inventory-only real issuer pilot before acquiring files.

## Safety

This registry:

- contains no API keys, tokens, URLs with secrets, licensed data, prices, portfolio data, or local files;
- cannot promote source text automatically;
- cannot bypass PDF visual review;
- cannot authorize Evidence/Foundation append;
- cannot send LINE, create BUY/order actions, deploy Cloudflare, write D1, or modify GitHub Actions runners.
