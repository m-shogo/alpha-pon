import assert from "node:assert/strict";
import { validateLedgerRecord, type MarketEventLedgerRecord } from "../src/market-events/local-ledger.js";

const record: MarketEventLedgerRecord = {
  recordType: "DELIVERY_OUTBOX",
  recordedAt: "2026-08-03T05:00:00Z",
  payload: {
    schemaVersion: 1,
    deliveryId: "dlv_test",
    eventId: "evt_test",
    revisionId: "rev_test",
    channel: "IN_APP",
    deliveryKey: "test",
    scheduledAt: "2026-08-09T06:00:00Z",
    status: "PENDING",
    attemptCount: 0,
    lastAttemptAt: null,
    deliveredAt: null,
    leaseExpiresAt: null,
    createdAt: "2026-08-03T04:59:00Z",
    updatedAt: "2026-08-03T05:00:01Z",
  },
};

assert.throws(
  () => validateLedgerRecord(record),
  /recordedAt must be on or after delivery updatedAt/,
  "ledger must reject delivery snapshots persisted before their claimed latest update",
);

console.log("delivery-ledger-chronology: ok");
