import assert from "node:assert/strict";
import { validateMarketEventBundle } from "../src/market-events/contracts.js";
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
  whyItMatters: "Source-URL provenance fixture",
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
  deliveries: [],
};

const bundle = buildMarketEventBundle(input, {
  revisionNumber: 1,
  previousRevisionId: null,
  existingCreatedAt: null,
});
assert.equal(bundle.sources[0]?.url, "https://example.com/fixture");
validateMarketEventBundle(bundle);

for (const url of [
  "https://EXAMPLE.com/fixture",
  "https://example.com:443/fixture",
]) {
  const forged = structuredClone(bundle);
  forged.sources[0]!.url = url;

  assert.throws(
    () => validateMarketEventBundle(forged),
    /Source URL must use the canonical URL serialization/,
    "standalone bundle validation must reject URL aliases even when sourceId still matches the canonicalized identity",
  );
}

console.log("market-event-source-url-provenance: ok");
