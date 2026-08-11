import assert from "node:assert/strict";
import type { DailyQuote } from "../../src/fetcher/jquants.js";
import { mapJQuantsFreeQuote } from "../../src/research/providers/jquants-free.js";

const quote: DailyQuote = {
  Code: "81360",
  Date: "20260514",
  Open: 7200,
  High: 7350,
  Low: 7150,
  Close: 7300,
  Volume: 1_234_500,
  AdjustmentFactor: 1,
  AdjustmentClose: 7300,
  AdjustmentVolume: 1_234_500,
};

assert.throws(() => mapJQuantsFreeQuote({
  requestedCode: "8136",
  quote,
  delayDays: 0,
  // observedAt is 2026-05-14T23:59:59+09:00 (14:59:59Z).
  // This value is exactly 1ns earlier and must not collapse to the same millisecond.
  retrievedAt: "2026-05-14T14:59:58.999999999Z",
  firstExecutableAt: "2026-05-14T15:00:00Z",
  ingestionRunId: "fixture-ns-before-observed",
}), /retrievedAt must be at or after/);

const exactBoundary = mapJQuantsFreeQuote({
  requestedCode: "8136",
  quote,
  delayDays: 0,
  retrievedAt: "2026-05-14T14:59:59.000000000Z",
  firstExecutableAt: "2026-05-14T23:59:59+09:00",
  ingestionRunId: "fixture-exact-observed-boundary",
});
assert.equal(exactBoundary.observedAt, "2026-05-14T23:59:59+09:00");

console.log("jquants-free-retrieved-ns-order.test.ts passed");
