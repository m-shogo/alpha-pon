# Handoff — Outcome Review Due Orchestration v1

Status: `IMPLEMENTED_AWAITING_CI`
Updated: 2026-08-07 JST
Depends on: Recommendation Persistence (#110/#111), Quantitative Outcome (#112/#114), Semantic Outcome Review (#116)

## Purpose

Derive the next review action from immutable Recommendation, Quantitative Outcome and Semantic Review records without rewriting any historical record.

This is a pure orchestration/read-model layer. It does not create reviews, mutate Recommendation status, schedule brokerage activity, or authorize automated trading.

## Derived states

```text
not_due
quantitative_due
semantic_review_due
human_confirmation_due
reviewed_current
```

Derived `nextAction` values:

```text
wait_for_review_date
create_quantitative_outcome
create_semantic_review
request_human_confirmation
none
```

These actions are advisory workflow state only. They are not execution authority.

## JST due-date semantics

`RecommendationRecord.outcomeReviewDate` is interpreted as a JST calendar date.

The derivation uses `Asia/Tokyo` explicitly rather than the runner's local timezone.

- before the JST due date -> `not_due`;
- on the due date -> due immediately for the next missing stage;
- after the due date -> `overdue=true` until the latest quantitative lineage has a human-confirmed semantic review;
- `daysPastDue` is a JST calendar-day difference.

No exact intraday deadline is invented because `outcomeReviewDate` is date-only.

## Immutable lineage checks

Before deriving queue state, the read model verifies:

- Recommendation `contentHash` recomputes correctly;
- every matched Quantitative Outcome `contentHash` recomputes correctly;
- every matched Semantic Review `contentHash` recomputes correctly;
- every Semantic Review pins a known Quantitative Outcome with the exact content hash;
- all records belong to the same Recommendation ID/hash lineage.

A mutated record with a stale hash is rejected rather than scheduled.

## Latest-lineage rule

The latest Quantitative Outcome by `reviewedAt` is the current measurement lineage.

A semantic review only completes the current queue when it reviews that exact latest Quantitative Outcome hash.

Therefore:

```text
human review of quant-v1
  -> later quant-v2 arrives
  -> prior human review remains historical evidence
  -> current state becomes semantic_review_due for quant-v2
```

This prevents an old human review from silently covering newer price evidence.

## State transitions

### No due date yet

```text
before outcomeReviewDate
-> not_due
-> wait_for_review_date
```

### Due, no quantitative measurement

```text
due date reached
+ no Quantitative Outcome
-> quantitative_due
-> create_quantitative_outcome
```

### Quantitative measurement exists, no semantic review for it

```text
latest Quantitative Outcome exists
+ no matching Semantic Review
-> semantic_review_due
-> create_semantic_review
```

### AI provisional semantic review exists

```text
latest Quantitative Outcome
+ matching provisional_ai Semantic Review
-> human_confirmation_due
-> request_human_confirmation
```

### Human-confirmed semantic review exists

```text
latest Quantitative Outcome
+ matching human_confirmed Semantic Review
-> reviewed_current
-> none
```

A human-confirmed review may also make the lineage `reviewed_current` before the nominal due date. The due date is a latest-review deadline, not a prohibition on earlier review.

## Summary / queue view

`deriveOutcomeReviewDueSummary(...)` returns:

- JST as-of date;
- total Recommendation count;
- overdue count;
- count per derived state;
- deterministically sorted states.

Sort priority:

1. overdue first;
2. `quantitative_due`;
3. `semantic_review_due`;
4. `human_confirmation_due`;
5. `not_due`;
6. `reviewed_current`;
7. due date / recommendation ID tie-breakers.

This can feed a later dashboard/notification layer without persisting mutable queue state.

## Regression coverage

Synthetic tests cover:

- pre-due state;
- exact JST midnight transition into due date;
- JST overdue day count;
- quantitative due -> semantic due transition;
- provisional AI -> human confirmation due;
- human-confirmed -> reviewed current;
- newer Quantitative Outcome makes an older human review stale for current lineage;
- mutated Quantitative Outcome rejected before scheduling;
- mutated Semantic Review rejected before scheduling;
- summary surfaces overdue queue state without mutating any record.

## Important expiry boundary

This v1 does **not** rewrite the original Recommendation to `expired` or `reviewed` when the date passes.

Expiry/review-due is derived state only. If a future product needs a persisted lifecycle event, it should be an append-only event record that pins the Recommendation hash rather than an in-place status edit.

## Safety

- no real Recommendation or Outcome data committed;
- no GitHub Actions schedule added;
- no ChatGPT task/automation created;
- no LINE send;
- no brokerage/order authority;
- no automatic rule or Edge Gate mutation;
- no Cloudflare/D1 write;
- no Secret, billing or runner changes.
