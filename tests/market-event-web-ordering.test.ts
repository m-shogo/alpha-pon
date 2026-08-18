import assert from "node:assert/strict";
import {
  compareWebMarketEventsBySortAt,
  compareWebMarketEventSortAt,
  normalizeMarketEventData,
  webMarketEventJapanDate,
  type WebMarketEvent,
} from "../apps/web/lib/market-event-data.js";

assert.equal(
  webMarketEventJapanDate("2026-08-11T15:30:00Z"),
  "2026-08-12",
);
assert.equal(
  webMarketEventJapanDate("2026-08-12"),
  "2026-08-12",
);
assert.throws(
  () => webMarketEventJapanDate("2026-02-31"),
  /valid Gregorian ISO-8601 timestamp/,
  "date-only JST projection must reject impossible Gregorian dates",
);
assert.throws(
  () => webMarketEventJapanDate("0000-01-01"),
  /valid Gregorian ISO-8601 timestamp/,
  "date-only JST projection must reject year zero",
);
assert.equal(
  compareWebMarketEventSortAt(
    "2026-08-12T00:15:00+09:00",
    "2026-08-11T15:30:00Z",
  ),
  -1,
);
assert.equal(
  compareWebMarketEventSortAt(
    "2026-08-11T15:00:00.000000001Z",
    "2026-08-12T00:00:00+09:00",
  ),
  1,
);
assert.throws(
  () => compareWebMarketEventSortAt("2026-08-11T24:00:00Z", "2026-08-12T00:00:00Z"),
  /valid Gregorian ISO-8601 timestamp/,
  "web ordering must reject 24:00 instead of Date.parse-normalizing it into the next day",
);
assert.throws(
  () => webMarketEventJapanDate("2026-08-12T00:00:00-00:00"),
  /known timezone offset/,
  "JST projection must reject an explicitly unknown timezone offset",
);

const offsetOrdered = [
  { sortAt: "2026-08-11T15:30:00Z", priority: "S1" as const },
  { sortAt: "2026-08-12T00:15:00+09:00", priority: "S2" as const },
].sort(compareWebMarketEventsBySortAt);
assert.deepEqual(
  offsetOrdered.map((event) => event.sortAt),
  ["2026-08-12T00:15:00+09:00", "2026-08-11T15:30:00Z"],
  "calendar/list ordering must follow the actual instant rather than lexical timezone text",
);

const nullLast = [
  { sortAt: null, priority: "S0" as const },
  { sortAt: "2026-08-12", priority: "S3" as const },
].sort(compareWebMarketEventsBySortAt);
assert.equal(nullLast[1].sortAt, null, "unknown dates must remain after scheduled events");

const validEvent: WebMarketEvent = {
  schemaVersion: 1,
  eventId: "event-1",
  occurrenceKey: "event-1@2026-08-12",
  issuerCode: "8136",
  issuerName: "サンリオ",
  eventType: "REVIEW_CHECKPOINT",
  title: "synthetic review checkpoint",
  status: "SCHEDULED",
  priority: "S2",
  time: {
    startAt: "2026-08-12",
    endAt: null,
    allDay: true,
    timezone: "Asia/Tokyo",
    precision: "DATE_ONLY",
    windowStart: null,
    windowEnd: null,
  },
  edgeTypes: ["KNOWN_BAD_EVENT_REPRICING"],
  currentDecisionState: "INFO",
  whyItMatters: "synthetic regression fixture",
  checksBefore: [],
  checksAfter: [],
  relatedEventIds: [],
  lastVerifiedAt: "2026-08-11T09:00:00+09:00",
  staleAfter: null,
  createdAt: "2026-08-11T09:00:00+09:00",
  updatedAt: "2026-08-11T09:00:00+09:00",
  revisionNumber: 1,
  sources: [],
  freshnessState: "FRESH",
  calendarIncluded: true,
  sortAt: "2026-08-12",
};

const normalized = normalizeMarketEventData({
  schemaVersion: 1,
  source: "fallback",
  events: [validEvent, null, {}],
  summary: {
    total: 3,
    scheduled: 3,
    unknownDate: 2,
    stale: 2,
    calendarIncluded: 3,
    calendarExcludedUnknownDate: 2,
    priorityCounts: { S0: 2, S1: 0, S2: 1, S3: 0 },
    decisionCounts: { BUY_WATCH: 2, WAIT: 0, BLOCK: 0, ABSTAIN: 0, INFO: 1 },
    nextEventAt: "2026-02-31",
  },
  meta: { warnings: ["existing warning"] },
});
assert.deepEqual(
  normalized.events.map(event => event.eventId),
  ["event-1"],
  "a malformed row must be quarantined instead of crashing the whole read-only calendar",
);
assert.deepEqual(
  normalized.meta.warnings,
  ["existing warning", "不正なイベント 2 件を表示対象から除外しました。"],
  "quarantined rows must be observable without hiding existing warnings",
);
assert.deepEqual(
  normalized.summary,
  {
    total: 1,
    scheduled: 1,
    unknownDate: 0,
    stale: 0,
    calendarIncluded: 1,
    calendarExcludedUnknownDate: 0,
    priorityCounts: { S0: 0, S1: 0, S2: 1, S3: 0 },
    decisionCounts: { BUY_WATCH: 0, WAIT: 0, BLOCK: 0, ABSTAIN: 0, INFO: 1 },
    nextEventAt: null,
  },
  "summary counts must be rebuilt from surviving rows instead of preserving quarantined false-green counts",
);

const invalidSortAt = normalizeMarketEventData({
  schemaVersion: 1,
  source: "fallback",
  events: [{ ...validEvent, eventId: "bad-sort", sortAt: "2026-02-31" }],
  summary: {},
  meta: { warnings: [] },
});
assert.equal(invalidSortAt.events.length, 0, "invalid sortAt rows must be quarantined before rendering");
assert.equal(invalidSortAt.summary.total, 0, "quarantined rows must not remain in the read-only summary total");

for (const invalidRoot of [[], {}, { schemaVersion: 1, events: [] }, "broken"] as unknown[]) {
  const normalizedRoot = normalizeMarketEventData(invalidRoot);
  assert.equal(normalizedRoot.source, "fallback");
  assert.deepEqual(normalizedRoot.events, []);
  assert.deepEqual(
    normalizedRoot.meta.warnings,
    ["イベントJSONの形式が不正です。"],
    "invalid dataset roots must be distinguishable from a legitimate empty fallback",
  );
}

console.log("market-event-web-ordering.test.ts passed");