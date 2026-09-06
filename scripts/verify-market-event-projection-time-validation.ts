import assert from "node:assert/strict";
import { buildMarketEventsIcs } from "../src/market-events/ics.js";
import type { MarketEvent } from "../src/market-events/contracts.js";

const event: MarketEvent = {
  schemaVersion: 1,
  eventId: "evt_0123456789abcdef01234567",
  occurrenceKey: "fy2026-q1",
  issuerCode: "8136",
  issuerName: "サンリオ",
  eventType: "EARNINGS_RELEASE",
  title: "FY2026 Q1 決算発表",
  status: "UNKNOWN_DATE",
  priority: "S1",
  time: {
    startAt: null,
    endAt: null,
    allDay: false,
    timezone: "Mars/Olympus",
    precision: "UNKNOWN",
    windowStart: null,
    windowEnd: null,
  },
  edgeTypes: [],
  currentDecisionState: "WAIT",
  whyItMatters: "read-only projection must not publish corrupted persisted EventTime state",
  checksBefore: [],
  checksAfter: [],
  relatedEventIds: [],
  lastVerifiedAt: "2026-09-04T00:00:00Z",
  staleAfter: null,
  createdAt: "2026-09-04T00:00:00Z",
  updatedAt: "2026-09-04T00:00:00Z",
};

assert.throws(
  () => buildMarketEventsIcs([{ event, revisionNumber: 1, sources: [] }], "2026-09-07T00:00:00Z"),
  /Invalid EventTime timezone: Mars\/Olympus/,
  "calendar/public projection must fail closed even when UNKNOWN precision would otherwise be excluded before timezone validation",
);

console.log("market-event-projection-time-validation: ok");
