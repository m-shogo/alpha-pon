import assert from "node:assert/strict";
import { normalizeSourceHealthObject } from "../src/source-health-input.js";

const valid = normalizeSourceHealthObject({
  status: "completed",
  steps: [
    { name: "world_scan", status: "ok" },
    { name: "review_due_predictions", status: "skipped" },
    { name: "daily_company_score", status: "failed" },
  ],
});
assert.equal(valid.valid, true, "well-formed step rows with explicit status remain valid");

for (const row of [
  {},
  { name: "", status: "ok" },
  { name: "   ", status: "ok" },
  { name: "world_scan" },
  { name: "world_scan", status: "" },
  { name: 7, status: "failed" },
  { name: "world_scan", status: 7 },
] as const) {
  const result = normalizeSourceHealthObject({ status: "completed", steps: [row] });
  assert.equal(result.valid, false, "malformed step rows must fail closed before Source Health aggregation");
  assert.equal(result.value, null, "invalid step rows must not disappear from failure visibility");
}

console.log("source-health-step-row-contract.test.ts passed");
