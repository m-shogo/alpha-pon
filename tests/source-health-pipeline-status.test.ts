import assert from "node:assert/strict";
import { normalizeSourceHealthObject } from "../src/source-health-input.js";

for (const input of [
  { status: "ok" },
  { status: "partial_failed", failedSteps: ["daily_company_score"] },
  { status: "running" },
  { status: "skipped_locked" },
  { status: "failed" },
  { status: "completed_with_warnings", failedSteps: " health:sources(1)" },
  { status: "completed", failedSteps: "" },
  { status: "completed", failedSteps: "", steps: [{ name: "daily", status: "ok" }] },
  { status: "running", steps: [{ name: "review:weekly", status: "skipped" }] },
] as const) {
  const result = normalizeSourceHealthObject<{ status: string }>(input);
  assert.equal(result.valid, true, `canonical pipeline status ${input.status} must remain valid`);
  assert.equal(result.value?.status, input.status);
}

for (const malformed of [
  {},
  { status: "" },
  { status: "success" },
  { status: "unknown" },
  { status: 1 },
  { status: "completed", failedSteps: "", steps: [{ name: "daily", status: "healthy" }] },
  { status: "running", steps: [{ name: "daily", status: "fail" }] },
  { status: "ok", failedSteps: ["daily_company_score"] },
  { status: "ok", results: [{ name: "daily_company_score", status: "fail" }] },
  { status: "partial_failed", failedSteps: [] },
  { status: "partial_failed", results: [{ name: "daily_company_score", status: "ok" }] },
] as const) {
  const result = normalizeSourceHealthObject<Record<string, unknown>>(malformed);
  assert.equal(result.valid, false, "missing or inconsistent pipeline status must fail closed");
  assert.equal(result.value, null, "invalid pipeline status must not reach source-health aggregation");
}

console.log("source-health-pipeline-status.test.ts passed");
