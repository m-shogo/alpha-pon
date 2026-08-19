import assert from "node:assert/strict";
import { normalizeSourceHealthObject } from "../src/source-health-input.js";

const valid = normalizeSourceHealthObject({
  status: "ok",
  results: [
    { name: "world_scan", status: "ok" },
    { name: "daily_company_score", status: "skip" },
    { name: "review_due_predictions", status: "fail" },
  ],
});
assert.equal(valid.valid, true, "canonical run-daily result rows must remain valid");

for (const row of [
  {},
  { name: "", status: "ok" },
  { name: "   ", status: "ok" },
  { name: "world_scan" },
  { name: "world_scan", status: "success" },
  { name: 7, status: "fail" },
] as const) {
  const result = normalizeSourceHealthObject({ status: "ok", results: [row] });
  assert.equal(result.valid, false, "malformed result rows must fail closed before Source Health aggregation");
  assert.equal(result.value, null, "invalid result rows must not disappear into a healthy-looking report");
}

console.log("source-health-result-row-contract.test.ts passed");
