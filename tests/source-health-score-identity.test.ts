import assert from "node:assert/strict";
import { normalizeSourceHealthScoreRows } from "../src/source-health-input.js";

for (const rows of [
  [{ dataQuality: "ok" }],
  [{ code: "", dataQuality: "ok" }],
  [{ code: "   ", dataQuality: "ok" }],
  [{ code: 8136, dataQuality: "ok" }],
  [
    { code: "8136", dataQuality: "ok" },
    { code: "8136", dataQuality: "ok" },
  ],
] as const) {
  const normalized = normalizeSourceHealthScoreRows(rows);
  assert.equal(normalized.valid, false, "missing or duplicate stable score identities must not inflate source-health coverage");
  assert.deepEqual(normalized.rows, []);
}

const valid = normalizeSourceHealthScoreRows([
  { code: "8136", dataQuality: "ok" },
  { code: "7974", dataQuality: "partial" },
]);
assert.equal(valid.valid, true, "distinct non-empty score identities remain valid");

console.log("source health score identity: required and unique code contract OK");
