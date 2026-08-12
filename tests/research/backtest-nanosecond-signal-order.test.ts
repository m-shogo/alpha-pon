import assert from "node:assert/strict";
import { runBacktest, type BacktestSpec } from "../../src/research/backtest.js";

const spec: BacktestSpec = {
  schemaVersion: 1,
  id: "nanosecond-order",
  edgeId: "test-edge",
  side: "long",
  entry: { mode: "next_open" },
  exit: { mode: "holding_period", holdingPeriodDays: 1 },
  costs: { commissionBps: 0, spreadBps: 0, slippageBps: 0 },
  liquidity: { participationLimitPct: 5 },
};

const report = runBacktest(
  spec,
  [
    {
      id: "a-later",
      code: "9001",
      observedAt: "2026-08-12T09:00:00.000000002+09:00",
    },
    {
      id: "z-earlier",
      code: "9001",
      observedAt: "2026-08-12T09:00:00.000000001+09:00",
    },
  ],
  new Map(),
);

assert.deepEqual(
  report.trades.map((trade) => trade.signalId),
  ["z-earlier", "a-later"],
  "signals inside the same millisecond must remain ordered by their full nanosecond observedAt instant, not by id",
);
assert.deepEqual(
  report.skipped.map((entry) => entry.signalId),
  ["z-earlier", "a-later"],
  "skip output must preserve the same canonical PIT chronology",
);

console.log("backtest-nanosecond-signal-order: +1ns observedAt chronology preserved OK");
