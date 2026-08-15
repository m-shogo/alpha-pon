import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertReadinessCompanyMemoryInput,
  assertReadinessDataQualityFallbackInput,
  assertReadinessHypothesisPredictionInput,
  assertReadinessPrimaryDisclosureReviewInput,
} from "../src/readiness-company-memory-input.js";

const dir = mkdtempSync(join(tmpdir(), "readiness-company-memory-"));
try {
  const generatedPath = join(dir, "alpha-pon-data.json");
  const reportPath = join(dir, "company_memory_latest.json");
  const reportsDir = join(dir, "reports");
  mkdirSync(reportsDir);

  writeFileSync(generatedPath, JSON.stringify({ companyMemory: [] }));
  assert.doesNotThrow(() => assertReadinessCompanyMemoryInput(generatedPath, reportPath));

  writeFileSync(reportPath, JSON.stringify({ code: "8136" }));
  assert.throws(
    () => assertReadinessCompanyMemoryInput(generatedPath, reportPath),
    /company-memory root must be an array of objects with non-empty code and name/,
    "malformed canonical company-memory report must fail closed even when generated UI memory is well-shaped",
  );

  writeFileSync(reportPath, JSON.stringify([]));
  writeFileSync(generatedPath, JSON.stringify({ companyMemory: {} }));
  assert.throws(
    () => assertReadinessCompanyMemoryInput(generatedPath, reportPath),
    /companyMemory must be an array of objects with non-empty code and name when present/,
    "malformed generated companyMemory must fail closed instead of becoming a false zero-record readiness state",
  );

  for (const malformedRow of [null, "8136", 7, [], {}, { code: "8136" }, { name: "Sanrio" }] as const) {
    writeFileSync(generatedPath, JSON.stringify({ companyMemory: [malformedRow] }));
    assert.throws(
      () => assertReadinessCompanyMemoryInput(generatedPath, reportPath),
      /companyMemory must be an array of objects with non-empty code and name when present/,
      "malformed company-memory rows must not inflate readiness record counts",
    );
  }

  writeFileSync(generatedPath, JSON.stringify({ companyMemory: [{ code: "8136", name: "Sanrio" }] }));
  assert.doesNotThrow(
    () => assertReadinessCompanyMemoryInput(generatedPath, reportPath),
    "identified company-memory rows remain valid readiness input",
  );

  writeFileSync(generatedPath, JSON.stringify({}));
  writeFileSync(reportPath, JSON.stringify([{ code: "8136", name: "Sanrio" }]));
  assert.doesNotThrow(() => assertReadinessCompanyMemoryInput(generatedPath, reportPath));

  for (const malformedRow of [null, {}, { code: "8136" }, { name: "Sanrio" }] as const) {
    writeFileSync(reportPath, JSON.stringify([malformedRow]));
    assert.throws(
      () => assertReadinessCompanyMemoryInput(generatedPath, reportPath),
      /company-memory root must be an array of objects with non-empty code and name/,
      "identity-less canonical company-memory rows must fail closed before readiness scoring",
    );
  }

  writeFileSync(reportPath, JSON.stringify({ code: "8136" }));
  assert.throws(
    () => assertReadinessCompanyMemoryInput(generatedPath, reportPath),
    /company-memory root must be an array of objects with non-empty code and name/,
    "malformed fallback company-memory root must fail closed before readiness scoring",
  );

  writeFileSync(generatedPath, "{ broken");
  assert.throws(
    () => assertReadinessCompanyMemoryInput(generatedPath, reportPath),
    /invalid JSON/,
    "malformed generated readiness JSON must not be treated as missing input",
  );

  writeFileSync(generatedPath, JSON.stringify({ hypothesisPredictions: [] }));
  assert.doesNotThrow(
    () => assertReadinessHypothesisPredictionInput(generatedPath),
    "well-shaped generated hypothesis predictions remain valid readiness input",
  );

  writeFileSync(generatedPath, JSON.stringify({ hypothesisPredictions: {} }));
  assert.throws(
    () => assertReadinessHypothesisPredictionInput(generatedPath),
    /hypothesisPredictions must be an array of objects when present/,
    "malformed generated hypothesis predictions must fail closed instead of yielding undefined readiness counts",
  );

  for (const malformedRow of [null, "prediction", 7, []] as const) {
    writeFileSync(generatedPath, JSON.stringify({ hypothesisPredictions: [malformedRow] }));
    assert.throws(
      () => assertReadinessHypothesisPredictionInput(generatedPath),
      /hypothesisPredictions must be an array of objects when present/,
      "primitive prediction rows must not inflate readiness hypothesis counts",
    );
  }

  writeFileSync(generatedPath, JSON.stringify({}));
  assert.doesNotThrow(
    () => assertReadinessHypothesisPredictionInput(generatedPath),
    "missing generated hypothesis predictions must preserve the JSONL fallback path",
  );

  writeFileSync(generatedPath, JSON.stringify({
    primaryDisclosureReviews: {
      "8136": { decision: "confirmed", sourceCoverage: { tdnetCount: 1, edinetCount: 2 } },
    },
  }));
  assert.doesNotThrow(
    () => assertReadinessPrimaryDisclosureReviewInput(generatedPath),
    "well-shaped primary disclosure review maps remain valid readiness input",
  );

  for (const malformedReview of [
    {},
    { decision: "perfect" },
    { decision: "confirmed" },
    { decision: "confirmed", sourceCoverage: {} },
    { decision: "confirmed", sourceCoverage: { tdnetCount: "1", edinetCount: 2 } },
  ] as const) {
    writeFileSync(generatedPath, JSON.stringify({ primaryDisclosureReviews: { "8136": malformedReview } }));
    assert.throws(
      () => assertReadinessPrimaryDisclosureReviewInput(generatedPath),
      /must include a canonical decision and finite source coverage counts/,
      "incomplete primary review metadata must not inflate primary disclosure readiness counts",
    );
  }

  writeFileSync(generatedPath, JSON.stringify({ primaryDisclosureReviews: [{ decision: "confirmed" }, { decision: "confirmed" }, { decision: "confirmed" }] }));
  assert.throws(
    () => assertReadinessPrimaryDisclosureReviewInput(generatedPath),
    /primaryDisclosureReviews must be an object when present/,
    "array-shaped primary reviews must fail closed instead of inflating readiness counts through Object.keys",
  );

  writeFileSync(generatedPath, JSON.stringify({ primaryDisclosureReviews: { "8136": null, "5803": "confirmed", "6758": 1 } }));
  assert.throws(
    () => assertReadinessPrimaryDisclosureReviewInput(generatedPath),
    /primaryDisclosureReviews\.(?:5803|6758|8136) must be an object/,
    "primitive primary review entries must fail closed instead of inflating readiness counts",
  );

  writeFileSync(generatedPath, JSON.stringify({ dataQualityByCode: { "8136": { dataQuality: "ok", warnings: [] } } }));
  assert.doesNotThrow(
    () => assertReadinessDataQualityFallbackInput(generatedPath, reportsDir),
    "well-shaped generated data-quality fallback remains valid when score snapshots are absent",
  );

  writeFileSync(generatedPath, JSON.stringify({ dataQualityByCode: { "8136": { dataQuality: "unknown", warnings: [] } } }));
  assert.doesNotThrow(
    () => assertReadinessDataQualityFallbackInput(generatedPath, reportsDir),
    "unknown remains a valid explicit degraded fallback state",
  );

  writeFileSync(generatedPath, JSON.stringify({ dataQualityByCode: { "8136": { dataQuality: "perfect", warnings: [] } } }));
  assert.throws(
    () => assertReadinessDataQualityFallbackInput(generatedPath, reportsDir),
    /dataQuality must be one of ok, missing, unknown/,
    "unknown data-quality labels must fail closed instead of bypassing missing/unknown readiness counts",
  );

  writeFileSync(generatedPath, JSON.stringify({ dataQualityByCode: [] }));
  assert.throws(
    () => assertReadinessDataQualityFallbackInput(generatedPath, reportsDir),
    /dataQualityByCode must be an object/,
    "array-shaped data-quality fallback must fail closed before Object.values readiness scoring",
  );

  writeFileSync(generatedPath, JSON.stringify({ dataQualityByCode: { "8136": null } }));
  assert.throws(
    () => assertReadinessDataQualityFallbackInput(generatedPath, reportsDir),
    /dataQualityByCode\.8136 must be an object/,
    "primitive data-quality fallback entries must fail closed before readiness scoring",
  );

  writeFileSync(generatedPath, JSON.stringify({ dataQualityByCode: { "8136": { warnings: { count: 3 } } } }));
  assert.throws(
    () => assertReadinessDataQualityFallbackInput(generatedPath, reportsDir),
    /warnings must be a string array/,
    "malformed fallback warnings must not crash or distort warning counts",
  );

  const scorePath = join(reportsDir, "scores_2026-08-16.json");
  writeFileSync(scorePath, JSON.stringify([]));
  assert.doesNotThrow(
    () => assertReadinessDataQualityFallbackInput(generatedPath, reportsDir),
    "generated dataQualityByCode is inactive when the canonical score snapshot is usable",
  );

  writeFileSync(scorePath, JSON.stringify({ invalid: true }));
  assert.throws(
    () => assertReadinessDataQualityFallbackInput(generatedPath, reportsDir),
    /warnings must be a string array/,
    "an unusable canonical score snapshot must not suppress validation of the generated fallback that readiness still evaluates",
  );

  writeFileSync(scorePath, "{ broken");
  assert.throws(
    () => assertReadinessDataQualityFallbackInput(generatedPath, reportsDir),
    /warnings must be a string array/,
    "an unparsable canonical score snapshot must not suppress validation of the generated fallback",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("readiness-company-memory-input.test.ts passed");
