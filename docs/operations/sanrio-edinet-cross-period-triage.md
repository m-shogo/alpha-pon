# Sanrio EDINET cross-period correction triage

Status: `LOCAL_HUMAN_REVIEW_ONLY`
Updated: 2026-08-06 JST

## Purpose

The v2 revision diff aligns renamed EDINET `PublicDoc` entries within each original/correction pair. The real Sanrio run produced the same shape for both periods:

```text
modified=24 added=2 removed=0
```

This symmetry is useful, but it does not prove that all repeated changes are harmless packaging noise. The cross-period triage groups the 52 source candidates by document role across the two correction pairs and creates a review order without confirming semantics, materiality, direction, or investment meaning.

## Input

A hash-valid local v2 workspace:

```text
data/edinet/sanrio-acquisition.<timestamp>/revision-diff-workspace-v2.<timestamp>.json
```

The source must remain:

- `source=edinet`;
- Sanrio `E02655` / `81360`;
- `reviewStatus=pending_human_review`;
- `appendAuthorized=false`.

The command verifies `diffWorkspaceHash` before triage.

## Run

From the repository root after updating `main`:

```bash
bash scripts/run-sanrio-edinet-cross-period-triage-local.sh
```

The newest local v2 workspace is selected automatically. An explicit source can be provided:

```bash
bash scripts/run-sanrio-edinet-cross-period-triage-local.sh \
  --diff-workspace data/edinet/sanrio-acquisition.<timestamp>/revision-diff-workspace-v2.<timestamp>.json
```

## Classification

The triage keeps the prior within-pair alignment boundary intact. For cross-period grouping only, it abstracts the accounting-period date from the already-safe logical role key.

Each candidate is classified as:

- `all_pairs_same_role`: the same document role and change type occur in every correction pair;
- `pair_specific_or_partial`: the role is absent from at least one pair.

Review priority:

- `review_first`: added/removed roles, pair-specific/partial roles, or previews containing explicit correction/control keywords;
- `review_next`: modified roles repeated across all periods without those exception signals.

`review_first` is only an inspection order. It does not mean material, negative, fraudulent, or newly disclosed.

## Output

The command writes new mode-`0600`, local-only files next to the source workspace:

```text
revision-diff-triage-v1.<timestamp>.json
revision-diff-triage-v1.<timestamp>.md
```

The output contains:

- source workspace hash and filename;
- logical role clusters;
- pair coverage and recurrence;
- original before/after previews and hashes;
- review priority and reason codes;
- deterministic cluster and workspace hashes;
- `reviewStatus=pending_human_review`;
- `appendAuthorized=false`.

No prior acquisition, review, v1 diff, or v2 diff file is overwritten.

## Human-review boundary

1. Start with `review_first` clusters.
2. Open the original and corrected PDF side by side.
3. Confirm the exact section and full surrounding context; previews are not sufficient evidence.
4. Separate newly disclosed facts, previously known facts, assumptions, and opinion.
5. Confirm semantic type, materiality, direction, Security Master identity, and PIT times.
6. Only after a human-reviewed manifest exists, run the non-appendable Foundation preview.

Cross-period recurrence is evidence of structural repetition, not proof of immateriality. This command never appends Evidence or Document Revision records and never triggers BUY, order, LINE, Cloudflare deploy, or D1 writes.
