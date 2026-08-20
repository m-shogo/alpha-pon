import assert from "node:assert/strict";
import { normalizeSourceHealthObject } from "../src/source-health-input.js";

for (const input of [
  { status: "ok" },
  { status: "partial_failed" },
  { status: "running" },
  { status: "skipped_locked" },
  { status: "failed" },
  { status: "completed_with_warnings", failedSteps: " health:sources(1)" },
  { status: "completed", failedSteps: "" },
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
] as const) {
  const result = normalizeSourceHealthObject<Record<string, unknown>>(malformed);
  assert.equal(result.valid, false, "missing or non-canonical pipeline status must fail closed");
  assert.equal(result.value, null, "invalid pipeline status must not reach source-health aggregation");
}

console.log("source-health-pipeline-status.test.ts passed");
