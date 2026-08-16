import assert from "node:assert/strict";
import { normalizeSourceHealthScoreRows } from "../src/source-health-input.js";

const valid = normalizeSourceHealthScoreRows([{
  code: "8136",
  marketContext: { benchmark: "TOPIX" },
  financialQuality: { status: "partial" },
}]);
assert.equal(valid.valid, true, "object-shaped coverage metadata remains valid");

for (const malformed of [
  { code: "8136", marketContext: "present" },
  { code: "8136", marketContext: ["TOPIX"] },
  { code: "8136", financialQuality: "present" },
  { code: "8136", financialQuality: ["ok"] },
] as const) {
  const result = normalizeSourceHealthScoreRows([malformed]);
  assert.equal(
    result.valid,
    false,
    "truthy non-object coverage metadata must not inflate source-health coverage counts",
  );
  assert.deepEqual(result.rows, [], "malformed coverage rows must fail closed");
}

console.log("source-health-coverage-shape.test.ts passed");
