import assert from "node:assert/strict";
import type { DailyQuote } from "../../src/fetcher/jquants.js";
import { JQuantsFreePriceProvider } from "../../src/research/providers/jquants-free.js";

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

let resolverCalls = 0;
const provider = new JQuantsFreePriceProvider({
  fetchQuotes: async () => [quote],
  now: () => new Date("2026-05-14T15:00:00.000Z"),
  delayDays: 0,
  resolveFirstExecutableAt: () => {
    resolverCalls += 1;
    return "2026-05-14T15:00:00Z";
  },
});

const beforeObserved = await provider.fetchDaily({
  seriesKind: "security",
  codes: ["8136"],
  from: "2026-05-14",
  to: "2026-05-14",
  // observedAt is 2026-05-14T23:59:59+09:00 = 14:59:59Z.
  // Exactly 1ns before the boundary must remain unavailable.
  asOf: "2026-05-14T14:59:58.999999999Z",
});
assert.equal(beforeObserved.records.length, 0);
assert.equal(resolverCalls, 0);

const atObserved = await provider.fetchDaily({
  seriesKind: "security",
  codes: ["8136"],
  from: "2026-05-14",
  to: "2026-05-14",
  asOf: "2026-05-14T23:59:59+09:00",
});
assert.equal(atObserved.records.length, 1);
assert.equal(resolverCalls, 1);

console.log("jquants-free-asof-ns-boundary.test.ts passed");
