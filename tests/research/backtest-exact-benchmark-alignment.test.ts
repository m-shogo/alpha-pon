import assert from "node:assert/strict";
import { runBacktest, type BacktestSpec, type PriceSeries } from "../../src/research/backtest.js";

function priceSeries(code: string, dates: string[], closes: number[]): PriceSeries {
  return {
    code,
    bars: dates.map((date, index) => {
      const close = closes[index]!;
      const open = index === 0 ? close : closes[index - 1]!;
      return {
        date,
        open,
        high: Math.max(open, close) + 10,
        low: Math.min(open, close) - 10,
        close,
        volume: 1_000_000,
      };
    }),
  };
}

const ISSUER_DATES = ["2024-01-04", "2024-01-05", "2024-01-09", "2024-01-10", "2024-01-11"];
const ISSUER = priceSeries("9001", ISSUER_DATES, [1000, 1010, 1020, 1030, 1040]);
const SPEC: BacktestSpec = {
  schemaVersion: 1,
  id: "benchmark-exact-date-test",
  edgeId: "benchmark-exact-date-test",
  side: "long",
  entry: { mode: "next_open" },
  exit: { mode: "holding_period", holdingPeriodDays: 2 },
  costs: { commissionBps: 0, spreadBps: 0, slippageBps: 0 },
  liquidity: { participationLimitPct: 5 },
  benchmark: "TOPIX",
};
const SIGNAL = [{ id: "s1", code: "9001", observedAt: "2024-01-04T16:00:00+09:00" }];
const PRICES = new Map([[ISSUER.code, ISSUER]]);

function testExactBenchmarkDatesExecute() {
  const benchmark = priceSeries("TOPIX", ISSUER_DATES, [2000, 2005, 2010, 2015, 2020]);
  const report = runBacktest(SPEC, SIGNAL, PRICES, benchmark);

  assert.equal(report.executedCount, 1);
  assert.equal(report.trades[0]?.entryDate, "2024-01-05");
  assert.equal(report.trades[0]?.exitDate, "2024-01-10");
  assert.equal(typeof report.trades[0]?.benchmarkReturnBps, "number");
}

function testMissingBenchmarkEntryDoesNotForwardSubstitute() {
  const benchmark = priceSeries(
    "TOPIX",
    ["2024-01-04", "2024-01-09", "2024-01-10", "2024-01-11"],
    [2000, 2010, 2015, 2020],
  );
  const report = runBacktest(SPEC, SIGNAL, PRICES, benchmark);

  assert.equal(report.executedCount, 0);
  assert.equal(report.trades[0]?.skipReason, "benchmark_missing_entry_bar");
}

function testMissingBenchmarkExitDoesNotForwardSubstitute() {
  const benchmark = priceSeries(
    "TOPIX",
    ["2024-01-04", "2024-01-05", "2024-01-09", "2024-01-11"],
    [2000, 2005, 2010, 2020],
  );
  const report = runBacktest(SPEC, SIGNAL, PRICES, benchmark);

  assert.equal(report.executedCount, 0);
  assert.equal(report.trades[0]?.skipReason, "benchmark_missing_exit_bar");
}

testExactBenchmarkDatesExecute();
testMissingBenchmarkEntryDoesNotForwardSubstitute();
testMissingBenchmarkExitDoesNotForwardSubstitute();
console.log("backtest-exact-benchmark-alignment.test.ts passed");
