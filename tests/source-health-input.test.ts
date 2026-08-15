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

for (const malformed of [[null], ["8136"], [7], [[]]] as const) {
  const result = normalizeSourceHealthScoreRows<{ code: string }>(malformed);
  assert.equal(result.valid, false, "non-object score rows must fail closed before downstream property access");
  assert.deepEqual(result.rows, [], "malformed score rows must not leak into readiness/source-health consumers");
}

for (const malformedWarnings of [{}, "warning", [7], ["ok", 7]] as const) {
  const result = normalizeSourceHealthScoreRows<{ code: string; warnings?: string[] }>([{ code: "8136", warnings: malformedWarnings }]);
  assert.equal(result.valid, false, "malformed score warning collections must fail closed before .some/.length consumers");
  assert.deepEqual(result.rows, [], "malformed warning collections must not be counted as healthy score input");
}

const validObject = normalizeSourceHealthObject<{ status?: string }>({ status: "completed" });
assert.equal(validObject.valid, true);
assert.deepEqual(validObject.value, { status: "completed" });

const validPipelineCollections = normalizeSourceHealthObject<{
  status?: string;
  steps?: unknown[];
  results?: unknown[];
  completeWrapperFailedSteps?: unknown[];
}>({
  status: "completed",
  steps: [{ name: "daily", status: "ok" }],
  results: [{ name: "health:sources", status: "ok" }],
  completeWrapperFailedSteps: ["optional_step"],
});
assert.equal(validPipelineCollections.valid, true, "well-shaped pipeline collections remain valid");

for (const malformed of [null, [], "completed", 1] as const) {
  const result = normalizeSourceHealthObject<{ status?: string }>(malformed);
  assert.equal(result.valid, false, "non-object pipeline roots must be treated as invalid input");
  assert.equal(result.value, null, "invalid roots must not leak into downstream object access");
}

for (const malformed of [
  { status: "completed", steps: {} },
  { status: "completed", results: "ok" },
  { status: "completed", completeWrapperFailedSteps: {} },
] as const) {
  const result = normalizeSourceHealthObject<Record<string, unknown>>(malformed);
  assert.equal(result.valid, false, "malformed pipeline collection fields must fail closed before array operations");
  assert.equal(result.value, null, "malformed nested pipeline collections must not reach source-health consumers");
}

for (const malformed of [
  { status: "completed", steps: [null] },
  { status: "completed", results: ["ok"] },
  { status: "completed", completeWrapperFailedSteps: [7] },
] as const) {
  const result = normalizeSourceHealthObject<Record<string, unknown>>(malformed);
  assert.equal(result.valid, false, "malformed pipeline collection entries must fail closed before property access");
  assert.equal(result.value, null, "malformed pipeline collection entries must not reach source-health consumers");
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
    const validMemory = {
      schemaVersion: 1,
      code: "8136",
      name: "サンリオ",
      firstSeenAt: "2026-08-01",
      lastReviewedAt: "2026-08-15",
      watchReason: ["watch"],
      knownRisks: [],
      strongRules: [],
      weakRules: [],
      recurringWarnings: [],
      recentOutcomes: [],
      notes: ["keep"],
    };
    writeFileSync(memoryPath, JSON.stringify(validMemory));
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

    writeFileSync(memoryPath, JSON.stringify({ ...validMemory, code: "9999" }));
    assert.throws(
      () => assertExistingCompanyMemoryInputs(dir),
      /8136\.json: code must match filename \(8136\)/,
      "mismatched stable identity must fail closed before a per-company memory file is overwritten",
    );

    writeFileSync(memoryPath, JSON.stringify({ ...validMemory, firstSeenAt: "2026-02-31" }));
    assert.throws(
      () => assertExistingCompanyMemoryInputs(dir),
      /8136\.json: firstSeenAt must be a real YYYY-MM-DD date/,
      "nonexistent Gregorian dates must not enter company-memory provenance",
    );

    writeFileSync(memoryPath, JSON.stringify({ ...validMemory, firstSeenAt: "0000-01-01" }));
    assert.throws(
      () => assertExistingCompanyMemoryInputs(dir),
      /8136\.json: firstSeenAt must be a real YYYY-MM-DD date/,
      "Gregorian year zero must fail closed in company-memory provenance",
    );

    writeFileSync(memoryPath, JSON.stringify({ ...validMemory, firstSeenAt: "2026-08-16", lastReviewedAt: "2026-08-15" }));
    assert.throws(
      () => assertExistingCompanyMemoryInputs(dir),
      /8136\.json: lastReviewedAt must be on or after firstSeenAt/,
      "company-memory review chronology must not move before first observation",
    );

    writeFileSync(memoryPath, JSON.stringify({ ...validMemory, notes: {} }));
    assert.throws(
      () => assertExistingCompanyMemoryInputs(dir),
      /8136\.json: notes must be a string array/,
      "malformed memory collections must fail closed before derived refresh",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("source-health-input.test.ts passed");
