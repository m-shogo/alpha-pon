import assert from "node:assert/strict";
import { calculateSameDayRelativeShockDrawdownPct } from "../src/idiosyncratic-shock-relative.js";

const stock = [
  { date: "2026-06-30", close: 100 },
  { date: "2026-07-01", close: 95 },
  { date: "2026-07-02", close: 90 },
  { date: "2026-07-03", close: 92 },
];
const benchmark = [
  { date: "2026-06-30", close: 100 },
  { date: "2026-07-01", close: 98 },
  { date: "2026-07-02", close: 97 },
  { date: "2026-07-03", close: 80 },
];

assert.equal(
  calculateSameDayRelativeShockDrawdownPct(stock, benchmark, "2026-07-01", "2026-07-03"),
  -7,
  "stock安値7/2のbenchmark -3%を使い、benchmark自身の7/3 -20%安値は使わない",
);

assert.equal(
  calculateSameDayRelativeShockDrawdownPct(
    stock,
    benchmark.filter(row => row.date !== "2026-07-02"),
    "2026-07-01",
    "2026-07-03",
  ),
  null,
  "stock shock-low日にbenchmarkが無ければfail-closed",
);

console.log("idiosyncratic-shock relative tests: OK");
