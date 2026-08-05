import assert from "node:assert/strict";
import { findFirstEligibleShockSignal } from "../src/idiosyncratic-shock-entry-signal.js";
import type { PriceObservation } from "../src/idiosyncratic-shock.js";

const stock: PriceObservation[] = [
  { date: "2026-01-02", close: 100 },
  { date: "2026-01-05", close: 94 },
  { date: "2026-01-06", close: 89 },
  { date: "2026-01-07", close: 86 },
  { date: "2026-01-08", close: 87 },
  { date: "2026-01-09", close: 88 },
  { date: "2026-01-12", close: 89 },
  { date: "2026-01-13", close: 90 },
  { date: "2026-01-14", close: 91 },
];
const benchmark: PriceObservation[] = [
  { date: "2026-01-02", close: 100 },
  { date: "2026-01-05", close: 99 },
  { date: "2026-01-06", close: 99 },
  { date: "2026-01-07", close: 98 },
  { date: "2026-01-08", close: 98 },
  { date: "2026-01-09", close: 99 },
  { date: "2026-01-12", close: 99 },
  { date: "2026-01-13", close: 100 },
  { date: "2026-01-14", close: 100 },
];

const signal = findFirstEligibleShockSignal({
  stock,
  benchmark,
  reactionStartDate: "2026-01-05",
  decisionCheckpoint: "2026-01-06",
});
assert(signal);
assert.equal(signal.signalDate, "2026-01-09", "future reboundを見ず、当日時点の5-session stateで最初のeligible日を選ぶ");
assert.equal(signal.signalPrice, 88);
assert.equal(signal.priceState, "stabilized_after_drop");
assert(signal.shockDrawdownPct <= -5);
assert(signal.relativeShockDrawdownPct <= -3);

const lateInformation = findFirstEligibleShockSignal({
  stock,
  benchmark,
  reactionStartDate: "2026-01-05",
  decisionCheckpoint: "2026-01-12",
});
assert(lateInformation);
assert.equal(lateInformation.signalDate, "2026-01-12", "調査完了前の日へsignalを遡及させない");

const noCompanySpecificShock = findFirstEligibleShockSignal({
  stock,
  benchmark: stock.map(row => ({ ...row })),
  reactionStartDate: "2026-01-05",
  decisionCheckpoint: "2026-01-06",
});
assert.equal(noCompanySpecificShock, null, "市場と同程度の下落は企業固有signalにしない");

const stillFalling: PriceObservation[] = [
  { date: "2026-01-02", close: 100 },
  { date: "2026-01-05", close: 95 },
  { date: "2026-01-06", close: 90 },
  { date: "2026-01-07", close: 85 },
  { date: "2026-01-08", close: 80 },
  { date: "2026-01-09", close: 75 },
];
const noBottom = findFirstEligibleShockSignal({
  stock: stillFalling,
  benchmark: benchmark.slice(0, 6),
  reactionStartDate: "2026-01-05",
  decisionCheckpoint: "2026-01-05",
});
assert.equal(noBottom, null, "急落途中ではsignalを出さない");

console.log("idiosyncratic-shock entry signal tests: OK");
