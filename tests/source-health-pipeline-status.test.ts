import assert from "node:assert/strict";
import { normalizeSourceHealthObject } from "../src/source-health-input.js";

for (const status of [
  "ok",
  "partial_failed",
  "running",
  "skipped_locked",
  "failed",
  "completed_with_warnings",
  "completed",
] as const) {
  const result = normalizeSourceHealthObject<{ status: string }>({ status });
  assert.equal(result.valid, true, `canonical pipeline status ${status} must remain valid`);
  assert.equal(result.value?.status, status);
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
