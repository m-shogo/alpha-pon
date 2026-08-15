import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertExistingCompanyMemoryInputs } from "../src/company-memory-existing-input.js";
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
  assert.equal(result.value, null, "invalid roots must not leak into downstream object access");
}

{
  const dir = mkdtempSync(join(tmpdir(), "company-memory-score-input-"));
  try {
    const scorePath = join(dir, "scores_2026-08-15.json");
    const validScoreRows = [{ code: "8136", name: "サンリオ", createdAt: "2026-08-15", tags: ["watch"] }];
    writeFileSync(scorePath, JSON.stringify(validScoreRows));
    assert.doesNotThrow(() => assertCompanyMemoryScoreInputs(dir), "well-shaped score rows remain valid company-memory input");

    writeFileSync(scorePath, JSON.stringify([{ name: "サンリオ", createdAt: "2026-08-15" }]));
    assert.throws(
      () => assertCompanyMemoryScoreInputs(dir),
      /scores_2026-08-15\.json row 1 code must be a non-empty string/,
      "missing stable code must fail closed before company-memory paths or derived records are built",
    );

    writeFileSync(scorePath, JSON.stringify([{ code: "8136", name: "サンリオ", createdAt: "2026-08-15", tags: {} }]));
    assert.throws(
      () => assertCompanyMemoryScoreInputs(dir),
      /scores_2026-08-15\.json row 1 tags must be a string array when present/,
      "malformed optional arrays must fail closed before company-memory transformations",
    );

    writeFileSync(scorePath, JSON.stringify(validScoreRows));
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

{
  const dir = mkdtempSync(join(tmpdir(), "company-memory-existing-input-"));
  try {
    mkdirSync(dir, { recursive: true });
    const memoryPath = join(dir, "8136.json");
    writeFileSync(memoryPath, JSON.stringify({ schemaVersion: 1, code: "8136", notes: ["keep"] }));
    assert.doesNotThrow(
      () => assertExistingCompanyMemoryInputs(dir),
      "valid existing company memory must remain eligible for derived refresh",
    );

    writeFileSync(memoryPath, "{ broken");
    assert.throws(
      () => assertExistingCompanyMemoryInputs(dir),
      /8136\.json: invalid company-memory JSON/,
      "malformed existing memory must fail closed before memory:companies can overwrite prior notes or provenance",
    );

    writeFileSync(memoryPath, JSON.stringify([]));
    assert.throws(
      () => assertExistingCompanyMemoryInputs(dir),
      /8136\.json: company-memory root must be an object/,
      "non-object existing memory roots must fail closed before derived refresh",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("source-health-input.test.ts passed");
