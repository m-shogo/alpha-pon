import assert from "node:assert/strict";
import { isGeneratedPipelineStatusInput } from "../apps/web/lib/generated-array-input.js";

assert.equal(
  isGeneratedPipelineStatusInput({ date: "2026-08-25", status: "ok", failedSteps: [] }),
  true,
  "current canonical pipeline date must remain valid",
);
assert.equal(
  isGeneratedPipelineStatusInput({ date: "2026-02-31", status: "ok", failedSteps: [] }),
  false,
  "nonexistent pipeline date must not become current healthy evidence",
);
assert.equal(
  isGeneratedPipelineStatusInput({ date: "0000-01-01", status: "ok", failedSteps: [] }),
  false,
  "Gregorian year zero must not become pipeline provenance",
);
assert.equal(
  isGeneratedPipelineStatusInput({ date: "2999-01-01", status: "ok", failedSteps: [] }),
  false,
  "future pipeline date must not become current healthy evidence",
);
assert.equal(
  isGeneratedPipelineStatusInput({ date: "2026-08-25T00:00:00+09:00", status: "ok", failedSteps: [] }),
  false,
  "timestamp-shaped pipeline date must not masquerade as canonical daily date",
);

console.log("web-pipeline-date-provenance.test.ts passed");
