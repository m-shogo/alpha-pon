# Configured EDINET explicit local fidelity extraction v1

Status: `LOCAL_EXPLICIT_EXTRACTION_ONLY`
Updated: 2026-08-06 JST

## Purpose

Extract visible text from verified type 1 structured ZIPs and layout text from verified type 2 official PDFs, then generate an empty human anchor-input template.

This workflow preserves the original binary hashes and does not generate anchors, compare text, decide equivalence, or promote facts.

## Preconditions

Create a configured fidelity plan first:

```bash
bash scripts/run-configured-edinet-fidelity-plan-local.sh \
  --workspace data/edinet/<issuerKey>-acquisition.<timestamp>/configured-review-workspace-v2.json
```

The plan must remain:

```text
anchorCount: 0
anchorInputStatus: pending_human_input
extractionStatus: not_started
reviewStatus: pending_source_fidelity_review
automaticExtractionAuthorized: false
foundationPreviewEligible: false
appendAuthorized: false
```

## Explicit command

```bash
bash scripts/run-configured-edinet-fidelity-extraction-local.sh \
  --fidelity-plan data/edinet/<issuerKey>-acquisition.<timestamp>/configured-source-fidelity-plan-v1.<timestamp>.json \
  --execute-local-extraction
```

The exact `--execute-local-extraction` flag is mandatory. Without it, source binaries are not read.

Local commands required:

```text
unzip
pdftotext
```

## Source verification

Before extraction, every document is checked against the fidelity plan:

- direct regular non-symlink source file;
- recorded byte length;
- recorded SHA-256;
- type 1 source has ZIP magic;
- type 2 source has `%PDF-` magic.

The synthetic `.synthetic.bin` placeholders fail the magic check and cannot enter this workflow.

## Structured extraction

The executor:

- lists ZIP entries with `unzip -Z1`;
- rejects absolute, backslash, empty, dot, and parent-traversal paths;
- selects supported EDINET `PublicDoc` entries only;
- limits entry count, per-entry bytes, and total extracted bytes;
- reuses the existing visible-text normalizer;
- writes a per-document structured JSON file containing entry path, normalized text, text hash, line count, and byte length.

Output:

```text
<docID>.configured-structured-visible-text-v1.json
```

## PDF extraction

The executor runs:

```text
pdftotext -layout <official-pdf> -
```

It preserves form-feed page separators, normalizes line endings, trims trailing whitespace, limits output size, and rejects empty output.

Output:

```text
<docID>.configured-pdf-layout-v1.txt
```

A successful text extraction is not proof of visual fidelity. The official PDF must still be opened and checked by a human.

## Extraction bundle

```text
configured-fidelity-extraction-v1.<timestamp>.json
configured-fidelity-extraction-v1.<timestamp>.md
```

The bundle records:

- fidelity-plan and workspace lineage hashes;
- original type 1/type 2 binary hashes;
- extracted file hashes and byte lengths;
- structured entry and line counts;
- PDF line and page counts;
- deterministic per-document extraction hashes;
- deterministic extraction-bundle hash.

Boundary:

```text
extractionStatus: complete
anchorInputStatus: pending_human_input
comparisonStatus: not_started
reviewStatus: pending_anchor_input
automaticAnchorGenerationAuthorized: false
automaticComparisonAuthorized: false
foundationPreviewEligible: false
appendAuthorized: false
```

## Anchor template

```text
configured-fidelity-anchor-input-v1.<timestamp>.json
configured-fidelity-anchor-input-v1.<timestamp>.md
```

The template starts with zero anchors. Each document requires 1–40 human-selected anchors.

A future anchor contains:

```text
anchorId
reason
structured.entryPath
structured.lineNumber
structured.text
structured.textHash
pdf.pageNumber
pdf.lineNumber
pdf.text
pdf.textHash
expectedRelation:
  exact_normalized_match
  visual_layout_variance_review
```

The user must open both extracted files and select exact lines. The template does not calculate hashes, validate line positions, or run a comparison. Those checks belong to the next governed finalization workflow.

## Limits

```text
ZIP list: 5 MiB
PublicDoc entries: 500
one structured entry: 10 MiB
all structured entries: 50 MiB
PDF extracted text: 50 MiB
anchors per document: 1–40
```

## Non-actions

The command performs no network request, EDINET download, automatic anchor generation, fuzzy matching, equivalence decision, accounting/internal-control/audit decision, materiality/direction decision, Evidence/Foundation append, LINE send, BUY/order action, Cloudflare deploy, D1 write, Secret change, workflow change, or runner change.
