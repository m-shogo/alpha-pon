import assert from "node:assert/strict";
import { buildMarketEventBundle, type MarketEventRegistrationInput } from "../src/market-events/registration.js";

const input: MarketEventRegistrationInput = {
  issuerCode: "8136",
  issuerName: "Sanrio",
  eventType: "EARNINGS_RELEASE",
  occurrenceKey: "FY2026-Q1",
  title: "Fixture event",
  status: "SCHEDULED",
  priority: "S1",
  time: {
    startAt: "2026-08-30T15:00:00+09:00",
    endAt: null,
    allDay: false,
    timezone: "Asia/Tokyo",
    precision: "EXACT",
    windowStart: null,
    windowEnd: null,
  },
  whyItMatters: "Occurrence-key provenance fixture",
  observedAt: "2026-08-28T10:00:00Z",
  publishedAt: "2026-08-28T09:00:00Z",
  firstExecutableAt: "2026-08-28T10:00:00Z",
  changeType: "CREATED",
  sources: [{
    authority: "FIXTURE",
    sourceType: "IR",
    url: "https://example.com/fixture",
    title: "Fixture source",
    publishedAt: "2026-08-28T09:00:00Z",
    retrievedAt: "2026-08-28T09:30:00Z",
    contentHash: "a".repeat(64),
    storageClass: "METADATA_ONLY",
  }],
};

const context = {
  revisionNumber: 1,
  previousRevisionId: null,
  existingCreatedAt: null,
};

const bundle = buildMarketEventBundle(input, context);
assert.equal(bundle.event.occurrenceKey, "FY2026-Q1");

for (const occurrenceKey of [" FY2026-Q1", "FY2026-Q1 "]) {
  assert.throws(
    () => buildMarketEventBundle({ ...input, occurrenceKey }, context),
    /occurrenceKey must be canonical without surrounding whitespace/,
    "registration must reject whitespace-normalized stable event identity",
  );
}
