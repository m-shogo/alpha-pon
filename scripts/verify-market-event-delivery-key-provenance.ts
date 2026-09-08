import assert from "node:assert/strict";
import { validateMarketEventBundle } from "../src/market-events/contracts.js";
import { buildMarketEventBundle, type MarketEventRegistrationInput } from "../src/market-events/registration.js";

const input: MarketEventRegistrationInput = {
  issuerCode: "8136",
  issuerName: "Sanrio",
  eventType: "EARNINGS_RELEASE",
  occurrenceKey: "fy2026-q1",
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
  whyItMatters: "Delivery-key provenance fixture",
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
  deliveries: [{
    channel: "IN_APP",
    deliveryKey: "day before",
    scheduledAt: "2026-08-29T06:00:00Z",
  }],
};

const context = {
  revisionNumber: 1,
  previousRevisionId: null,
  existingCreatedAt: null,
};

const canonical = buildMarketEventBundle(input, context);
assert.equal(canonical.deliveries[0]?.deliveryKey, "day before");
validateMarketEventBundle(canonical);

for (const deliveryKey of [
  " Day Before ",
  "DAY  BEFORE",
  "ＤＡＹ ＢＥＦＯＲＥ",
]) {
  const alias = buildMarketEventBundle({
    ...input,
    deliveries: [{
      channel: "IN_APP",
      deliveryKey,
      scheduledAt: "2026-08-29T06:00:00Z",
    }],
  }, context);

  assert.equal(
    alias.deliveries[0]?.deliveryKey,
    "day before",
    "registration must persist the same canonical delivery key used by stable delivery identity",
  );
  assert.equal(
    alias.deliveries[0]?.deliveryId,
    canonical.deliveries[0]?.deliveryId,
    "delivery-key aliases must not create persisted spelling that diverges from stable delivery identity",
  );
}

for (const deliveryKey of [
  " Day Before ",
  "DAY  BEFORE",
  "ＤＡＹ ＢＥＦＯＲＥ",
]) {
  const forged = structuredClone(canonical);
  if (!forged.deliveries[0]) throw new Error("delivery fixture is required");
  forged.deliveries[0].deliveryKey = deliveryKey;

  assert.throws(
    () => validateMarketEventBundle(forged),
    /deliveryKey must be canonical/,
    "standalone bundle validation must reject delivery-key aliases even when stable deliveryId still matches the canonicalized identity",
  );
}

assert.throws(
  () => buildMarketEventBundle({
    ...input,
    deliveries: [{
      channel: "IN_APP",
      deliveryKey: " 　 ",
      scheduledAt: "2026-08-29T06:00:00Z",
    }],
  }, context),
  /deliveryKey is required/,
  "registration must still reject delivery keys that canonicalize to empty text",
);

console.log("market-event-delivery-key-provenance: ok");
