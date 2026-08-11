import assert from "node:assert/strict";
import {
  compareMarketEventSortAt,
  marketEventOccursOnOrAfterJapanDate,
} from "../src/market-events/projection.js";

assert.equal(
  compareMarketEventSortAt(
    "2026-08-12T00:15:00+09:00",
    "2026-08-11T15:30:00Z",
  ),
  -1,
);

assert.equal(
  marketEventOccursOnOrAfterJapanDate(
    "2026-08-11T15:30:00Z",
    "2026-08-12",
  ),
  true,
);
assert.equal(
  marketEventOccursOnOrAfterJapanDate(
    "2026-08-11T14:59:59.999999999Z",
    "2026-08-12",
  ),
  false,
);
assert.equal(
  marketEventOccursOnOrAfterJapanDate("2026-08-12", "2026-08-12"),
  true,
);

console.log("market-event-projection-instant-ordering.test.ts passed");
