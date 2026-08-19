import assert from "node:assert/strict";
import { normalizeSourceHealthObject } from "../src/source-health-input.js";

for (const failedSteps of ["world_scan", ["world_scan", "daily_company_score"]] as const) {
  const result = normalizeSourceHealthObject<{ status: string; failedSteps: unknown }>({
    status: "partial_failed",
    failedSteps,
  });
  assert.equal(result.valid, true, "canonical failedSteps string/string[] must remain valid");
}

for (const failedSteps of [{}, 1, ["world_scan", 7], [""], ["   "]] as const) {
  const result = normalizeSourceHealthObject<Record<string, unknown>>({
    status: "ok",
    failedSteps,
  });
  assert.equal(result.valid, false, "malformed failedSteps must fail closed before Source Health aggregation");
  assert.equal(result.value, null, "malformed failedSteps must not be normalized as healthy pipeline input");
}

console.log("source-health-failed-steps-shape.test.ts passed");
