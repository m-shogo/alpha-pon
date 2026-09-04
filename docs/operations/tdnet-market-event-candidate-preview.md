# TDnet Market Event candidate preview

## Purpose

Read the current official TDnet public disclosure viewer and show **review candidates only**.

This command is intentionally not an ingestion or registration command.

```bash
node --import tsx/esm scripts/preview-tdnet-market-event-candidates.ts
```

Optional date and output limit:

```bash
node --import tsx/esm scripts/preview-tdnet-market-event-candidates.ts --date 2026-09-04 --limit 50
```

## What it does

1. reads the date-scoped official TDnet public viewer pages;
2. parses disclosure source metadata;
3. classifies titles into advisory Market Event review hints;
4. prints a JSON preview to stdout.

The summary contains:

- source observation date;
- page count and official page URLs;
- disclosure count;
- candidate count;
- unmatched disclosure count;
- blocker counts;
- whether output was truncated by `--limit`.

## Safety boundary

The preview has no write path.

It does **not**:

- write the source checkpoint;
- write local SQLite or Cloudflare D1;
- create `market_events`, revisions, review tasks, or delivery rows;
- modify `config/watchlist.yml`;
- send LINE/Slack/Calendar notifications;
- infer EventTime from TDnet publication time;
- infer `occurrenceKey` or `eventId` from a disclosure title;
- treat a TOB/MBO disclosure as proof of a TOB deadline;
- affect BUY/SELL, portfolio, Research Gate, or Production promotion.

Every candidate remains `registrationReady: false` with these blockers until a later primary-document review establishes the missing facts:

- `future_event_time_not_explicit`
- `stable_occurrence_key_not_established`
- `primary_document_review_required`

## Important timestamp rule

`disclosurePublishedAt` is source publication metadata only. It is **not** the future event time and must never be copied into `MarketEvent.time`.

## What comes next

A later review layer may examine the linked primary document and determine whether a stable occurrence identity and an explicit future event time actually exist. Only after that evidence is established may code prepare a `MarketEventRegistrationInput` for a separate dry-run review.
