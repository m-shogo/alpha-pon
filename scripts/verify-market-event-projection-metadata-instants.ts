import assert from "node:assert/strict";
import { buildMarketEventsIcs } from "../src/market-events/ics.js";
import type { MarketEvent } from "../src/market-events/contracts.js";

function baseEvent(): MarketEvent {
  return {
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
      timezone: "Asia/Tokyo",
      precision: "UNKNOWN",
      windowStart: null,
      windowEnd: null,
    },
    edgeTypes: [],
    currentDecisionState: "WAIT",
    whyItMatters: "projection metadata timestamps must preserve explicit-instant provenance",
    checksBefore: [],
    checksAfter: [],
    relatedEventIds: [],
    lastVerifiedAt: "2026-09-04T00:00:00Z",
    staleAfter: null,
    createdAt: "2026-09-04T00:00:00Z",
    updatedAt: "2026-09-04T00:00:00Z",
  };
}

assert.throws(
  () => buildMarketEventsIcs([{ event: baseEvent(), revisionNumber: 1, sources: [] }], "2026-09-07T01:00:00"),
  /market event generatedAt must be a strict ISO timestamp with an explicit timezone offset or Z/,
  "projection generation time must not silently reinterpret a timezone-less instant",
);

const corruptedUpdatedAt = baseEvent();
corruptedUpdatedAt.updatedAt = "2026-09-07T01:00:00";
assert.throws(
  () => buildMarketEventsIcs([{ event: corruptedUpdatedAt, revisionNumber: 1, sources: [] }], "2026-09-07T01:00:00Z"),
  /market event updatedAt must be a strict ISO timestamp with an explicit timezone offset or Z/,
  "UNKNOWN-date events must not bypass persisted metadata instant validation before exclusion from ICS",
);

const corruptedLastVerifiedAt = baseEvent();
corruptedLastVerifiedAt.lastVerifiedAt = "2026-09-07T01:00:00";
assert.throws(
  () => buildMarketEventsIcs([{ event: corruptedLastVerifiedAt, revisionNumber: 1, sources: [] }], "2026-09-07T01:00:00Z"),
  /market event lastVerifiedAt must be a strict ISO timestamp with an explicit timezone offset or Z/,
  "read-only projection must reject timezone-less verification provenance",
);

for (const revisionNumber of [0, 1.5, Number.NaN]) {
  assert.throws(
    () => buildMarketEventsIcs([{ event: baseEvent(), revisionNumber, sources: [] }], "2026-09-07T01:00:00Z"),
    /revisionNumber must be a positive safe integer/,
    `read-only projection must reject invalid revisionNumber ${String(revisionNumber)}`,
  );
}

console.log("market-event-projection-metadata-instants: ok");
