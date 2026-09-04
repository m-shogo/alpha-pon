# TDnet Market Event candidate boundary

## Purpose

Phase 5 may use TDnet disclosures to discover Market Event candidates, but a TDnet disclosure is not itself proof of a future Market Event schedule.

This boundary is deliberately read-only. It classifies disclosure titles into advisory event-type hints while keeping every result registration-blocked until the primary document establishes the missing canonical facts.

## Non-negotiable rules

- `publishedAt` is disclosure publication metadata only. It must never become `EventTime`.
- A title keyword must never manufacture `startAt`, `endAt`, a TOB deadline, or another future event date.
- A title keyword must never manufacture a stable `occurrenceKey`.
- A candidate must never contain an `eventId` or be inserted into `market_events` by the classifier.
- Every candidate remains `registrationReady: false` until primary-document review resolves all blockers.
- TOB/MBO wording is only a structural signal. The classifier intentionally emits no `TOB_DEADLINE` hint from the title alone.
- Third-party committee setup/update wording must not be promoted to final-report semantics unless the title explicitly indicates report/result receipt.

## Registration blockers

Every TDnet-derived candidate currently carries all of:

1. `future_event_time_not_explicit`
2. `stable_occurrence_key_not_established`
3. `primary_document_review_required`

A later Phase 5 slice may resolve these from primary evidence, but must do so outside this classifier and under the existing Market Event identity/time contracts.

## Validation

`scripts/verify-tdnet-market-event-candidates.ts` runs in the Cloudflare build path and verifies:

- publication time is not EventTime;
- no `occurrenceKey` or `eventId` is produced;
- TOB wording does not invent a deadline;
- committee setup and final-report semantics remain distinct;
- unrelated disclosures do not become candidates;
- harmless whitespace, duplicate rows, and source ordering do not destabilize candidate output.
