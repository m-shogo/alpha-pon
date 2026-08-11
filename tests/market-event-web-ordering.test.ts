import assert from "node:assert/strict";
import {
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

console.log("market-event-web-ordering.test.ts passed");
