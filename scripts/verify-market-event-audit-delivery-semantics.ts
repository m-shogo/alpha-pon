import assert from "node:assert/strict";
import { buildEventId } from "../src/market-events/contracts.js";
import { buildMarketEventBundle, type MarketEventRegistrationInput } from "../src/market-events/registration.js";
import {
  auditMarketEventDatabase,
  getNextRevisionContext,
  listPendingDeliveries,
  openMarketEventDatabase,
  registerMarketEventBundle,
} from "../src/market-events/sqlite-store.js";

const input: MarketEventRegistrationInput = {
  issuerCode: "4661",
  issuerName: "検証会社",
  eventType: "EARNINGS_RELEASE",
  occurrenceKey: "FY2027-Q2-delivery-audit",
  title: "FY2027 Q2 決算発表",
  status: "SCHEDULED",
  priority: "S1",
  time: {
    startAt: "2026-10-30",
    endAt: null,
    allDay: true,
    timezone: "Asia/Tokyo",
    precision: "DATE_ONLY",
    windowStart: null,
    windowEnd: null,
  },
  currentDecisionState: "INFO",
  whyItMatters: "delivery semantic audit regression",
  observedAt: "2026-09-04T07:00:00Z",
  publishedAt: "2026-09-04T06:00:00Z",
  firstExecutableAt: null,
  changeType: "CREATED",
  sources: [{
    authority: "TDNET",
    sourceType: "TDNET",
    url: "https://www.release.tdnet.info/inbs/140120260904000011.pdf",
    title: "決算発表予定日に関するお知らせ",
    publishedAt: "2026-09-04T06:00:00Z",
    retrievedAt: "2026-09-04T06:05:00Z",
    contentHash: "b".repeat(64),
    storageClass: "METADATA_ONLY",
  }],
  decision: null,
  deliveries: [{
    channel: "IN_APP",
    deliveryKey: "delivery-audit",
    scheduledAt: "2026-09-05T00:00:00Z",
  }],
};

const db = openMarketEventDatabase({ path: ":memory:" });
try {
  const eventId = buildEventId(input);
  const bundle = buildMarketEventBundle(input, getNextRevisionContext(db, eventId));
  registerMarketEventBundle(db, bundle);
  assert.equal(auditMarketEventDatabase(db, ":memory:").status, "ok");

  const deliveryId = bundle.deliveries[0].deliveryId;
  db.prepare("UPDATE delivery_outbox SET created_at = ?, updated_at = ? WHERE delivery_id = ?").run(
    "2026-09-06T00:00:00Z",
    "2026-09-05T23:59:59Z",
    deliveryId,
  );
  assert.throws(
    () => listPendingDeliveries(db, "2026-09-06T01:00:00Z"),
    /updated_at must be on or after created_at/,
    "pending-delivery reads must fail closed on impossible persisted lifecycle chronology",
  );
  const audit = auditMarketEventDatabase(db, ":memory:");
  assert.equal(audit.status, "error", "central audit must reject impossible delivery chronology");
  assert.ok(
    audit.invalidDeliveryRows.some(
      row => row.deliveryId === deliveryId && /updated_at must be on or after created_at/.test(row.message),
    ),
    "central audit must identify the delivery row with impossible lifecycle chronology",
  );
} finally {
  db.close();
}

console.log("market-event-audit-delivery-semantics: ok");
