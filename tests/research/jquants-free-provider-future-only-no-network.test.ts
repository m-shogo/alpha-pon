import assert from "node:assert/strict";
import type { DailyQuote } from "../../src/fetcher/jquants.js";
import {
  JQuantsFreePriceProvider,
  jquantsFreeObservedAt,
} from "../../src/research/providers/jquants-free.js";

const quote: DailyQuote = {
  Code: "81360",
  Date: "20260515",
  Open: 7200,
  High: 7350,
  Low: 7150,
  Close: 7300,
  Volume: 1_234_500,
  AdjustmentFactor: 1,
  AdjustmentClose: 7300,
  AdjustmentVolume: 1_234_500,
};

{
  let fetchCalls = 0;
  let resolverCalls = 0;
  const provider = new JQuantsFreePriceProvider({
    fetchQuotes: async () => {
      fetchCalls += 1;
      return [quote];
    },
    now: () => new Date("2026-08-07T15:00:01.000Z"),
    resolveFirstExecutableAt: () => {
      resolverCalls += 1;
      return "2026-08-08T00:01:00+09:00";
    },
  });
  const observedAt = jquantsFreeObservedAt("2026-05-15");
  assert.equal(observedAt, "2026-08-07T23:59:59+09:00");
  const batch = await provider.fetchDaily({
    seriesKind: "security",
    codes: ["8136"],
    from: "2026-05-15",
    to: "2026-05-15",
    asOf: "2026-08-07T14:59:58.000Z",
    plan: "free",
  });
  assert.equal(batch.records.length, 0);
  assert.equal(fetchCalls, 0, "future-only snapshot must not call J-Quants network");
  assert.equal(resolverCalls, 0, "future-only snapshot must not resolve execution time");
  console.log("jquants-free-provider-future-only-no-network: future-only snapshot uses zero network OK");
}

{
  let fetchCalls = 0;
  const provider = new JQuantsFreePriceProvider({
    fetchQuotes: async () => {
      fetchCalls += 1;
      return [quote];
    },
    now: () => new Date("2026-08-07T15:00:01.000Z"),
    resolveFirstExecutableAt: () => "2026-08-08T00:01:00+09:00",
  });
  const batch = await provider.fetchDaily({
    seriesKind: "security",
    codes: ["8136"],
    from: "2026-05-15",
    to: "2026-05-15",
    asOf: "2026-08-07T23:59:59+09:00",
    plan: "free",
  });
  assert.equal(fetchCalls, 1, "row observable exactly at cutoff remains eligible for fetch");
  assert.equal(batch.records.length, 1);
  assert.equal(batch.records[0]?.tradingDate, "2026-05-15");
  console.log("jquants-free-provider-future-only-no-network: exact observation boundary remains fetchable OK");
}

console.log("jquants-free-provider-future-only-no-network.test.ts passed");
