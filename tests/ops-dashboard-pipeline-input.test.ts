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

const partialFailedStepEvidence = normalizeOpsPipelineStatusInput({
  date: "2026-08-17",
  status: "partial_failed",
  failedSteps: "",
  steps: [{ name: "daily_company_score", status: "failed" }],
});
assert.deepEqual(partialFailedStepEvidence, {
  date: "2026-08-17",
  status: "partial_failed",
  failedSteps: "",
  steps: [{ name: "daily_company_score", status: "failed" }],
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

for (const status of ["running", "skipped_locked", "failed", "completed_with_warnings"]) {
  assert.equal(
    normalizeOpsPipelineStatusInput({ status, failedSteps: "" })?.status,
    status,
    `legacy producer status ${status} remains accepted`,
  );
}

for (const malformed of [
  [],
  "broken",
  {},
  { status: "green", failedSteps: "" },
  { status: 200, failedSteps: "" },
  { date: "2026-02-31", status: "completed", failedSteps: "" },
  { date: "0000-01-01", status: "completed", failedSteps: "" },
  { date: "2026-08-17junk", status: "completed", failedSteps: "" },
  { date: "2026-08-17T00:00:00+09:00", status: "completed", failedSteps: "" },
  { status: "completed", failedSteps: [123] },
  { status: "completed", failedSteps: ["   "] },
  { status: "completed", steps: "daily" },
  { status: "completed", steps: [null] },
  { status: "completed", steps: [{ name: 123, status: "ok" }] },
  { status: "completed", steps: [{ name: "daily", status: { value: "ok" } }] },
  { status: "partial_failed", failedSteps: "", steps: [] },
  { status: "partial_failed", failedSteps: [], steps: [{ name: "daily", status: "ok" }] },
]) {
  assert.deepEqual(
    normalizeOpsPipelineStatusInput(malformed),
    { status: "failed", failedSteps: "invalid_pipeline_status_input", steps: [] },
    "malformed pipeline input must fail closed instead of crashing or false-greening the ops dashboard",
  );
}

assert.equal(normalizeOpsPipelineStatusInput(null), null, "missing input remains distinguishable from malformed input");

console.log("ops-dashboard pipeline input: producer statuses, dates, failed-step evidence, and shapes normalize while malformed inputs fail closed OK");
