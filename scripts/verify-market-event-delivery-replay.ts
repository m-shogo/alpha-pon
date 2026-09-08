import assert from "node:assert/strict";
import { buildEventId } from "../src/market-events/contracts.js";
import { buildMarketEventBundle, type MarketEventRegistrationInput } from "../src/market-events/registration.js";
import { getNextRevisionContext, openMarketEventDatabase, registerMarketEventBundle } from "../src/market-events/sqlite-store.js";

const input: MarketEventRegistrationInput = {
  issuerCode: "8136",
  issuerName: "サンリオ",
  eventType: "EARNINGS_RELEASE",
  occurrenceKey: "fy2026-q1",
  title: "FY2026 Q1 決算発表",
  status: "SCHEDULED",
  priority: "S1",
  time: { startAt: "2026-08-10T15:00:00+09:00", endAt: null, allDay: false, timezone: "Asia/Tokyo", precision: "EXACT", windowStart: null, windowEnd: null },
  currentDecisionState: "WAIT",
  whyItMatters: "決算で追加影響を確認する",
  observedAt: "2026-08-03T06:00:00Z",
  changeType: "CREATED",
  sources: [{
    authority: "SANRIO_IR",
    sourceType: "IR",
    url: "https://example.com/sanrio/rev1",
    title: "決算予定",
    publishedAt: "2026-08-01T06:00:00Z",
    retrievedAt: "2026-08-03T06:00:00Z",
    contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    storageClass: "METADATA_ONLY",
  }],
  deliveries: [{
    channel: "IN_APP",
    deliveryKey: "day-before",
    scheduledAt: "2026-08-09T06:00:00Z",
    payload: { message: "original immutable delivery payload" },
  }],
};

const db = openMarketEventDatabase({ path: ":memory:" });
try {
  const eventId = buildEventId(input);
  const bundle = buildMarketEventBundle(input, getNextRevisionContext(db, eventId));
  assert.equal(bundle.deliveries.length, 1, "fixture must contain one delivery");
  registerMarketEventBundle(db, bundle);
  registerMarketEventBundle(db, bundle);

  const originalDelivery = bundle.deliveries[0];
  const changedDeliveryReplay = {
    ...bundle,
    deliveries: [{
      ...originalDelivery,
      payload: { message: "mutated immutable delivery payload" },
    }],
  };
  assert.throws(
    () => registerMarketEventBundle(db, changedDeliveryReplay),
    /delivery replay payload mismatch/,
    "SQLite must reject a reused deliveryId whose immutable registration payload changed",
  );

  const persisted = db.prepare("SELECT payload_json AS payloadJson FROM delivery_outbox WHERE delivery_id = ?")
    .get(originalDelivery.deliveryId) as { payloadJson: string };
  assert.equal(
    persisted.payloadJson,
    JSON.stringify(originalDelivery.payload),
    "failed replay must leave the original delivery payload intact",
  );
} finally {
  db.close();
}

console.log("market-event-delivery-replay: ok");
