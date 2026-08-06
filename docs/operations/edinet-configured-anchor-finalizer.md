# Configured EDINET human anchor finalizer v1

Status: `LOCAL_HUMAN_INPUT_FINALIZATION_ONLY`
Updated: 2026-08-07 JST

## Purpose

Finalize a human-edited configured anchor-input JSON only after every structured and PDF locator is verified against the extracted local source files.

This workflow verifies anchor lineage. It does not run normalized comparison, decide semantic equivalence, classify accounting impact, or authorize Foundation/Evidence append.

## Prerequisite

Run explicit fidelity extraction first:

```bash
bash scripts/run-configured-edinet-fidelity-extraction-local.sh \
  --fidelity-plan data/edinet/<issuerKey>-acquisition.<timestamp>/configured-source-fidelity-plan-v1.<timestamp>.json \
  --execute-local-extraction
```

This creates:

```text
configured-fidelity-extraction-v1.<timestamp>.json
configured-fidelity-anchor-input-v1.<timestamp>.json
<docID>.configured-structured-visible-text-v1.json
<docID>.configured-pdf-layout-v1.txt
```

## Edit the anchor input

At record level, enter:

```text
reviewer: non-empty human reviewer identity
reviewedAt: ISO date-time
```

For every document:

```text
status: complete_human_input
anchorCount: number of anchors
anchors: 1–40 entries
```

Each anchor requires:

```text
anchorId: globally unique
reason: human explanation
structured.entryPath
structured.lineNumber: 1-based
structured.text: exact extracted line
structured.textHash: SHA-256 of the exact line
pdf.pageNumber: 1-based
pdf.lineNumber: 1-based within the page
pdf.text: exact extracted PDF-layout line
pdf.textHash: SHA-256 of the exact line
expectedRelation:
  exact_normalized_match
  visual_layout_variance_review
```

`expectedRelation` is only a review expectation. It is not a comparison result or equivalence decision.

The existing template `recordHash` does not need to be edited manually. The finalizer recalculates the edited-input hash internally.

## Finalize

```bash
bash scripts/run-configured-edinet-anchor-finalizer-local.sh \
  --anchor-input data/edinet/<issuerKey>-acquisition.<timestamp>/configured-fidelity-anchor-input-v1.<timestamp>.json
```

## Verification

The finalizer revalidates:

- extraction-bundle hash and non-comparison safety boundary;
- edited input source extraction file/hash;
- immutable pair ID, pair hash, extraction hash, docID, filenames, file hashes, and anchor limits;
- extracted structured JSON file SHA-256;
- structured archive hash;
- structured entry text hashes;
- extracted PDF-layout file SHA-256;
- one to forty anchors per document;
- global anchor-ID uniqueness;
- duplicate locator rejection within one document;
- exact structured entry and 1-based line position;
- exact structured line text and SHA-256;
- exact PDF 1-based page/line position;
- exact PDF line text and SHA-256;
- non-empty reviewer, review time, reason, and source lines.

No whitespace normalization or fuzzy matching is applied during finalization. The supplied line must exactly equal the extracted line.

## Output

```text
configured-fidelity-anchor-final-v1.<timestamp>.json
configured-fidelity-anchor-final-v1.<timestamp>.md
```

Files are mode `0600`, exclusive, and durable with `fsync`.

Boundary:

```text
reviewStatus: complete_anchor_input
comparisonStatus: not_started
automaticComparisonAuthorized: false
foundationPreviewEligible: false
appendAuthorized: false
```

Each anchor records:

```text
lineageVerified: true
```

This means only that the chosen line locations and hashes match the local extraction files.

## What is not decided

The finalizer does not determine:

- whether structured and PDF text are equal after normalization;
- whether a mismatch is extraction layout variance or substantive difference;
- full-document equivalence;
- financial-statement impact;
- internal-control impact;
- audit-opinion impact;
- materiality;
- market direction;
- newly reported versus previously known facts.

Those decisions require the next exact-comparison and governed human-decision workflow, including visual inspection of the official PDF.

## Non-actions

The command performs no network request, EDINET download, filing mutation, automatic anchor generation, fuzzy comparison, Evidence/Foundation append, LINE send, BUY/order action, Cloudflare deploy, D1 write, Secret change, workflow change, or runner change.
