import assert from "node:assert/strict";
import { collectPipelineFailedStepNames, parseRunDailyFailedSteps } from "../src/pipeline-failed-steps.js";
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
  { status: "completed", steps: [{ name: "health:sources", status: "failed" }] },
  { status: "completed", results: [{ name: "health:sources", status: "fail" }] },
  { status: "running", steps: [{ name: " health:sources", status: "ok" }] },
  { status: "running", results: [{ name: "health:sources ", status: "ok" }] },
  { status: "completed", completeWrapperFailedSteps: [" stock-pro-agent(1)"] },
] as const) {
  const result = normalizeSourceHealthObject<Record<string, unknown>>(malformed);
  assert.equal(result.valid, false, "run-daily completion status and canonical step identities must agree with producer evidence");
  assert.equal(result.value, null, "contradictory or ambiguous pipeline evidence must fail closed before Source Health reporting");
}

for (const valid of [
  { status: "completed", failedSteps: "", completeWrapperFailedSteps: [] },
  { status: "completed", failedSteps: "", completeWrapperFailedSteps: ["stock-pro-agent(1)"] },
  { status: "completed_with_warnings", failedSteps: " health:sources(1)" },
] as const) {
  const result = normalizeSourceHealthObject<Record<string, unknown>>(valid);
  assert.equal(result.valid, true, "canonical run-daily and complete-wrapper status combinations remain valid");
}

assert.deepEqual(
  parseRunDailyFailedSteps(" health:sources(1) proposals(2) memory:companies(3)"),
  ["health:sources(1)", "proposals(2)", "memory:companies(3)"],
  "run-daily writes failedSteps as whitespace-delimited tokens and each failed step must remain independently actionable",
);
assert.deepEqual(
  collectPipelineFailedStepNames({
    failedSteps: " health:sources(1) proposals(2)",
    steps: [{ name: "health:sources", status: "failed" }],
    completeWrapperFailedSteps: ["stock-pro-agent(4)"],
  }),
  ["health:sources(1)", "proposals(2)", "health:sources", "stock-pro-agent(4)"],
  "Source Health must preserve producer failure tokens while combining step and complete-wrapper evidence",
);

console.log("source-health-failed-steps-shape.test.ts passed");
