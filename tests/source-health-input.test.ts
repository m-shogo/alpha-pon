import assert from "node:assert/strict";
import { normalizeSourceHealthObject, normalizeSourceHealthScoreRows } from "../src/source-health-input.js";

const valid = normalizeSourceHealthScoreRows<{ code: string }>([{ code: "8136" }]);
assert.equal(valid.valid, true);
assert.deepEqual(valid.rows, [{ code: "8136" }]);

for (const malformed of [null, {}, { scores: [] }, "not-an-array"] as const) {
  const result = normalizeSourceHealthScoreRows<{ code: string }>(malformed);
  assert.equal(result.valid, false, "non-array score roots must be treated as invalid input");
  assert.deepEqual(result.rows, [], "invalid roots must not leak into downstream array operations");
}

const validObject = normalizeSourceHealthObject<{ status?: string }>({ status: "completed" });
assert.equal(validObject.valid, true);
assert.deepEqual(validObject.value, { status: "completed" });

for (const malformed of [null, [], "completed", 1] as const) {
  const result = normalizeSourceHealthObject<{ status?: string }>(malformed);
  assert.equal(result.valid, false, "non-object pipeline roots must be treated as invalid input");
  assert.equal(result.value, null, "invalid pipeline roots must not leak into downstream object access");
}

console.log("source-health-input.test.ts passed");