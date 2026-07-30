import assert from "node:assert/strict";
import { normalizeTwelveDataValues } from "../src/fetcher/twelve-data.js";

const normalized = normalizeTwelveDataValues("MCD", [
  { datetime: "2026-07-02", open: "302", high: "305", low: "299", close: "300", volume: "1200" },
  { datetime: "2026-07-01", open: "310", high: "312", low: "303", close: "304", volume: "1000" },
  { datetime: "2026-07-03", open: "0", high: "0", low: "0", close: "bad", volume: "0" },
]);

assert.equal(normalized.length, 2, "無効closeは除外");
assert.deepEqual(normalized.map(row => row.Date), ["2026-07-01", "2026-07-02"], "日付昇順へ正規化");
assert.equal(normalized[0].Symbol, "MCD");
assert.equal(normalized[0].AdjustmentClose, 304);
assert.equal(normalized[1].Volume, 1200);

console.log("idiosyncratic-shock overseas provider tests: OK");
