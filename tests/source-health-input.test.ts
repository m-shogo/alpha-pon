import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertCompanyMemoryScoreInputs } from "../src/company-memory-score-input.js";
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

{
  const dir = mkdtempSync(join(tmpdir(), "company-memory-score-input-"));
  try {
    writeFileSync(join(dir, "scores_2026-08-15.json"), JSON.stringify([{ code: "8136" }]));
    assert.doesNotThrow(() => assertCompanyMemoryScoreInputs(dir), "array score roots remain valid company-memory input");

    writeFileSync(join(dir, "scores_2026-08-16.json"), JSON.stringify({ code: "8136" }));
    assert.throws(
      () => assertCompanyMemoryScoreInputs(dir),
      /scores_2026-08-16\.json: score root must be an array/,
      "object score roots must fail closed before company-memory output writes",
    );

    writeFileSync(join(dir, "scores_2026-08-16.json"), "{ broken");
    assert.throws(
      () => assertCompanyMemoryScoreInputs(dir),
      /scores_2026-08-16\.json: invalid score JSON/,
      "malformed score JSON must fail closed before company-memory output writes",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("source-health-input.test.ts passed");