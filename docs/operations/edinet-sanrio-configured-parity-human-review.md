# Sanrio legacy/configured parity human review v1

Status: `LOCAL_HUMAN_RECOMMENDATION_ONLY`
Updated: 2026-08-07 JST

## Purpose

Finalize the human review of the legacy/configured parity workspace. This stage records explicit evidence mappings, configured coverage dispositions, and a human replacement recommendation.

A recommendation is **not** replacement authorization. This workflow never changes the legacy entry point.

## Preconditions

Create a parity workspace first:

```bash
bash scripts/run-sanrio-configured-parity-workspace-local.sh \
  --inventory-audit data/edinet/sanrio-edinet-inventory-compatibility-v1.<timestamp>.json \
  --legacy-review data/edinet/sanrio-acquisition.<timestamp>/revision-human-review-record-v1.<timestamp>.json \
  --configured-review data/edinet/sanrio-acquisition.<timestamp>/configured-human-comparison-record-v1.<timestamp>.json
```

The workspace must remain non-authorizing and human-pending.

## Create review input

```bash
bash scripts/run-sanrio-configured-parity-human-review-local.sh \
  --workspace data/edinet/sanrio-acquisition.<timestamp>/legacy-configured-parity-workspace-v1.<timestamp>.json
```

Output:

```text
legacy-configured-parity-review-input-v1.<timestamp>.json
legacy-configured-parity-review-input-v1.<timestamp>.md
```

## Required human fields

Top-level:

```text
reviewer
reviewedAt
inventoryAuditHumanConfirmed: true
replacementRecommendation
replacementRationale
```

Replacement recommendation:

```text
recommend_configured_replacement
recommend_keep_legacy
insufficient_evidence
```

### Every legacy mapping

Set:

```text
selectedConfiguredAnchorIds
humanMappingDecision
humanNotes
completed: true
```

Decision values:

```text
equivalent_evidence_coverage
complementary_evidence_coverage
materially_inconsistent
insufficient_evidence
```

Selected configured anchors must come from the workspace's same-document candidates. The machine never auto-selects exact-hash matches.

`materially_inconsistent` and `insufficient_evidence` require human notes.

### Every configured coverage item

Set:

```text
humanDisposition
humanNotes
completed: true
```

Disposition values:

```text
mapped_to_legacy_evidence
additional_coverage_acceptable
blocks_replacement
insufficient_evidence
```

Any configured anchor selected by a legacy mapping must be `mapped_to_legacy_evidence`. A configured anchor that is not selected by any mapping cannot claim that disposition.

`blocks_replacement` and `insufficient_evidence` require human notes.

## Recommendation consistency

`recommend_configured_replacement` is rejected while any of these remain:

- a `materially_inconsistent` legacy mapping;
- a `blocks_replacement` configured coverage item;
- any `insufficient_evidence` mapping or coverage decision.

This is a consistency guard, not an automatic recommendation engine. The human still chooses the recommendation explicitly.

## Finalize

```bash
bash scripts/run-sanrio-configured-parity-human-review-local.sh \
  --finalize data/edinet/sanrio-acquisition.<timestamp>/legacy-configured-parity-review-input-v1.<timestamp>.json
```

Output:

```text
legacy-configured-parity-review-record-v1.<timestamp>.json
legacy-configured-parity-review-record-v1.<timestamp>.md
```

## Final boundary

Even when the human recommendation is `recommend_configured_replacement`, the record remains:

```text
reviewStatus: complete_human_parity_review
semanticEquivalenceInferred: false
automaticMappingDecisionAuthorized: false
automaticReplacementDecisionAuthorized: false
legacyEntryPointMutationAuthorized: false
replacementAuthorized: false
foundationPreviewEligible: false
appendAuthorized: false
```

The next step, if ever justified, is a separate reviewed change that proposes an actual entry-point migration. This record alone can never perform it.

## Non-actions

No network request, EDINET download, automatic mapping, fuzzy/semantic matching, automatic replacement recommendation, legacy code mutation, Foundation/Evidence append, BUY/order, LINE send, Cloudflare deploy, D1 write, Secret change, workflow change, or runner change is performed.
