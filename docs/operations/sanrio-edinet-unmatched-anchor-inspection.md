# Sanrio EDINET unmatched PDF anchor inspection

## Purpose

This local-only step investigates the small remainder from the API/PDF source fidelity review.

It does not use fuzzy matching and does not decide that two texts are equivalent. For every anchor already classified as `matched: false`, it searches the extracted official PDF text for exact keyword and numeric tokens and produces bounded page/line contexts for human visual review.

## Preconditions

1. Sanrio EDINET acquisition completed.
2. Focused correction review completed.
3. API/PDF source fidelity review completed with `pdftotext` available.
4. At least one anchor is genuinely `matched: false`; pending anchors are not included.

## Command

Latest local fidelity report:

```bash
bash scripts/run-sanrio-edinet-unmatched-anchor-inspection-local.sh
```

Explicit source:

```bash
bash scripts/run-sanrio-edinet-unmatched-anchor-inspection-local.sh \
  --fidelity data/edinet/sanrio-acquisition.20260806T064708Z/revision-source-fidelity-v1.20260806T091446Z.json
```

## Method

1. Verify the fidelity report hash and Sanrio boundary.
2. Select only anchors with `matched: false`.
3. Resolve the official PDF for the same correction `docID`.
4. Verify the local PDF SHA-256.
5. Re-extract text with `pdftotext -layout`.
6. Search exact normalized keywords and numeric/money tokens.
7. Save bounded contexts with PDF page number and nearby lines.

This diagnostic intentionally does not use edit distance, embedding similarity, or automatic semantic equivalence.

## Interpretation

- `context_candidates_found`: the PDF contains one or more exact keyword/number hits near a possible visual equivalent.
- `no_context_candidate_found`: no bounded context was found; the PDF must be opened manually.
- Neither status confirms a contradiction or equivalence.
- PDF line wrapping and table cell separation can make a full-line anchor fail even when all underlying words and numbers are present.

## Output

```text
revision-unmatched-anchor-inspection-v1.<timestamp>.json
revision-unmatched-anchor-inspection-v1.<timestamp>.md
```

Expected boundary:

```text
reviewStatus: pending_human_review
appendAuthorized: false
```

The command does not append Evidence/Foundation records, classify materiality or direction, send LINE messages, place orders, deploy Cloudflare, or write D1.
