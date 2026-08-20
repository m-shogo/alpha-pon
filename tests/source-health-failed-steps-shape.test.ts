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

for (const malformed of [
  { status: "completed_with_warnings", failedSteps: "" },
  { status: "completed_with_warnings", failedSteps: "   " },
  { status: "completed_with_warnings", failedSteps: [], completeWrapperFailedSteps: [] },
  { status: "completed", failedSteps: " daily(1)" },
  { status: "completed", completeWrapperFailedSteps: ["stock-pro-agent(1)"] },
  { status: "completed", steps: [{ name: "health:sources", status: "failed" }] },
  { status: "completed", results: [{ name: "health:sources", status: "fail" }] },
] as const) {
  const result = normalizeSourceHealthObject<Record<string, unknown>>(malformed);
  assert.equal(result.valid, false, "completed pipeline status must agree with concrete failure evidence");
  assert.equal(result.value, null, "contradictory pipeline status must fail closed before Source Health reporting");
}

for (const valid of [
  { status: "completed", failedSteps: "", completeWrapperFailedSteps: [] },
  { status: "completed_with_warnings", failedSteps: " health:sources(1)" },
  { status: "completed_with_warnings", failedSteps: "", completeWrapperFailedSteps: ["stock-pro-agent(1)"] },
] as const) {
  const result = normalizeSourceHealthObject<Record<string, unknown>>(valid);
  assert.equal(result.valid, true, "canonical completed status/failure evidence combinations remain valid");
}

console.log("source-health-failed-steps-shape.test.ts passed");
