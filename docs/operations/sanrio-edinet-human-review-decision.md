# Sanrio EDINET human review decision

## Purpose

This local-only stage turns the unmatched-anchor inspection into an editable, hash-linked human review record.

It is designed to prevent four categories from being mixed:

1. facts confirmed directly from the official EDINET PDF;
2. facts that were already known before the reviewed filing;
3. assumptions or inference;
4. reviewer opinion.

The output does not append Evidence or Foundation records. A completed review still remains `foundationPreviewEligible=false` and `appendAuthorized=false` because Security Master identity, PIT timestamps, licensing, storage policy, and normalized section hashes are separate gates.

## Preconditions

Complete these stages first:

1. Sanrio EDINET acquisition;
2. focused correction review;
3. API/PDF source fidelity review;
4. unmatched PDF anchor inspection.

Expected source:

```text
revision-unmatched-anchor-inspection-v1.<timestamp>.json
```

## Create an editable review input

Latest inspection:

```bash
bash scripts/run-sanrio-edinet-human-review-decision-local.sh
```

Explicit source:

```bash
bash scripts/run-sanrio-edinet-human-review-decision-local.sh \
  --inspection data/edinet/sanrio-acquisition.20260806T064708Z/revision-unmatched-anchor-inspection-v1.20260806T092942Z.json
```

The command writes:

```text
revision-human-review-input-v1.<timestamp>.json
revision-human-review-input-v1.<timestamp>.md
```

The JSON is the editable input. The Markdown is a readable checklist.

## Fields to edit

Top level:

- `reviewer`: non-empty reviewer identity;
- `reviewedAt`: ISO date-time;
- `reviewStatus`: `complete_human_review` only after all anchors are complete;
- `completedAnchorCount`: must equal `anchorCount` before finalization.

Per anchor:

### Source decision

`equivalenceDecision` must be one of:

- `equivalent_layout_variance`: the reviewed PDF visibly contains the same substance and the failed full-line match is explained by layout, wrapping, or table extraction;
- `substantively_different`: the API/XHTML source line and the visually reviewed PDF are materially different;
- `insufficient_visual_evidence`: visual evidence is insufficient for a decision;
- `pending_human_review`: template default; finalization rejects it.

### Evidence location

- `selectedContextNumbers`: one-based context numbers from the inspection Markdown;
- `manualPdfPages`: manually inspected PDF page numbers;
- at least one of those arrays must be non-empty;
- `pdfVisualConfirmation` must be `true`;
- `completed` must be `true`.

### Fact separation

- `confirmedFacts`: only facts directly confirmed from the official PDF;
- `previouslyKnownFacts`: disclosures already known before this filing, when established separately;
- `assumptions`: inference not directly stated in the reviewed source;
- `opinions`: reviewer judgment or investment interpretation.

Do not place inference or opinion in `confirmedFacts`.

### Amounts

Each `exactAmounts` item requires:

```json
{
  "amountText": "amount exactly as displayed",
  "currency": "JPY or source currency",
  "period": "covered period",
  "recipient": "recipient stated in the source",
  "payer": "paying entity stated in the source",
  "sourcePage": 3
}
```

Do not infer a currency, payer, recipient, or period when the PDF does not establish it.

### Correction scope

`correctionScope`:

- `governance_disclosure_only`;
- `financial_statement_change`;
- `mixed`;
- `no_substantive_change`;
- `unknown`.

Impact fields use `yes`, `no`, or `unknown`:

- `financialStatementImpact`;
- `internalControlImpact`;
- `auditOpinionImpact`.

Use `unknown` instead of inferring `no` from silence.

## Finalize and re-hash

After editing the JSON:

```bash
bash scripts/run-sanrio-edinet-human-review-decision-local.sh \
  --finalize data/edinet/sanrio-acquisition.20260806T064708Z/revision-human-review-input-v1.<timestamp>.json
```

Finalization:

- rebuilds the canonical source template from the original inspection report;
- rejects any change to anchor ID, source text, docID, PDF filename, PDF hash, context count, or available pages;
- requires a non-pending decision and visual confirmation;
- re-computes each anchor decision hash and the whole record hash;
- writes new files without overwriting the editable input.

Output:

```text
revision-human-review-decision-v1.<timestamp>.json
revision-human-review-decision-v1.<timestamp>.md
```

Expected boundary:

```text
reviewStatus: complete_human_review
foundationPreviewEligible: false
appendAuthorized: false
```

## Explicit non-actions

This stage does not:

- decide whether the correction was newly disclosed to the market;
- decide materiality or stock-price direction;
- append Evidence, Document Revision, or Foundation records;
- send LINE notifications;
- create a BUY recommendation or order;
- deploy Cloudflare or write D1;
- modify GitHub Actions or runner configuration.
