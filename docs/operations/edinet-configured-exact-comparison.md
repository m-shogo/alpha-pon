# Configured EDINET exact-normalized comparison v1

Status: `LOCAL_EXPLICIT_COMPARISON_ONLY`
Updated: 2026-08-07 JST

## Purpose

Compare finalized human-selected structured/PDF anchors with one conservative deterministic normalization rule.

This workflow records exact normalized equality or a mismatch that remains pending official PDF visual review. It does not use fuzzy matching, semantic similarity, embeddings, LLM classification, or issuer-specific assumptions.

## Preconditions

Create and finalize a human anchor record first:

```bash
bash scripts/run-configured-edinet-anchor-finalizer-local.sh \
  --anchor-input data/edinet/<issuerKey>-acquisition.<timestamp>/configured-fidelity-anchor-input-v1.<timestamp>.json
```

Required source boundary:

```text
reviewStatus: complete_anchor_input
comparisonStatus: not_started
automaticComparisonAuthorized: false
foundationPreviewEligible: false
appendAuthorized: false
```

## Explicit command

```bash
bash scripts/run-configured-edinet-exact-comparison-local.sh \
  --anchor-final data/edinet/<issuerKey>-acquisition.<timestamp>/configured-fidelity-anchor-final-v1.<timestamp>.json \
  --execute-exact-comparison
```

The exact `--execute-exact-comparison` flag is mandatory.

## Normalization contract

Version:

```text
unicode-nfkc-horizontal-whitespace-v1
```

Allowed operations:

1. Unicode NFKC normalization.
2. Convert tabs, ordinary spaces, no-break spaces, and ideographic spaces into one ordinary space.
3. Collapse consecutive horizontal spaces.
4. Remove horizontal space only at the start and end of the selected line.

Not allowed:

- punctuation removal;
- comma or decimal removal;
- sign normalization beyond what Unicode NFKC itself performs;
- case folding;
- number conversion or tolerance;
- word reordering;
- line joining;
- fuzzy/edit-distance matching;
- embedding or semantic matching;
- issuer-specific dictionaries.

Anchors remain single extracted lines. A line break or form-feed inside one anchor is rejected.

## Result states

```text
exact_normalized_match
not_exact_normalized_match_pending_visual_review
```

An exact normalized match proves only that the two selected lines are equal under the stated normalization. It does not prove visual fidelity, semantic equivalence, accounting impact, materiality, or market direction.

A mismatch is not automatically classified as a substantive difference. It remains pending human layout/content review.

## Output

```text
configured-fidelity-exact-comparison-v1.<timestamp>.json
configured-fidelity-exact-comparison-v1.<timestamp>.md
```

The report includes:

- source final-record hash;
- normalization version;
- per-anchor raw and normalized equality;
- normalized text hashes and lengths;
- per-anchor and per-document result hashes;
- exact-match and mismatch counts;
- immutable unknown impact decisions;
- explicit visual-review blockers.

Boundary:

```text
comparisonStatus: complete_exact_normalized_comparison
reviewStatus: pending_human_comparison_review
fuzzyMatchingUsed: false
semanticEquivalenceInferred: false
officialPdfVisualReviewComplete: false
automaticEquivalenceDecisionAuthorized: false
foundationPreviewEligible: false
appendAuthorized: false
```

## Whitespace fidelity

The extraction and anchor-finalization stages preserve PDF leading indentation, page separators, and internal blank lines. Exact source hashes are checked before normalization. Normalization is applied only to the comparison copy; the original anchor text and its hash remain unchanged.

## Non-actions

The command performs no network request, EDINET download, fuzzy matching, semantic-equivalence decision, accounting/internal-control/audit decision, materiality/direction decision, Foundation/Evidence append, LINE send, BUY/order action, Cloudflare deploy, D1 write, Secret change, workflow change, or runner change.
