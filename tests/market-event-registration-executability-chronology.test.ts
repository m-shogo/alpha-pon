import assert from "node:assert/strict";
import { buildMarketEventBundle, type MarketEventRegistrationInput } from "../src/market-events/registration.js";
import { validateLedgerRecord } from "../src/market-events/local-ledger.js";

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
  whyItMatters: "PIT chronology fixture",
  observedAt: "2026-08-28T10:00:00Z",
  firstExecutableAt: "2026-08-28T09:59:59Z",
  changeType: "CREATED",
  sources: [{
    authority: "FIXTURE",
    sourceType: "IR",
    url: "https://example.com/fixture",
    title: "Fixture source",
    publishedAt: "2026-08-28T09:00:00Z",
    retrievedAt: "2026-08-28T09:30:00Z",
    contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    storageClass: "METADATA_ONLY",
  }],
};

assert.throws(
  () => buildMarketEventBundle(input, {
    revisionNumber: 1,
    previousRevisionId: null,
    existingCreatedAt: null,
  }),
  /firstExecutableAt must be on or after observedAt/,
  "registration must fail closed when executability predates observation",
);

const validBundle = buildMarketEventBundle({
  ...input,
  firstExecutableAt: "2026-08-28T10:00:00Z",
}, {
  revisionNumber: 1,
  previousRevisionId: null,
  existingCreatedAt: null,
});

assert.throws(
  () => validateLedgerRecord({
    recordType: "EVENT_SOURCE",
    recordedAt: "2026-08-28T09:29:59Z",
    payload: validBundle.sources[0]!,
  }),
  /recordedAt must be on or after retrievedAt/,
  "source ledger metadata must not claim persistence before retrieval",
);

validateLedgerRecord({
  recordType: "EVENT_SOURCE",
  recordedAt: "2026-08-28T09:30:00Z",
  payload: validBundle.sources[0]!,
});

console.log("market event registration executability chronology: fail-closed OK");
