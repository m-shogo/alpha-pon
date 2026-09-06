import assert from "node:assert/strict";
import {
  buildLatestEventProjection,
  type MarketEventLedgerRecord,
} from "../../src/market-events/local-ledger.js";

function marketEventRecord(updatedAt: string, title: string): MarketEventLedgerRecord {
  return {
    recordType: "MARKET_EVENT",
    recordedAt: "2026-08-10T14:00:00Z",
    payload: {
      schemaVersion: 1,
      eventId: "evt_subms_projection",
      occurrenceKey: "subms-projection",
      issuerCode: "8136",
      issuerName: "Synthetic Issuer",
      eventType: "OTHER",
      title,
      status: "SCHEDULED",
      priority: "S3",
      time: {
        startAt: null,
        endAt: null,
        allDay: false,
        timezone: "Asia/Tokyo",
        precision: "UNKNOWN",
        windowStart: null,
        windowEnd: null,
      },
      edgeTypes: [],
      currentDecisionState: "INFO",
      whyItMatters: "synthetic regression only",
      checksBefore: [],
      checksAfter: [],
      relatedEventIds: [],
      lastVerifiedAt: "2026-08-10T14:00:00Z",
      staleAfter: null,
      createdAt: "2026-08-10T14:00:00Z",
      updatedAt,
    },
  };
}

const newer = marketEventRecord("2026-08-10T14:00:00.000000001Z", "newer");
const older = marketEventRecord("2026-08-10T14:00:00.000000000Z", "older");
const projection = buildLatestEventProjection([newer, older]);

assert.equal(
  projection.get("evt_subms_projection")?.title,
  "newer",
  "same-millisecond records must preserve full fractional-second updatedAt ordering",
);

console.log("research/market-event-ledger: sub-ms latest projection ordering OK");
