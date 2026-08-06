# Sanrio EDINET impact review checklist

Status: `LOCAL_HUMAN_REVIEW_ONLY`
Updated: 2026-08-06 JST

## Purpose

This step converts a hash-verified `revision-review-next-content-v1.*.json` bundle into an editable, governed human-review checklist.

It forces three questions to be decided separately:

1. Did financial-statement values, rows, tables, or disclosures change?
2. Did internal-control disclosures or conclusions change?
3. Did an audit opinion, qualification, disclaimer, adverse opinion, going-concern statement, or related audit disclosure change?

A missing keyword is never treated as proof that there was no change. `not_changed` requires a cited source line or PDF page.

## Input

```text
data/edinet/sanrio-acquisition.<timestamp>/revision-review-next-content-v1.<timestamp>.json
```

The source must remain:

```text
source: edinet
issuer: E02655 / 81360
reviewStatus: pending_human_review
appendAuthorized: false
factStatus: unreviewed_source_text
```

The CLI verifies the source bundle hash before creating the checklist.

## Create a draft checklist

Use the newest content bundle:

```bash
bash scripts/run-sanrio-edinet-impact-review-local.sh
```

Or provide a specific content bundle:

```bash
bash scripts/run-sanrio-edinet-impact-review-local.sh \
  --content data/edinet/sanrio-acquisition.20260806T064708Z/revision-review-next-content-v1.<timestamp>.json
```

Outputs:

```text
revision-impact-review-input-v1.<timestamp>.json
revision-impact-review-input-v1.<timestamp>.md
```

## Required JSON decisions

At record level:

```text
reviewer: non-empty
reviewedAt: ISO date-time
```

For each candidate, complete all three sections:

```text
financialStatements
internalControl
auditOpinion
```

Each section requires:

```text
decision:
  changed | not_changed | not_applicable | insufficient_evidence
affectedItems: [] or named affected items
evidenceReferences: source lines or PDF pages
notes: human explanation
completed: true
```

`changed` requires at least one affected item.

`not_changed`, `changed`, and `insufficient_evidence` require at least one evidence reference. `not_applicable` may omit references, but it remains an explicit human decision.

Evidence reference examples:

```json
{
  "side": "after",
  "lineNumber": 42,
  "pdfPage": null,
  "description": "訂正後全文の売上高行"
}
```

```json
{
  "side": "pdf",
  "lineNumber": null,
  "pdfPage": 12,
  "description": "公式PDFの訂正後表"
}
```

Also complete:

```text
correctionScope:
  governance_disclosure_only
  financial_statement_change
  internal_control_change
  audit_opinion_change
  mixed
  no_substantive_change
  insufficient_evidence

confirmedFacts: []
previouslyKnownFacts: []
assumptions: []
opinions: []
reviewerNotes: string
completed: true
```

Do not mix a confirmed source fact with an inference or investment opinion.

## Finalize

After editing the input JSON:

```bash
bash scripts/run-sanrio-edinet-impact-review-local.sh \
  --finalize data/edinet/sanrio-acquisition.20260806T064708Z/revision-impact-review-input-v1.<timestamp>.json
```

Outputs:

```text
revision-impact-review-final-v1.<timestamp>.json
revision-impact-review-final-v1.<timestamp>.md
```

Finalization rebuilds the source template and rejects changes to:

- candidate, batch, cluster, pair, and docID identities;
- logical role and archive path;
- before/after content hashes;
- source line counts;
- source candidate hash;
- source content-bundle hash.

It also rejects pending decisions, incomplete sections, unsupported `not_changed` conclusions, duplicate/missing candidates, and invalid line/page references.

## Safety boundary

Even a complete checklist remains:

```text
foundationPreviewEligible: false
appendAuthorized: false
```

Foundation preview still requires Security Master resolution, PIT timestamps, license/storage policy, normalized section hashes, and the separate pending PDF visual review where applicable.

This command does not append Evidence or Document Revision records, change active Edge count, send LINE, create BUY/order actions, deploy Cloudflare, write D1, modify Secrets, or alter GitHub Actions runners.
