import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertReadinessAccuracySummaryInput,
  assertReadinessBackupDirectoryInput,
  assertReadinessCompanyMemoryInput,
  assertReadinessDataQualityFallbackInput,
  assertReadinessHypothesisOutcomeInput,
  assertReadinessHypothesisPredictionInput,
  assertReadinessPrimaryDisclosureReviewInput,
  assertReadinessScoreSnapshotFilenameInput,
  assertReadinessScoreSnapshotIdentityInput,
} from "../src/readiness-company-memory-input.js";

const dir = mkdtempSync(join(tmpdir(), "readiness-company-memory-"));
try {
  const generatedPath = join(dir, "alpha-pon-data.json");
  const reportPath = join(dir, "company_memory_latest.json");
  const reportsDir = join(dir, "reports");
  const backupsDir = join(dir, "backups");
  const accuracySummaryPath = join(dir, "hypothesis_accuracy_summary.json");
  mkdirSync(reportsDir);
  mkdirSync(backupsDir);

  mkdirSync(join(backupsDir, "2026-08-16T09-30-00"));
  assert.doesNotThrow(
    () => assertReadinessBackupDirectoryInput(backupsDir, "2026-08-16", new Date("2026-08-16T10:00:00+09:00")),
    "real Gregorian backup directory names remain valid readiness evidence",
  );

  for (const invalidBackupName of ["9999-99-99T09-30-00", "2026-08-16T24-00-00", "2026-08-16T09-60-00"] as const) {
    mkdirSync(join(backupsDir, invalidBackupName));
    assert.throws(
      () => assertReadinessBackupDirectoryInput(backupsDir, "2026-08-16", new Date("2026-08-16T10:00:00+09:00")),
      /backup directory name must contain a real Gregorian date and valid HH-mm-ss time/,
      "malformed backup directory names must not inflate operations readiness",
    );
    rmSync(join(backupsDir, invalidBackupName), { recursive: true, force: true });
  }

  const backupFilePath = join(backupsDir, "2026-08-15T09-30-00");
  writeFileSync(backupFilePath, "not a directory");
  assert.throws(
    () => assertReadinessBackupDirectoryInput(backupsDir, "2026-08-16", new Date("2026-08-16T10:00:00+09:00")),
    /backup evidence candidate must be a directory/,
    "timestamp-shaped files must not count as backup directories",
  );
  rmSync(backupFilePath, { force: true });

  writeFileSync(generatedPath, JSON.stringify({ companyMemory: [] }));
  assert.doesNotThrow(() => assertReadinessCompanyMemoryInput(generatedPath, reportPath));

  writeFileSync(reportPath, JSON.stringify({ code: "8136" }));
  assert.throws(
    () => assertReadinessCompanyMemoryInput(generatedPath, reportPath),
    /company-memory root must be an array of objects with canonical unique code and non-empty name/,
    "malformed canonical company-memory report must fail closed even when generated UI memory is well-shaped",
  );

  writeFileSync(reportPath, JSON.stringify([]));
  writeFileSync(generatedPath, JSON.stringify({ companyMemory: {} }));
  assert.throws(
    () => assertReadinessCompanyMemoryInput(generatedPath, reportPath),
    /companyMemory must be an array of objects with canonical unique code and non-empty name when present/,
    "malformed generated companyMemory must fail closed instead of becoming a false zero-record readiness state",
  );

  for (const malformedRow of [null, "8136", 7, [], {}, { code: "8136" }, { name: "Sanrio" }] as const) {
    writeFileSync(generatedPath, JSON.stringify({ companyMemory: [malformedRow] }));
    assert.throws(
      () => assertReadinessCompanyMemoryInput(generatedPath, reportPath),
      /companyMemory must be an array of objects with canonical unique code and non-empty name when present/,
      "malformed company-memory rows must not inflate readiness record counts",
    );
  }

  writeFileSync(generatedPath, JSON.stringify({ companyMemory: [{ code: "8136", name: "Sanrio" }] }));
  assert.doesNotThrow(() => assertReadinessCompanyMemoryInput(generatedPath, reportPath));

  writeFileSync(generatedPath, JSON.stringify({ companyMemory: [
    { code: "8136", name: "Sanrio" },
    { code: "8136", name: "Sanrio duplicate" },
  ] }));
  assert.throws(
    () => assertReadinessCompanyMemoryInput(generatedPath, reportPath),
    /companyMemory must be an array of objects with canonical unique code and non-empty name when present/,
    "duplicate company-memory identities must not inflate readiness record counts",
  );

  writeFileSync(generatedPath, JSON.stringify({ companyMemory: [{ code: " 8136 ", name: "Sanrio" }] }));
  assert.throws(
    () => assertReadinessCompanyMemoryInput(generatedPath, reportPath),
    /companyMemory must be an array of objects with canonical unique code and non-empty name when present/,
    "non-canonical company-memory identities must not create separate readiness records",
  );

  writeFileSync(generatedPath, JSON.stringify({ dataQualityByCode: { "8136": { quality: { level: "full" } } } }));
  assert.doesNotThrow(() => assertReadinessDataQualityFallbackInput(generatedPath));
  writeFileSync(generatedPath, JSON.stringify({ dataQualityByCode: { "8136": { quality: { level: "unknown" } } } }));
  assert.throws(
    () => assertReadinessDataQualityFallbackInput(generatedPath),
    /dataQualityByCode must contain canonical code keys and valid quality metadata/,
  );
  writeFileSync(generatedPath, JSON.stringify({ dataQualityByCode: { " 8136 ": { quality: { level: "full" } } } }));
  assert.throws(
    () => assertReadinessDataQualityFallbackInput(generatedPath),
    /dataQualityByCode must contain canonical code keys and valid quality metadata/,
  );

  writeFileSync(accuracySummaryPath, JSON.stringify({ total: 0, hit: 0, miss: 0, pending: 0, hitRate: null }));
  assert.doesNotThrow(() => assertReadinessAccuracySummaryInput(accuracySummaryPath));
  writeFileSync(accuracySummaryPath, JSON.stringify({ total: 1, hit: 1, miss: 0, pending: 0, hitRate: 0.5 }));
  assert.throws(
    () => assertReadinessAccuracySummaryInput(accuracySummaryPath),
    /accuracy summary counts and hitRate must be internally consistent/,
  );

  const predictionsPath = join(dir, "hypothesis_predictions.jsonl");
  writeFileSync(predictionsPath, JSON.stringify({ code: "8136", detectedAt: "2026-08-16", reviewDueAt: "2026-08-17", confidence: 0.5 }) + "\n");
  assert.doesNotThrow(() => assertReadinessHypothesisPredictionInput(predictionsPath, "2026-08-16"));
  writeFileSync(predictionsPath, JSON.stringify({ code: "8136", detectedAt: "2026-08-17", reviewDueAt: "2026-08-18", confidence: 0.5 }) + "\n");
  assert.throws(
    () => assertReadinessHypothesisPredictionInput(predictionsPath, "2026-08-16"),
    /hypothesis prediction rows must have canonical identity and PIT-safe dates/,
  );

  const outcomesPath = join(dir, "hypothesis_outcomes.jsonl");
  writeFileSync(outcomesPath, JSON.stringify({
    code: "8136",
    hypothesis: { detectedAt: "2026-08-16" },
    reviewHorizon: "1d",
    evaluatedAt: "2026-08-16",
  }) + "\n");
  assert.doesNotThrow(() => assertReadinessHypothesisOutcomeInput(outcomesPath, "2026-08-16"));
  writeFileSync(outcomesPath, JSON.stringify({
    code: "8136",
    hypothesis: { detectedAt: "2026-08-16" },
    reviewHorizon: "1d",
    evaluatedAt: "2026-08-17",
  }) + "\n");
  assert.throws(
    () => assertReadinessHypothesisOutcomeInput(outcomesPath, "2026-08-16"),
    /hypothesis outcome rows must have canonical identity and PIT-safe dates/,
  );

  const disclosureReviewsPath = join(dir, "primary_disclosure_reviews.json");
  writeFileSync(disclosureReviewsPath, JSON.stringify([
    { code: "8136" },
    { code: "6758" },
  ]));
  assert.doesNotThrow(() => assertReadinessPrimaryDisclosureReviewInput(disclosureReviewsPath));
  writeFileSync(disclosureReviewsPath, JSON.stringify([
    { code: "8136" },
    { code: " 8136 " },
  ]));
  assert.throws(
    () => assertReadinessPrimaryDisclosureReviewInput(disclosureReviewsPath),
    /primary disclosure reviews must have canonical unique code identities/,
  );

  assert.doesNotThrow(() => assertReadinessScoreSnapshotFilenameInput("scores_2026-08-16.json", "2026-08-16"));
  assert.throws(
    () => assertReadinessScoreSnapshotFilenameInput("scores_2026-08-17.json", "2026-08-16"),
    /score snapshot date must not be later than readiness as-of date/,
  );

  const scoresPath = join(reportsDir, "scores_2026-08-16.json");
  writeFileSync(scoresPath, JSON.stringify([
    { code: "8136", dataQuality: { level: "full" }, warnings: [], primaryDisclosureReview: null },
  ]));
  assert.doesNotThrow(() => assertReadinessScoreSnapshotIdentityInput(reportsDir, "2026-08-16"));
  writeFileSync(scoresPath, JSON.stringify([
    { code: "8136", dataQuality: { level: "full" }, warnings: [], primaryDisclosureReview: null },
    { code: "8136", dataQuality: { level: "full" }, warnings: [], primaryDisclosureReview: null },
  ]));
  assert.throws(
    () => assertReadinessScoreSnapshotIdentityInput(reportsDir, "2026-08-16"),
    /score snapshot rows must have canonical non-empty unique code identities and valid source-health metadata/,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("readiness-company-memory-input.test.ts passed");
