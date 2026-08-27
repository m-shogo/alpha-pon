import assert from "node:assert/strict";
import { normalizeMarketEventData, type WebMarketEvent } from "../apps/web/lib/market-event-data.js";

const validEvent: WebMarketEvent = {
  schemaVersion: 1,
  eventId: "event-lifecycle-1",
  occurrenceKey: "event-lifecycle-1@2026-08-28",
  issuerCode: "8136",
  issuerName: "Sanrio",
  eventType: "REVIEW_CHECKPOINT",
  title: "synthetic lifecycle fixture",
  status: "SCHEDULED",
  priority: "S2",
  time: {
    startAt: "2026-08-28",
    endAt: null,
    allDay: true,
    timezone: "Asia/Tokyo",
    precision: "DATE_ONLY",
    windowStart: null,
    windowEnd: null,
  },
  edgeTypes: [],
  currentDecisionState: "INFO",
  whyItMatters: "synthetic regression fixture",
  checksBefore: [],
  checksAfter: [],
  relatedEventIds: [],
  lastVerifiedAt: "2026-08-27T18:00:00Z",
  staleAfter: "2026-08-29T18:00:00Z",
  createdAt: "2026-08-27T17:00:00Z",
  updatedAt: "2026-08-27T18:00:00Z",
  revisionNumber: 1,
  sources: [],
  freshnessState: "FRESH",
  calendarIncluded: true,
  sortAt: "2026-08-28",
};

const invalidLifecycleRows = normalizeMarketEventData({
  schemaVersion: 1,
  source: "fallback",
  events: [
    validEvent,
    { ...validEvent, eventId: "bad-last-verified", lastVerifiedAt: "2026-08-27" },
    { ...validEvent, eventId: "bad-stale-after", staleAfter: "2026-02-31T00:00:00+09:00" },
    { ...validEvent, eventId: "bad-created-at", createdAt: "2026-08-27T18:00:00" },
    { ...validEvent, eventId: "bad-updated-at", updatedAt: "2026-08-27T18:00:00-00:00" },
  ],
  summary: { nextEventAt: "2026-08-28" },
  meta: { warnings: [] },
});

assert.deepEqual(
  invalidLifecycleRows.events.map(event => event.eventId),
  ["event-lifecycle-1"],
  "market-event lifecycle provenance must require strict explicit-timezone instants before rendering",
);
assert.deepEqual(
  invalidLifecycleRows.meta.warnings,
  ["不正なイベント 4 件を表示対象から除外しました。"],
  "invalid lifecycle timestamps must be quarantined observably",
);
assert.equal(invalidLifecycleRows.summary.total, 1);

console.log("market-event-lifecycle-instant.test.ts passed");
