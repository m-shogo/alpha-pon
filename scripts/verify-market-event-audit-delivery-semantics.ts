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
  const canonicalDeliveryKey = bundle.deliveries[0].deliveryKey;
  const canonicalScheduledAt = bundle.deliveries[0].scheduledAt;
  const canonicalChannel = bundle.deliveries[0].channel;

  db.prepare("UPDATE delivery_outbox SET delivery_key = ? WHERE delivery_id = ?").run(
    " Delivery Audit ",
    deliveryId,
  );
  assert.throws(
    () => listPendingDeliveries(db, "2026-09-06T01:00:00Z"),
    /deliveryKey must be canonical/,
    "pending-delivery reads must fail closed on non-canonical persisted delivery keys",
  );
  let audit = auditMarketEventDatabase(db, ":memory:");
  assert.equal(audit.status, "error", "central audit must reject non-canonical persisted delivery keys");
  assert.ok(
    audit.invalidDeliveryRows.some(
      row => row.deliveryId === deliveryId && /deliveryKey must be canonical/.test(row.message),
    ),
    "central audit must identify the delivery row with a non-canonical delivery key",
  );
  db.prepare("UPDATE delivery_outbox SET delivery_key = ? WHERE delivery_id = ?").run(
    canonicalDeliveryKey,
    deliveryId,
  );

  db.prepare("UPDATE delivery_outbox SET scheduled_at = ? WHERE delivery_id = ?").run(
    "2026-09-05T00:00:01Z",
    deliveryId,
  );
  assert.throws(
    () => listPendingDeliveries(db, "2026-09-06T01:00:00Z"),
    /deliveryId does not match canonical delivery identity/,
    "pending-delivery reads must fail closed when persisted identity inputs drift from deliveryId",
  );
  audit = auditMarketEventDatabase(db, ":memory:");
  assert.equal(audit.status, "error", "central audit must reject stale persisted deliveryId bindings");
  assert.ok(
    audit.invalidDeliveryRows.some(
      row => row.deliveryId === deliveryId && /deliveryId does not match canonical delivery identity/.test(row.message),
    ),
    "central audit must identify the delivery row with a stale deliveryId binding",
  );
  db.prepare("UPDATE delivery_outbox SET scheduled_at = ? WHERE delivery_id = ?").run(
    canonicalScheduledAt,
    deliveryId,
  );

  db.exec("PRAGMA ignore_check_constraints = ON");
  db.prepare("UPDATE delivery_outbox SET channel = ? WHERE delivery_id = ?").run("EMAIL", deliveryId);
  db.exec("PRAGMA ignore_check_constraints = OFF");
  assert.throws(
    () => listPendingDeliveries(db, "2026-09-06T01:00:00Z"),
    /Unknown delivery channel: EMAIL/,
    "pending-delivery reads must fail closed when persisted channel bypasses the schema enum constraint",
  );
  audit = auditMarketEventDatabase(db, ":memory:");
  assert.equal(audit.status, "error", "central audit must reject unknown persisted delivery channels");
  assert.ok(
    audit.invalidDeliveryRows.some(
      row => row.deliveryId === deliveryId && /Unknown delivery channel: EMAIL/.test(row.message),
    ),
    "central audit must identify the delivery row with an unknown channel",
  );
  db.prepare("UPDATE delivery_outbox SET channel = ? WHERE delivery_id = ?").run(canonicalChannel, deliveryId);

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
  audit = auditMarketEventDatabase(db, ":memory:");
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