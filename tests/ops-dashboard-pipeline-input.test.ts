import assert from "node:assert/strict";
import { normalizeOpsPipelineStatusInput } from "../src/ops-dashboard-pipeline-input.js";

const valid = normalizeOpsPipelineStatusInput({
  date: "2026-08-17",
  status: "completed",
  failedSteps: "",
  steps: [{ name: "daily", status: "ok" }],
});
assert.deepEqual(valid, {
  date: "2026-08-17",
  status: "completed",
  failedSteps: "",
  steps: [{ name: "daily", status: "ok" }],
});

const canonicalArray = normalizeOpsPipelineStatusInput({
  date: "2026-08-17",
  status: "partial_failed",
  failedSteps: ["daily_company_score", "ui_data_generate"],
});
assert.deepEqual(canonicalArray, {
  date: "2026-08-17",
  status: "partial_failed",
  failedSteps: "daily_company_score,ui_data_generate",
});

const canonicalEmptyArray = normalizeOpsPipelineStatusInput({
  date: "2026-08-17",
  status: "ok",
  failedSteps: [],
});
assert.deepEqual(canonicalEmptyArray, {
  date: "2026-08-17",
  status: "ok",
  failedSteps: "",
});

for (const malformed of [
  [],
  "broken",
  { failedSteps: [123] },
  { failedSteps: ["   "] },
  { steps: "daily" },
  { steps: [null] },
  { steps: [{ name: 123, status: "ok" }] },
  { steps: [{ name: "daily", status: { value: "ok" } }] },
]) {
  assert.deepEqual(
    normalizeOpsPipelineStatusInput(malformed),
    { status: "failed", failedSteps: "invalid_pipeline_status_input", steps: [] },
    "malformed pipeline input must fail closed instead of crashing the ops dashboard",
  );
}

assert.equal(normalizeOpsPipelineStatusInput(null), null, "missing input remains distinguishable from malformed input");

console.log("ops-dashboard pipeline input: canonical failed-step shapes normalize and malformed shapes fail closed OK");
