import assert from "node:assert/strict";
import { buildUniquePriceSeriesMap } from "../../src/research/backtest-bundle-input.js";
import type { PriceSeries } from "../../src/research/backtest.js";

const first: PriceSeries = {
  code: "9001",
  bars: [{ date: "2024-01-04", open: 1000, high: 1010, low: 990, close: 1000, volume: 1_000_000 }],
};
const conflicting: PriceSeries = {
  code: "9001",
  bars: [{ date: "2024-01-04", open: 2000, high: 2010, low: 1990, close: 2000, volume: 1_000_000 }],
};

assert.throws(
  () => buildUniquePriceSeriesMap([first, conflicting]),
  /backtest price series code 9001 must be unique/,
  "duplicate price-series identities must fail closed instead of silently using the last input row",
);

const unique = buildUniquePriceSeriesMap([first]);
assert.equal(unique.get("9001"), first);

console.log("research/backtest price series identity: duplicate codes rejected OK");
