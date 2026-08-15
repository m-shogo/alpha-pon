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
    /company-memory root must be an array/,
    "malformed canonical company-memory report must fail closed even when generated UI memory is well-shaped",
  );

  writeFileSync(reportPath, JSON.stringify([]));
  writeFileSync(generatedPath, JSON.stringify({ companyMemory: {} }));
  assert.throws(
    () => assertReadinessCompanyMemoryInput(generatedPath, reportPath),
    /companyMemory must be an array when present/,
    "malformed generated companyMemory must fail closed instead of becoming a false zero-record readiness state",
  );

  writeFileSync(generatedPath, JSON.stringify({}));
  writeFileSync(reportPath, JSON.stringify([{ code: "8136" }]));
  assert.doesNotThrow(() => assertReadinessCompanyMemoryInput(generatedPath, reportPath));

  writeFileSync(reportPath, JSON.stringify({ code: "8136" }));
  assert.throws(
    () => assertReadinessCompanyMemoryInput(generatedPath, reportPath),
    /company-memory root must be an array/,
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
    /hypothesisPredictions must be an array when present/,
    "malformed generated hypothesis predictions must fail closed instead of yielding undefined readiness counts",
  );

  writeFileSync(generatedPath, JSON.stringify({}));
  assert.doesNotThrow(
    () => assertReadinessHypothesisPredictionInput(generatedPath),
    "missing generated hypothesis predictions must preserve the JSONL fallback path",
  );

  writeFileSync(generatedPath, JSON.stringify({ primaryDisclosureReviews: { "8136": { decision: "confirmed" } } }));
  assert.doesNotThrow(
    () => assertReadinessPrimaryDisclosureReviewInput(generatedPath),
    "well-shaped primary disclosure review maps remain valid readiness input",
  );

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

  writeFileSync(join(reportsDir, "scores_2026-08-16.json"), JSON.stringify([]));
  assert.doesNotThrow(
    () => assertReadinessDataQualityFallbackInput(generatedPath, reportsDir),
    "generated dataQualityByCode is inactive when a canonical score snapshot exists",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("readiness-company-memory-input.test.ts passed");
