# Sanrio EDINET review-next content bundle

Status: `LOCAL_HUMAN_REVIEW_ONLY`
Updated: 2026-08-06 JST

## Purpose

This step consumes the initial-review selection from `revision-review-next-batches-v1.*.json` and extracts the exact before/after PublicDoc entries from the hash-verified EDINET type=1 ZIP archives.

It produces a local review bundle containing:

- normalized full before/after text;
- content hashes and line counts;
- numeric-line navigation candidates;
- footnote-line navigation candidates;
- accounting, internal-control, audit, compensation, and related keyword-line candidates;
- source batch, candidate, archive, and bundle lineage.

The output is a navigation aid. It does not confirm table structure, exact amounts, accounting impact, materiality, direction, or investment meaning.

## Prerequisites

1. Sanrio EDINET acquisition and `review-workspace.json` are complete.
2. Cross-period triage is complete.
3. Review-next batching is complete.
4. The local `unzip` command is available.
5. Type=1 ZIP files still match the SHA-256 values recorded in `review-workspace.json`.

## Commands

Generate review-next batches first:

```bash
bash scripts/run-sanrio-edinet-review-next-batching-local.sh \
  --triage data/edinet/sanrio-acquisition.20260806T064708Z/revision-diff-triage-v1.20260806T082452Z.json
```

Then extract the newest batch automatically:

```bash
bash scripts/run-sanrio-edinet-review-next-content-local.sh
```

Or provide an explicit batch:

```bash
bash scripts/run-sanrio-edinet-review-next-content-local.sh \
  --batch data/edinet/sanrio-acquisition.20260806T064708Z/revision-review-next-batches-v1.<timestamp>.json
```

## Verification

The CLI fails closed when:

- the batch workspace hash is invalid;
- issuer or safety boundaries differ from Sanrio `E02655` / `81360`;
- an initial candidate is missing, duplicated, or also marked deferred;
- the initial candidate aggregate is inconsistent;
- `review-workspace.json` is invalid;
- a required type=1 ZIP is missing or its SHA-256 changed;
- an exact archive entry path is absent;
- a ZIP contains unsafe paths;
- extraction exceeds per-entry or total byte limits;
- modified before/after content is incomplete.

## Output

```text
revision-review-next-content-v1.<timestamp>.json
revision-review-next-content-v1.<timestamp>.md
```

Files are written mode `0600`, exclusively, and durably with `fsync`.

Expected boundary:

```text
reviewStatus: pending_human_review
appendAuthorized: false
factStatus: unreviewed_source_text
```

## Interpretation boundary

A `numeric_line` means only that a line contains a numeric token. A `footnote_line` means only that the line begins with a footnote marker. An `accounting_keyword_line` means only that the line contains a configured navigation keyword.

Before recording a fact, a human must confirm in the official PDF:

- table title and column headers;
- before/after row identity;
- amount, sign, unit, and currency;
- accounting period and effective date;
- recipient and payer where applicable;
- complete footnote scope;
- whether financial statements changed;
- whether internal-control disclosures changed;
- whether audit opinions changed;
- newly disclosed versus previously known information.

## Non-actions

This command does not:

- complete the pending one-anchor visual review;
- mark any review-next candidate complete;
- append Evidence, Document Revision, or Foundation records;
- alter active Edge count, score, Production Gate, or holdout;
- send LINE;
- create BUY notifications or orders;
- deploy Cloudflare;
- write D1;
- modify Secrets, billing, workflows, or runners.
