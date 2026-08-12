import assert from "node:assert/strict";
import { jquantsFreeObservedAt } from "../../src/research/providers/jquants-free.js";
import { compareExplicitIso8601Instants } from "../../src/research/iso-instant.js";

const observedAt = jquantsFreeObservedAt("2026-05-14");
assert.equal(
  observedAt,
  "2026-08-06T23:59:59.999999999+09:00",
  "unknown intraday Free-plan publication time must remain unavailable through the full delayed JST day",
);
assert.equal(
  compareExplicitIso8601Instants(
    observedAt,
    "2026-08-06T23:59:59.999999998+09:00",
    "observedAt",
    "asOf",
  ),
  1,
  "the record must still be unavailable one nanosecond before the conservative end-of-day boundary",
);
assert.equal(
  compareExplicitIso8601Instants(
    observedAt,
    "2026-08-07T00:00:00+09:00",
    "observedAt",
    "asOf",
  ),
  -1,
  "the record may become available after the delayed JST day has fully elapsed",
);

console.log("jquants-free-observed-at-boundary.test.ts passed");
