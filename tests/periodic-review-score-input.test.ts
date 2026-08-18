import assert from "node:assert/strict";
import { parsePeriodicScoreLog } from "../src/periodic-review-score-input.js";

const valid = parsePeriodicScoreLog(JSON.stringify([
  {
    code: "8136",
    name: "sample",
    score: 60,
    alertLevel: "daily",
    createdAt: "2026-08-18",
  },
]));
assert.ok(valid);
assert.equal(valid.length, 1);

assert.equal(parsePeriodicScoreLog("{broken"), null);
assert.equal(parsePeriodicScoreLog(JSON.stringify({ code: "8136" })), null);
assert.equal(parsePeriodicScoreLog("null"), null);

console.log("periodic-review-score-input tests passed");
