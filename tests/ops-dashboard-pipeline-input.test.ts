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

for (const malformed of [
  [],
  "broken",
  { failedSteps: ["daily"] },
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

console.log("ops-dashboard pipeline input: malformed shapes fail closed OK");
