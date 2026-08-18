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
assert.equal(valid.entries.length, 1);
assert.deepEqual(valid.invalidRows, []);

const mixed = parsePeriodicScoreLog(JSON.stringify([
  {
    code: "8136",
    name: "sample",
    score: 60,
    alertLevel: "daily",
    createdAt: "2026-08-18",
    warnings: ["ok"],
  },
  {
    code: "4661",
    name: "broken",
    score: 40,
    alertLevel: "daily",
    createdAt: "2026-08-18",
    warnings: {},
  },
]));
assert.ok(mixed);
assert.equal(mixed.entries.length, 1, "正常rowは壊れrowの周囲でも保持する");
assert.deepEqual(mixed.invalidRows, [2], "壊れrowはsilent dropせず行番号を保持する");

assert.equal(parsePeriodicScoreLog("{broken"), null);
assert.equal(parsePeriodicScoreLog(JSON.stringify({ code: "8136" })), null);
assert.equal(parsePeriodicScoreLog("null"), null);

console.log("periodic-review-score-input tests passed");
