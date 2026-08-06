# Sanrio EDINET API/PDF source fidelity review

## Purpose

This local-only step checks whether selected high-priority lines extracted from the EDINET API type=1 structured filing also appear in text extracted from the official type=2 PDF for the same `docID`.

It answers a narrow question:

> Does the official PDF contain the same selected wording or amount line as the structured filing?

It does **not** automatically decide that the complete documents are identical, that a correction is material, or that the accounting impact is positive or negative.

## Source relationship

- Type `1`: structured filing package (`ZIP`, including PublicDoc XHTML/XBRL)
- Type `2`: PDF representation acquired from EDINET for the same filing `docID`
- Both are acquired through the EDINET document API and are retained locally with SHA-256 metadata.
- Text normalization can change whitespace, line breaks, table order, ruby text, and page headers. Therefore an unmatched anchor is a visual-review requirement, not automatic proof of a contradiction.

## Preconditions

Run these earlier stages successfully:

1. Sanrio EDINET acquisition
2. review workspace
3. correction diff v2
4. cross-period triage
5. focused review bundle

The latest focused bundle can be selected automatically, or supplied explicitly.

## Command

```bash
bash scripts/run-sanrio-edinet-pdf-fidelity-review-local.sh
```

Explicit source:

```bash
bash scripts/run-sanrio-edinet-pdf-fidelity-review-local.sh \
  --focused data/edinet/sanrio-acquisition.20260806T064708Z/revision-focused-review-v1.20260806T084310Z.json
```

## PDF text extraction

The command checks for `pdftotext`.

On macOS it can be installed through Poppler:

```bash
brew install poppler
```

When `pdftotext` is unavailable or fails for a PDF:

- the official PDF file and SHA-256 are still verified;
- the report is generated;
- candidate status remains `pdf_text_extraction_unavailable`;
- manual visual PDF review remains required.

No automatic installation is performed.

## Matching method

1. Verify focused bundle hash.
2. Verify review workspace hash.
3. Resolve the type=2 PDF for each correction `docID`.
4. Verify each local PDF SHA-256.
5. Extract PDF text using `pdftotext -layout` when available.
6. Normalize Unicode, whitespace, and dash variants.
7. Search for selected focus-line anchors exactly in normalized PDF text.

Statuses:

- `exact_anchor_coverage_complete`: all selected anchors were found.
- `partial_exact_anchor_match`: some anchors were found.
- `no_exact_anchor_match`: no selected anchors were found.
- `pdf_text_extraction_unavailable`: no comparable PDF text was available.
- `no_reviewable_anchors`: the candidate contained no sufficiently specific anchor.

## Interpretation boundary

Even `exact_anchor_coverage_complete` means only that every selected anchor was found in the PDF text. It does not establish:

- complete document equivalence;
- completeness of tables or hidden XBRL facts;
- accounting impact;
- materiality;
- market direction;
- whether the disclosure was newly reported or previously known.

For amounts, correction tables, footnotes, and page structure, open the official PDF and visually confirm the relevant page.

## Output

Local-only files are written beside the acquisition artifacts:

```text
revision-source-fidelity-v1.<timestamp>.json
revision-source-fidelity-v1.<timestamp>.md
```

Expected safety boundary:

```text
reviewStatus: pending_human_review
appendAuthorized: false
```

The command does not perform Foundation append, Evidence append, BUY/order actions, LINE delivery, Cloudflare deployment, or D1 writes.
