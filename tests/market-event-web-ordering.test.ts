import assert from "node:assert/strict";
import {
  compareWebMarketEventsBySortAt,
  compareWebMarketEventSortAt,
  webMarketEventJapanDate,
} from "../apps/web/lib/market-event-data.js";

assert.equal(
  webMarketEventJapanDate("2026-08-11T15:30:00Z"),
  "2026-08-12",
);
assert.equal(
  webMarketEventJapanDate("2026-08-12"),
  "2026-08-12",
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

console.log("market-event-web-ordering.test.ts passed");
