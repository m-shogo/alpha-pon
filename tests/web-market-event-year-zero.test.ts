import assert from "node:assert/strict";
import {
  compareWebMarketEventSortAt,
  webMarketEventJapanDate,
} from "../apps/web/lib/market-event-data.js";

assert.throws(
  () => compareWebMarketEventSortAt("0000-01-01T00:00:00Z", "0001-01-01T00:00:00Z"),
  /valid Gregorian ISO-8601 timestamp/,
  "year zero must not enter read-only market-event ordering",
);

assert.throws(
  () => webMarketEventJapanDate("0000-01-01T00:00:00+09:00"),
  /valid Gregorian ISO-8601 timestamp/,
  "year zero must not enter JST market-event date projection",
);

assert.equal(
  compareWebMarketEventSortAt("0001-01-01T00:00:00Z", "0001-01-01T00:00:00.000000001Z"),
  -1,
  "valid Gregorian instants still preserve nanosecond ordering",
);

console.log("web market event year-zero boundary: fail-closed OK");
