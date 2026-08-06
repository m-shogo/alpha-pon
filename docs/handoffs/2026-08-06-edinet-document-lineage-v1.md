# Handoff — EDINET Document Acquisition and Lineage v1

Status: `IMPLEMENTED_AWAITING_REAL_RUNNER_AND_LOCAL_CREDENTIAL`
Updated: 2026-08-06 JST
Branch: `feat/edinet-document-lineage-v1`
Parent main: `a4fb6c5813769d99215344ab955a38b3f5276ee4`

## Purpose

Advance the Sanrio local-only Foundation pilot without adding broad APIs.

This slice adds credential-safe acquisition of an exact EDINET document and preserves raw parent-document lineage before any semantic correction or withdrawal conclusion is made.

## Implemented

- authenticated EDINET document endpoint client;
- document type code allowlist (`1` through `5`) without inventing semantic labels;
- bounded retry for network, 429 and temporary 5xx failures;
- `Retry-After` support;
- announced and actual byte-size limits;
- SHA-256 content hash;
- retrieval timestamp and response metadata;
- source endpoint with the credential removed;
- local-only atomic persistence under `data/edinet`;
- duplicate, self-parent, missing-parent, chronology and cycle checks;
- raw EDINET status preservation;
- correction/withdrawal review hints that always require human review;
- focused tests connected through `tests/validation.test.ts`;
- extended operations runbook.

## Safety boundary

- no real document content in Git;
- no API key in Git, PR, Issue, log, report or chat;
- no automatic correction/withdrawal/supersession assertion;
- no automatic Bitemporal Evidence or Document Revision append;
- no new provider/API registration beyond EDINET;
- no paid API;
- no LINE, BUY, order, Cloudflare deployment or D1 write.

## Local command after credential setup

```bash
node --env-file=.env --import tsx/esm src/acquire-edinet-document.ts \
  --doc-id S100XXXX \
  --type 1
```

The output is stored below the ignored `data/edinet` boundary and includes a binary file plus a metadata manifest.

## Still required for the real pilot

1. identify the exact Sanrio primary disclosure and any parent-linked revision documents;
2. acquire the required document types locally with the real credential;
3. review raw status fields and confirm the legal/document relationship;
4. create governed Security Master and Bitemporal Evidence records;
5. map reviewed lineage to Document Revision records;
6. reproduce before/after cutoff snapshots;
7. add local price and benchmark objects only after the disclosure side is complete.

Synthetic tests and GitHub runner success do not complete the real-data milestone.
