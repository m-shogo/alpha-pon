# Sanrio EDINET focused correction review bundle

## Purpose

Create a local-only, hash-linked review bundle for the `review_first` candidates produced by the Sanrio EDINET cross-period triage.

The bundle extracts the complete normalized PublicDoc text for only those candidates and adds line-numbered keyword hits so a human reviewer can confirm:

- the stated correction reason;
- the listed correction items;
- compensation amounts, currencies, periods, and recipients;
- whether the correction changes financial statements or only governance disclosure;
- whether internal-control disclosure or audit opinions changed.

This is a review aid. It does not create Evidence or Document Revision records and does not authorize Foundation append.

## Prerequisites

- A completed Sanrio EDINET acquisition directory under `data/edinet/sanrio-acquisition.*`.
- `review-workspace.json` in the same directory.
- A completed `revision-diff-triage-v1.*.json` file.
- The local `unzip` command.
- All acquired type=1 ZIP files unchanged from their verified SHA-256 values.

## Run

```bash
bash scripts/run-sanrio-edinet-focused-review-local.sh
```

To select a specific triage workspace:

```bash
bash scripts/run-sanrio-edinet-focused-review-local.sh \
  --triage data/edinet/sanrio-acquisition.20260806T064708Z/revision-diff-triage-v1.20260806T082452Z.json
```

## Outputs

The command writes two mode-`0600`, exclusive, local-only files in the acquisition directory:

```text
revision-focused-review-v1.<timestamp>.json
revision-focused-review-v1.<timestamp>.md
```

The Markdown contains:

- source hashes and candidate hashes;
- exact before/after archive paths;
- full normalized text for each `review_first` candidate;
- line-numbered matches for correction, compensation, COLA, tuition, economic benefit, internal control, and amount-related terms;
- an explicit human-review checklist.

## Security and integrity boundaries

The CLI:

- accepts only local `data/edinet/sanrio-acquisition.*` triage files;
- rejects symlinks and path traversal;
- re-verifies the triage workspace hash;
- re-verifies the human-review workspace hash;
- re-verifies every used type=1 ZIP SHA-256;
- requires exact archive entry paths from the triage workspace;
- enforces per-entry and total extraction size limits;
- refuses to overwrite an existing output;
- uses durable writes with `fsync`.

## Interpretation boundary

Keyword matches are navigation aids only. They do not establish materiality, accounting impact, direction, or investment meaning.

Before authoring any fact record:

1. Open both the original and corrected PDFs for each period.
2. Confirm the complete correction reason and every correction item.
3. Confirm names, amounts, currencies, payment periods, and the entity that paid each benefit.
4. Determine whether financial statement numbers changed.
5. Determine whether internal-control disclosure or audit opinions changed.
6. Separate newly disclosed facts, previously known facts, inference, and opinion.
7. Keep `appendAuthorized=false` until the governed human-review input is complete.

## Explicit non-actions

This command does not:

- append Evidence or Document Revision data;
- create a Foundation reviewed preview;
- send LINE notifications;
- place or recommend an order;
- write Cloudflare D1;
- deploy Cloudflare Workers;
- modify GitHub Actions or runner configuration.
