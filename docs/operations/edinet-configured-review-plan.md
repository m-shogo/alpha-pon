# Configured EDINET review plan v1

Status: `LOCAL_REVIEW_PLAN_ONLY`
Updated: 2026-08-06 JST

## Purpose

Convert a complete configured EDINET inventory into a fail-closed downstream review plan before any filing download occurs.

This is the first generic downstream boundary after the configured issuer inventory. It is intentionally separate from the Sanrio-specific acquisition and review-workspace path.

## Command

```bash
bash scripts/run-configured-edinet-review-plan-local.sh \
  --inventory data/edinet/<issuerKey>-edinet-inventory.<from>.<to>.<timestamp>.json
```

Optional explicit registry:

```bash
bash scripts/run-configured-edinet-review-plan-local.sh \
  --inventory data/edinet/<inventory>.json \
  --registry config/research/edinet-issuer-registry.v1.json
```

## Preconditions

The inventory must be:

```text
schemaVersion: 1
source: edinet
completeness: complete
failedDates: []
factPromotionPolicy: human_review_required
requireOfficialPdfVisualReview: true
appendAuthorized: false
```

The CLI revalidates:

- inventory hash;
- registry hash;
- active configured issuer;
- legal name, issuer key, EDINET code, security code, and boundary hash;
- every candidate primary identity;
- lineage without blocking issues;
- every planned document type against the issuer allowlist;
- candidate/lineage one-to-one coverage.

## Output

```text
data/edinet/<issuerKey>-edinet-configured-review-plan-v1.<timestamp>.json
data/edinet/<issuerKey>-edinet-configured-review-plan-v1.<timestamp>.md
```

Files are written mode `0600`, exclusively, and durably with `fsync`.

The plan groups documents by lineage root and records:

- candidate and group counts;
- planned acquisition count;
- type 1 structured-document coverage;
- type 2 official-PDF coverage;
- correction/revision review reasons;
- document-level and global blockers;
- deterministic review-plan hash.

## Missing PDF handling

A candidate without a type 2 PDF plan is retained but receives:

```text
official_pdf_type_2_not_planned
```

It is not treated as reviewed or equivalent. The registry still requires official PDF visual review, so a later workflow must resolve the missing official-PDF route or keep the candidate blocked.

## Synthetic issuer gate

Tests include a non-Sanrio synthetic issuer and verify that:

- issuer labels and group IDs come from the configured boundary;
- no Sanrio identity is inherited;
- registry drift is rejected;
- cross-issuer candidate contamination is rejected;
- inventory tampering is rejected;
- blocking lineage is rejected;
- missing PDF remains a blocker.

No second real issuer is registered or downloaded by this change.

## Final boundary

The output always remains:

```text
reviewStatus: inventory_review_planned
acquisitionAuthorized: false
appendAuthorized: false
```

A separate explicit local acquisition workflow is required to download allowed document types. This plan cannot create Evidence, Foundation, recommendations, BUY notifications, or orders.

## Non-actions

The command performs no EDINET request, filing download, binary write, Foundation/Evidence append, LINE send, BUY/order action, Cloudflare deploy, D1 write, Secret update, workflow update, or runner update.
