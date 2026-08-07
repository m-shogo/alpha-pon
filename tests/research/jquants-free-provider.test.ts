import assert from "node:assert/strict";
import type { DailyQuote } from "../../src/fetcher/jquants.js";
import {
  JQUANTS_FREE_DELAY_DAYS,
  JQUANTS_FREE_ENTITLEMENT,
  JQuantsFreePriceProvider,
  jquantsFreeCapabilities,
  jquantsFreeObservedAt,
  jquantsTradingDayCloseJst,
  mapJQuantsFreeQuote,
} from "../../src/research/providers/jquants-free.js";
import { validateProviderBatch } from "../../src/research/price-store.js";

const tradedQuote: DailyQuote = {
  Code: "81360",
  Date: "20260514",
  Open: 7200,
  High: 7350,
  Low: 7150,
  Close: 7300,
  Volume: 1_234_500,
  AdjustmentFactor: 0.5,
  AdjustmentClose: 3650,
  AdjustmentVolume: 2_469_000,
};

{
  assert.equal(JQUANTS_FREE_DELAY_DAYS, 84);
  assert.equal(JQUANTS_FREE_ENTITLEMENT.delayWeeks, 12);
  assert.equal(JQUANTS_FREE_ENTITLEMENT.historyWindowYears, 2);
  assert.equal(JQUANTS_FREE_ENTITLEMENT.topix, false);
  assert.equal(JQUANTS_FREE_ENTITLEMENT.indices, false);
  assert.equal(JQUANTS_FREE_ENTITLEMENT.redistributionAllowed, false);
  assert.deepEqual(jquantsFreeCapabilities(), {
    plan: "free",
    delayDays: 84,
    supportsAdjusted: false,
    supportsUnadjusted: true,
    supportsCorporateActions: false,
    supportsBenchmarks: false,
    supportsSectorBenchmarks: false,
  });
  console.log("jquants-free-provider: Free entitlement boundary OK");
}

{
  assert.equal(jquantsTradingDayCloseJst("2024-11-01"), "2024-11-01T15:00:00+09:00");
  assert.equal(jquantsTradingDayCloseJst("2024-11-05"), "2024-11-05T15:30:00+09:00");
  assert.equal(jquantsFreeObservedAt("2026-05-14"), "2026-08-06T23:59:59+09:00");
  console.log("jquants-free-provider: TSE close and 12-week PIT boundary OK");
}

{
  assert.equal(jquantsTradingDayCloseJst("2024-02-29"), "2024-02-29T15:00:00+09:00");
  assert.throws(() => jquantsTradingDayCloseJst("2024-02-31"), /invalid J-Quants trading date/);
  assert.throws(() => jquantsFreeObservedAt("2023-02-29"), /invalid J-Quants trading date/);
  assert.throws(() => jquantsFreeObservedAt("2026-13-01"), /invalid J-Quants trading date/);
  assert.throws(() => jquantsFreeObservedAt("2026-00-10"), /invalid J-Quants trading date/);
  console.log("jquants-free-provider: impossible Gregorian calendar dates fail closed OK");
}

{
  const record = mapJQuantsFreeQuote({
    requestedCode: "8136",
    quote: tradedQuote,
    retrievedAt: "2026-08-07T02:30:00.000Z",
    firstExecutableAt: "2026-08-07T12:00:00+09:00",
    ingestionRunId: "fixture-run-1",
  });
  assert.equal(record.code, "8136");
  assert.equal(record.tradingDate, "2026-05-14");
  assert.equal(record.dataAsOf, "2026-05-14T15:30:00+09:00");
  assert.equal(record.observedAt, "2026-08-06T23:59:59+09:00");
  assert.equal(record.status, "traded");
  assert.deepEqual(record.ohlcv, {
    open: 7200,
    high: 7350,
    low: 7150,
    close: 7300,
    volume: 1_234_500,
  });
  assert.equal(record.adjusted, false);
  assert.equal(record.adjustmentFactor, 1);
  assert.equal(record.license, "local_only");
  assert.equal(record.providerPlan, "free");
  assert.equal(record.delayDays, 84);
  assert.equal(record.isDelayed, true);
  assert.deepEqual(record.corporateActions, []);
  console.log("jquants-free-provider: raw OHLC mapping stays PIT-safe OK");
}

{
  const missing = mapJQuantsFreeQuote({
    requestedCode: "8136",
    quote: { ...tradedQuote, Open: 0, High: 0, Low: 0, Close: 0, Volume: 0 },
    retrievedAt: "2026-08-07T02:30:00.000Z",
    firstExecutableAt: "2026-08-07T12:00:00+09:00",
    ingestionRunId: "fixture-run-2",
  });
  assert.equal(missing.status, "missing");
  assert.equal(missing.missingReason, "unknown");
  assert.equal(missing.ohlcv, undefined);
  console.log("jquants-free-provider: unknown missing pattern is not fabricated OK");
}

{
  assert.throws(() => mapJQuantsFreeQuote({
    requestedCode: "8136",
    quote: { ...tradedQuote, Code: "72030" },
    retrievedAt: "2026-08-07T02:30:00.000Z",
    firstExecutableAt: "2026-08-07T12:00:00+09:00",
    ingestionRunId: "fixture-run-3",
  }), /quote code mismatch/);
  assert.throws(() => mapJQuantsFreeQuote({
    requestedCode: "8136",
    quote: tradedQuote,
    retrievedAt: "2026-08-06T00:00:00.000Z",
    firstExecutableAt: "2026-08-07T12:00:00+09:00",
    ingestionRunId: "fixture-run-4",
  }), /retrievedAt must be at or after/);
  assert.throws(() => mapJQuantsFreeQuote({
    requestedCode: "8136",
    quote: { ...tradedQuote, Date: "20260230" },
    retrievedAt: "2026-08-07T02:30:00.000Z",
    firstExecutableAt: "2026-08-07T12:00:00+09:00",
    ingestionRunId: "fixture-run-invalid-date",
  }), /invalid J-Quants trading date/);
  assert.throws(() => mapJQuantsFreeQuote({
    requestedCode: "8136",
    quote: tradedQuote,
    retrievedAt: "2026-08-07T02:30:00.000Z",
    firstExecutableAt: "2026-08-07T11:00:00+09:00",
    ingestionRunId: "fixture-run-execution-before-retrieval",
  }), /firstExecutableAt must be at or after retrievedAt/);
  console.log("jquants-free-provider: source-code, calendar-date and PIT timestamp boundaries fail closed OK");
}

{
  const provider = new JQuantsFreePriceProvider({
    fetchQuotes: async () => [tradedQuote],
    now: () => new Date("2026-08-07T02:30:00.000Z"),
    resolveFirstExecutableAt: () => "2026-08-07T12:00:00+09:00",
  });
  const batch = await provider.fetchDaily({
    seriesKind: "security",
    codes: ["8136"],
    from: "2026-05-14",
    to: "2026-05-14",
    asOf: "2026-08-07T02:30:00.000Z",
    plan: "free",
  });
  assert.equal(batch.providerId, "jquants-free");
  assert.equal(batch.records.length, 1);
  assert.deepEqual(validateProviderBatch(batch), []);
  await assert.rejects(() => provider.fetchDaily({
    seriesKind: "benchmark",
    codes: ["TOPIX"],
    from: "2026-05-14",
    to: "2026-05-14",
    asOf: "2026-08-07T02:30:00.000Z",
  }), /does not provide benchmark/);
  await assert.rejects(() => provider.fetchDaily({
    seriesKind: "security",
    codes: ["8136", "7203"],
    from: "2026-05-14",
    to: "2026-05-14",
    asOf: "2026-08-07T02:30:00.000Z",
  }), /exactly one security code/);
  console.log("jquants-free-provider: provider batch contract and unsupported surfaces OK");
}

{
  let fetchCalls = 0;
  let lastRange: [string, string] | null = null;
  const provider = new JQuantsFreePriceProvider({
    fetchQuotes: async (_code, from, to) => {
      fetchCalls += 1;
      lastRange = [from, to];
      return [];
    },
    now: () => new Date("2026-08-07T02:30:00.000Z"),
    resolveFirstExecutableAt: () => "2026-08-07T12:00:00+09:00",
  });

  await assert.rejects(() => provider.fetchDaily({
    seriesKind: "security",
    codes: ["8136"],
    from: "2026-02-31",
    to: "2026-03-01",
    asOf: "2026-08-07T02:30:00.000Z",
  }), /invalid J-Quants trading date/);
  assert.equal(fetchCalls, 0);

  await assert.rejects(() => provider.fetchDaily({
    seriesKind: "security",
    codes: ["8136"],
    from: "2026-05-15",
    to: "2026-05-14",
    asOf: "2026-08-07T02:30:00.000Z",
  }), /invalid J-Quants query range/);
  assert.equal(fetchCalls, 0);

  await provider.fetchDaily({
    seriesKind: "security",
    codes: ["8136"],
    from: "20260514",
    to: "20260514",
    asOf: "2026-08-07T02:30:00.000Z",
  });
  assert.equal(fetchCalls, 1);
  assert.deepEqual(lastRange, ["2026-05-14", "2026-05-14"]);
  console.log("jquants-free-provider: query calendar/range validation happens before fetch and canonicalizes dates OK");
}

console.log("jquants-free-provider.test.ts passed");
