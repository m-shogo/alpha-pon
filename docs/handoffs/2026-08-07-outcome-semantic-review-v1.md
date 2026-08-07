# Handoff — Outcome Semantic Review v1

Status: `IMPLEMENTED_AWAITING_CI`
Updated: 2026-08-07 JST
Depends on: Recommendation Persistence (#110/#111), Quantitative Outcome (#112/#114)

## Purpose

Add a separate append-only semantic review layer above immutable RecommendationRecord and QuantitativeOutcomeRecord history.

The quantitative layer remains objective/reproducible. This layer may interpret invalidation, assumptions, confounders and lessons, but it never rewrites the quantitative record and never grants automatic rule or trading authority.

## Review authority

Two explicit authorities exist:

```text
provisional_ai
human_confirmed
```

Reviewer identity is an opaque `reviewerRef` resolved through a reviewer registry supplied to validation.

- `provisional_ai` requires a registry reviewer of kind `ai` and `learningUse=proposal_only`.
- `human_confirmed` requires a registry reviewer of kind `human` and `learningUse=human_confirmed`.
- a human-confirmed review may not later regress to AI provisional authority.

Even human-confirmed review keeps these immutable safety flags false:

```text
ruleMutationAuthorized = false
edgeGateMutationAuthorized = false
automaticTradingAuthorized = false
```

Human confirmation therefore makes the review eligible for governed/manual learning, not automatic rule mutation.

## Immutable lineage

Each semantic review pins:

- Recommendation ID + content hash;
- Quantitative Outcome ID + content hash;
- review timestamp;
- evidence cutoff;
- reviewer authority/ref;
- deterministic SHA-256 content hash.

Recommendation and Quantitative Outcome hashes are recomputed before review acceptance. The Quantitative Outcome must belong to the pinned Recommendation.

Semantic review cannot be finalized before the Quantitative Outcome it reviews, and `evidenceCutoff` cannot precede that Outcome's review time.

## Evidence boundary

Review `sourceEvidence` supports Tier A-D canonical refs.

For every Evidence ref:

- canonical ref must exist;
- stored tier must match canonical tier;
- `observedAt <= evidenceCutoff`;
- secret/token-like refs are rejected.

Every invalidation, assumption or confounder finding may reference only refs declared in `sourceEvidence`.

## Invalidation assessment

Possible values:

```text
triggered
not_triggered
inconclusive
```

- `triggered` requires at least one exact Recommendation invalidation rule and at least one Evidence ref.
- `not_triggered` may not list triggered rules and also requires confirming Evidence.
- `inconclusive` may not assert triggered rules.
- a review cannot introduce a new hindsight invalidation rule that was absent from the Recommendation.

## Assumption assessment

Each structured assumption assessment references the exact assumption text frozen in the original Recommendation.

A review cannot add a new convenient assumption after the fact. The same assumption may be assessed only once per review.

Assessment values:

```text
correct
incorrect
inconclusive
```

Each assessment requires declared Evidence refs.

## Verdict / confounders / lessons

Verdict:

```text
correct
partly_correct
incorrect
inconclusive
```

A non-inconclusive verdict requires at least one semantic basis: assumption assessment, confounder finding, or non-inconclusive invalidation assessment.

The record may also preserve:

- missingEvidence;
- unexpectedConfounders with Evidence refs;
- lessons;
- proposedRuleChanges.

`proposedRuleChanges` are proposals only. Neither AI nor human review automatically edits Edge Gate state, registries, model rules or production code.

## Revision model

- one root semantic review per Recommendation;
- append-only `supersedesReviewId` chain;
- no forks;
- review time strictly increases;
- evidence cutoff cannot regress;
- semantic review may move to a newer Quantitative Outcome for the same Recommendation, but not a chronologically older one;
- human-confirmed authority cannot regress to AI provisional.

## Regression coverage

- valid provisional AI review accepted as proposal-only;
- AI cannot claim human-confirmed learning scope;
- reviewer registry kind must match authority;
- post-cutoff Evidence rejected;
- hindsight assumption injection rejected;
- triggered invalidation requires an original rule and Evidence;
- finding Evidence must be declared;
- mutated Quantitative Outcome with stale hash rejected;
- provisional AI -> human confirmation accepted;
- human -> AI downgrade rejected;
- revision fork rejected;
- rejected append leaves existing JSONL byte-for-byte unchanged.

## Safety

- synthetic fixtures only;
- no claim that a real Recommendation is correct/incorrect;
- no automatic research-rule mutation;
- no automatic Edge Gate change;
- no automatic order authority;
- no LINE BUY delivery;
- no brokerage integration;
- no Cloudflare/D1 write;
- no Secret, billing or runner changes.
