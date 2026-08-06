# Sanrio EDINET review-next batching

Status: `LOCAL_HUMAN_REVIEW_ONLY`
Updated: 2026-08-06 JST

## Purpose

The Sanrio cross-period triage currently leaves a large `review_next` set after the highest-priority correction reason documents have been isolated.

This local-only step reduces the **initial reading workload** without marking any candidate reviewed. It groups candidates by the existing cross-period logical role and routes them into two strategies:

- `review_all_candidates_first`: inspect every period immediately when previews contain exception signals, numeric variance, shape divergence, incomplete pair coverage, non-modified changes, or a large changed section.
- `review_representative_then_confirm_pair`: inspect one deterministic representative first when the period candidates have the same structural shape and no exception signal. The paired period remains a required confirmation before human review can complete.

## Important boundary

Batching changes review order only. It does not decide:

- whether a correction is material;
- whether financial statements changed;
- whether internal control or audit opinions changed;
- whether the content is positive or negative;
- whether the disclosure was newly reported or previously known;
- whether an Evidence/Foundation append is permitted.

A representative candidate never replaces paired-period confirmation.

## Input

A hash-valid local cross-period triage workspace:

```text
data/edinet/sanrio-acquisition.<timestamp>/revision-diff-triage-v1.<timestamp>.json
```

The source must remain:

```text
source: edinet
issuer: E02655 / 81360
reviewStatus: pending_human_review
appendAuthorized: false
```

The command re-verifies the source `triageWorkspaceHash` and aggregate `reviewNextCandidateCount`.

## Command

Use the newest local triage automatically:

```bash
bash scripts/run-sanrio-edinet-review-next-batching-local.sh
```

Use an explicit source:

```bash
bash scripts/run-sanrio-edinet-review-next-batching-local.sh \
  --triage data/edinet/sanrio-acquisition.20260806T064708Z/revision-diff-triage-v1.20260806T082452Z.json
```

## Output

```text
revision-review-next-batches-v1.<timestamp>.json
revision-review-next-batches-v1.<timestamp>.md
```

The output reports:

- source candidate and cluster counts;
- exception clusters;
- representative-first clusters;
- initial candidate count;
- deferred paired-period confirmations;
- estimated initial reading reduction;
- exact routing signals and source previews;
- deterministic candidate, batch, and workspace hashes.

Outputs are mode `0600`, exclusive, durable local files. Existing files are not overwritten.

## Routing signals

Signals are navigation aids only:

- selected accounting, governance, control, audit, litigation, tax, impairment, and compensation keywords;
- numeric token differences visible in bounded previews after date/period tokens are removed;
- structural shape differences across periods;
- incomplete pair coverage;
- candidate count differing from the expected period count;
- large changed-line counts;
- a non-modified candidate unexpectedly remaining in `review_next`.

Preview absence of a signal is not proof of immateriality or equivalence. Full source text and official PDF review remain required.

## Safety

The command does not:

- edit the source triage;
- complete the pending Sanrio PDF visual review;
- append Evidence, Document Revision, or Foundation records;
- change active Edge count or Production Gate;
- send LINE;
- create BUY notifications or orders;
- deploy Cloudflare;
- write D1;
- modify GitHub Actions or runner configuration.
