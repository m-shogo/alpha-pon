# Configured EDINET human comparison review v1

Status: `LOCAL_HUMAN_REVIEW_ONLY`
Updated: 2026-08-07 JST

## Purpose

Convert an exact-normalized comparison report into a human-completed, issuer-neutral review record.

The workflow requires an official PDF visual decision for every anchor and records facts, previously known facts, assumptions, opinions, exact amounts, and impact judgments separately.

It does not automatically promote facts or authorize a Foundation/Evidence append.

## Preconditions

Create the exact comparison report first:

```bash
bash scripts/run-configured-edinet-exact-comparison-local.sh \
  --anchor-final data/edinet/<issuerKey>-acquisition.<timestamp>/configured-fidelity-anchor-final-v1.<timestamp>.json \
  --execute-exact-comparison
```

Required source boundary:

```text
comparisonStatus: complete_exact_normalized_comparison
reviewStatus: pending_human_comparison_review
fuzzyMatchingUsed: false
semanticEquivalenceInferred: false
officialPdfVisualReviewComplete: false
foundationPreviewEligible: false
appendAuthorized: false
```

## Create the human-input template

```bash
bash scripts/run-configured-edinet-human-comparison-review-local.sh \
  --comparison data/edinet/<issuerKey>-acquisition.<timestamp>/configured-fidelity-exact-comparison-v1.<timestamp>.json
```

Outputs:

```text
configured-human-comparison-input-v1.<timestamp>.json
configured-human-comparison-input-v1.<timestamp>.md
```

The template starts with every decision pending or unknown.

## Required anchor fields

For every anchor, a human reviewer must fill:

```text
visualConfirmation: true
visualDecision:
  visually_equivalent | visually_different | insufficient_visual_evidence
equivalenceDecision:
  equivalent | substantively_different | insufficient_evidence
confirmedFacts: string[]
previouslyKnownFacts: string[]
assumptions: string[]
opinions: string[]
exactAmounts: [] or amount records
accountingImpact: yes | no | unknown
internalControlImpact: yes | no | unknown
auditOpinionImpact: yes | no | unknown
materiality: material | not_material | unknown
direction: positive | negative | neutral | unknown
reviewNotes: string
completed: true
```

Visual and equivalence decisions must agree:

```text
visually_equivalent -> equivalent
visually_different -> substantively_different
insufficient_visual_evidence -> insufficient_evidence
```

A completed anchor requires at least one confirmed fact unless the decision is `insufficient_evidence`.

## Exact amounts

Each amount record requires:

```text
amountText
currency
period
recipient
payer
sourcePage
```

Do not invent missing values. Leave `exactAmounts` empty when the official PDF does not establish all required fields.

## Finalize

```bash
bash scripts/run-configured-edinet-human-comparison-review-local.sh \
  --finalize data/edinet/<issuerKey>-acquisition.<timestamp>/configured-human-comparison-input-v1.<timestamp>.json
```

Outputs:

```text
configured-human-comparison-record-v1.<timestamp>.json
configured-human-comparison-record-v1.<timestamp>.md
```

Final boundary:

```text
reviewStatus: complete_human_comparison_review
automaticFactPromotionAuthorized: false
automaticImpactDecisionAuthorized: false
foundationPreviewEligible: false
appendAuthorized: false
```

## Meaning of the final record

The record proves that:

- the exact comparison report and nested result hashes were verified;
- every anchor was visually reviewed against the official PDF;
- the reviewer explicitly recorded equivalence and impact decisions;
- confirmed facts, prior facts, assumptions, and opinions were separated;
- decision hashes were regenerated.

It does not prove that the record is eligible for Foundation mapping or governed append. Security Master, PIT timestamps, license/storage policy, section hashing, revision mapping, and a distinct mapping workflow remain required.

## Non-actions

This workflow performs no network request, EDINET download, fuzzy matching, semantic inference, automatic fact promotion, automatic impact decision, Foundation/Evidence append, BUY/order action, LINE send, Cloudflare deploy, D1 write, Secret change, workflow change, or runner change.
