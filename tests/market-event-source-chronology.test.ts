import assert from "node:assert/strict";
import { buildMarketEventBundle } from "../src/market-events/registration.js";

const baseInput = {
  issuerCode: "6758",
  issuerName: "Fixture Issuer",
  eventType: "OTHER" as const,
  occurrenceKey: "fixture-source-chronology",
  title: "Fixture event",
  status: "UNKNOWN_DATE" as const,
  priority: "S3" as const,
  time: {
    startAt: null,
    endAt: null,
    allDay: false,
    timezone: "Asia/Tokyo",
    precision: "UNKNOWN" as const,
    windowStart: null,
    windowEnd: null,
  },
  whyItMatters: "Fixture-only provenance regression",
  observedAt: "2026-08-28T10:30:00Z",
  changeType: "CREATED" as const,
  sources: [
    {
      authority: "FIXTURE",
      sourceType: "OTHER" as const,
      url: "https://example.com/fixture",
      title: "Fixture source",
      publishedAt: "2026-08-28T10:00:00Z",
      retrievedAt: "2026-08-28T09:00:00Z",
      contentHash: "fixture-content-hash",
      storageClass: "METADATA_ONLY" as const,
    },
  ],
};

assert.throws(
  () => buildMarketEventBundle(baseInput, {
    revisionNumber: 1,
    previousRevisionId: null,
    existingCreatedAt: null,
  }),
  /source\.publishedAt must be on or before source\.retrievedAt/,
  "a source cannot be retrieved before it was published",
);

console.log("market event source chronology: fail-closed OK");
