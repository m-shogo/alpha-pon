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
  whyItMatters: "Issuer-code provenance fixture",
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
assert.equal(bundle.event.issuerCode, "8136");
validateMarketEventBundle(bundle);

for (const issuerCode of [
  " 8136 ",
  "８１３６",
  "",
]) {
  const forged = structuredClone(bundle);
  forged.event.issuerCode = issuerCode;

  assert.throws(
    () => validateMarketEventBundle(forged),
    /issuerCode must be canonical/,
    "standalone bundle validation must reject issuer-code aliases even when eventId still matches the canonicalized identity",
  );
}

console.log("market-event-issuer-code-provenance: ok");
