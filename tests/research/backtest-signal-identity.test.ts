import assert from "node:assert/strict";
import { runBacktest, type BacktestSpec, type PriceSeries } from "../../src/research/backtest.js";

const spec: BacktestSpec = {
  schemaVersion: 1,
  id: "signal-identity-regression",
  edgeId: "edge-signal-identity",
  side: "long",
  entry: { mode: "next_open" },
  exit: { mode: "holding_period", holdingPeriodDays: 1 },
  costs: { commissionBps: 0, spreadBps: 0, slippageBps: 0 },
  liquidity: { participationLimitPct: 5 },
};

const priceSeries: PriceSeries = {
  code: "9001",
  bars: [
    { date: "2024-01-04", open: 1000, high: 1010, low: 990, close: 1000, volume: 1_000_000 },
    { date: "2024-01-05", open: 1000, high: 1020, low: 990, close: 1010, volume: 1_000_000 },
    { date: "2024-01-09", open: 1010, high: 1030, low: 1000, close: 1020, volume: 1_000_000 },
  ],
};

const duplicateSignals = [
  { id: "same-signal", code: "9001", observedAt: "2024-01-04T16:00:00+09:00" },
  { id: "same-signal", code: "9001", observedAt: "2024-01-04T16:01:00+09:00" },
];

assert.throws(
  () => runBacktest(spec, duplicateSignals, new Map([["9001", priceSeries]])),
  /backtest signal id same-signal must be unique/,
  "duplicate signal identities must fail closed instead of double-counting trades and aggregate stats",
);

console.log("research/backtest signal identity: duplicate IDs rejected OK");
