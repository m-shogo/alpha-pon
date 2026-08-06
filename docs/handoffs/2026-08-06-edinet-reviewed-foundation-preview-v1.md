# Handoff — EDINET Reviewed Foundation Preview v1

Status: `IMPLEMENTED_AWAITING_REAL_RUNNER`
Updated: 2026-08-06 JST
Branch: `feat/edinet-reviewed-foundation-preview-v1`
Parent main: `49f24be70f9aeddc4c044348d0507ea158d7575e`

## Purpose

Convert only human-reviewed EDINET acquisition metadata into deterministic candidate records for the merged Foundation contracts.

This is a preview boundary. It does not append any runtime store and does not make an investment conclusion.

## Required reviewed inputs

- explicit human reviewer and review timestamp;
- confirmed semantic mapping;
- exact EDINET document ID and chain root;
- exact document type code;
- verified Security Master entity IDs;
- source and normalized structure hashes;
- published, observed, retrieved, effective and first-executable timestamps;
- explicit event-time status;
- explicit license and storage policy;
- confirmed revision kind, sequence and status;
- normalized section hashes;
- prior Evidence and Document Revision references for every non-initial revision;
- explicit binding relation semantics for corrections, supersessions or withdrawals.

## Outputs

`buildReviewedEdinetFoundationPreview` returns:

- one hashed Bitemporal Evidence candidate;
- an optional hashed Evidence relation candidate;
- one hashed Document Revision candidate;
- `appendAuthorized=false`.

IDs and hashes are deterministic for the same reviewed input. The source locator contains no API key or raw URL query secret.

## Fail-closed boundaries

The builder rejects:

- non-human or unconfirmed reviews;
- missing or duplicate Security Master entity IDs;
- malformed hashes and governed IDs;
- PIT timestamp reversal;
- missing `firstExecutableAt` reality;
- incompatible license/storage combinations;
- initial revisions with a prior record;
- non-initial revisions without prior records;
- withdrawal records without explicit retract/invalidates semantics;
- empty or malformed normalized sections.

## Deliberately not implemented

- no local review-file CLI yet;
- no automatic extraction of semantic changes;
- no Document Diff generation;
- no append to Evidence or Document Revision stores;
- no real Sanrio records in Git;
- no price/benchmark adapter;
- no other APIs;
- no LINE, BUY, order, Cloudflare deployment or D1 write.

## Next step

After this slice is merged, add a local-only review manifest CLI that validates the reviewed JSON, writes only a preview file below an ignored local directory, and requires a separate explicit governed append command later. The first real append remains blocked until the EDINET credential is configured and the exact Sanrio documents are reviewed locally.
