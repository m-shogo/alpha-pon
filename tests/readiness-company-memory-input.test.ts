import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertReadinessAccuracySummaryInput,
  assertReadinessBackupDirectoryInput,
  assertReadinessCompanyMemoryInput,
  assertReadinessDataQualityFallbackInput,
  assertReadinessHypothesisPredictionInput,
  assertReadinessPrimaryDisclosureReviewInput,
  assertReadinessScoreSnapshotFilenameInput,
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
    () => assertReadinessBackupDirectoryInput(backupsDir),
    "real Gregorian backup directory names remain valid readiness evidence",
  );

  for (const invalidBackupName of ["9999-99-99T09-30-00", "2026-08-16T24-00-00", "2026-08-16T09-60-00"] as const) {
    mkdirSync(join(backupsDir, invalidBackupName));
    assert.throws(
      () => assertReadinessBackupDirectoryInput(backupsDir),
      /backup directory name must contain a real Gregorian date and valid HH-mm-ss time/,
      "malformed backup directory names must not inflate operations readiness",
    );
    rmSync(join(backupsDir, invalidBackupName), { recursive: true, force: true });
  }

  const backupFilePath = join(backupsDir, "2026-08-15T09-30-00");
  writeFileSync(backupFilePath, "not a directory");
  assert.throws(
    () => assertReadinessBackupDirectoryInput(backupsDir),
    /backup evidence candidate must be a directory/,
    "timestamp-shaped files must not count as backup directories",
  );
  rmSync(backupFilePath, { force: true });

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
    "empty generated hypothesis predictions remain valid readiness input",
  );

  writeFileSync(generatedPath, JSON.stringify({ hypothesisPredictions: [{ code: "8136", name: "Sanrio" }] }));
  assert.doesNotThrow(
    () => assertReadinessHypothesisPredictionInput(generatedPath),
    "identified generated hypotheses remain valid readiness input",
  );

  writeFileSync(generatedPath, JSON.stringify({ hypothesisPredictions: {} }));
  assert.throws(
    () => assertReadinessHypothesisPredictionInput(generatedPath),
    /hypothesisPredictions must be an array of objects with non-empty code and name when present/,
    "malformed generated hypothesis predictions must fail closed instead of yielding undefined readiness counts",
  );

  for (const malformedRow of [null, "prediction", 7, [], {}, { code: "8136" }, { name: "Sanrio" }] as const) {
    writeFileSync(generatedPath, JSON.stringify({ hypothesisPredictions: [malformedRow] }));
    assert.throws(
      () => assertReadinessHypothesisPredictionInput(generatedPath),
      /hypothesisPredictions must be an array of objects with non-empty code and name when present/,
      "identity-less prediction rows must not inflate readiness hypothesis counts",
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

  writeFileSync(generatedPath, JSON.stringify({ dataQualityByCode: { "8136": { warnings: { count: 3 } } } } }));
  assert.throws(
    () => assertReadinessDataQualityFallbackInput(generatedPath, reportsDir),
    /warnings must be a string array/,
    "malformed fallback warnings must not crash or distort warning counts",
  );

  const invalidDateScorePath = join(reportsDir, "scores_9999-99-99.json");
  writeFileSync(invalidDateScorePath, JSON.stringify([]));
  assert.throws(
    () => assertReadinessScoreSnapshotFilenameInput(reportsDir),
    /score snapshot filename must contain a real Gregorian date/,
    "readiness preflight must reject the impossible-date snapshot before readiness-audit can select it",
  );
  assert.throws(
    () => assertReadinessDataQualityFallbackInput(generatedPath, reportsDir),
    /warnings must be a string array/,
    "an impossible-date score filename must not suppress validation of the generated fallback",
  );
  rmSync(invalidDateScorePath);

  const scorePath = join(reportsDir, "scores_2026-08-16.json");
  writeFileSync(scorePath, JSON.stringify([]));
  assert.doesNotThrow(
    () => assertReadinessScoreSnapshotFilenameInput(reportsDir),
    "real Gregorian score snapshot filenames remain valid readiness input",
  );
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

  const canonicalAccuracySummary = {
    total: 3,
    byActionLabel: {
      watch: { total: 1 },
      log: { total: 1 },
      ignore: { total: 1 },
    },
    byScoreBand: {
      "0-49": { total: 0 },
      "50-69": { total: 1 },
      "70-84": { total: 1 },
      "85-100": { total: 1 },
      unknown: { total: 0 },
    },
  };
  writeFileSync(accuracySummaryPath, JSON.stringify(canonicalAccuracySummary));
  assert.doesNotThrow(
    () => assertReadinessAccuracySummaryInput(accuracySummaryPath),
    "canonical accuracy summary remains valid readiness evidence",
  );

  for (const malformedSummary of [
    [],
    { byActionLabel: [], byScoreBand: canonicalAccuracySummary.byScoreBand },
    { byActionLabel: canonicalAccuracySummary.byActionLabel, byScoreBand: "present" },
    { byActionLabel: { watch: { total: 1 } }, byScoreBand: canonicalAccuracySummary.byScoreBand },
    { byActionLabel: canonicalAccuracySummary.byActionLabel, byScoreBand: { ...canonicalAccuracySummary.byScoreBand, unknown: { total: -1 } } },
    { total: Number.POSITIVE_INFINITY, byActionLabel: canonicalAccuracySummary.byActionLabel, byScoreBand: canonicalAccuracySummary.byScoreBand },
  ] as const) {
    writeFileSync(accuracySummaryPath, JSON.stringify(malformedSummary));
    assert.throws(
      () => assertReadinessAccuracySummaryInput(accuracySummaryPath),
      /(accuracy summary root|byActionLabel|byScoreBand|total)/,
      "malformed accuracy summary metadata must not qualify for elevated outcome readiness",
    );
  }

  for (const inconsistentSummary of [
    {
      ...canonicalAccuracySummary,
      byActionLabel: {
        ...canonicalAccuracySummary.byActionLabel,
        ignore: { total: 0 },
      },
    },
    {
      ...canonicalAccuracySummary,
      byScoreBand: {
        ...canonicalAccuracySummary.byScoreBand,
        unknown: { total: 1 },
      },
    },
    { ...canonicalAccuracySummary, total: 3.5 },
    {
      ...canonicalAccuracySummary,
      byActionLabel: {
        ...canonicalAccuracySummary.byActionLabel,
        watch: { total: 0.5 },
      },
    },
  ] as const) {
    writeFileSync(accuracySummaryPath, JSON.stringify(inconsistentSummary));
    assert.throws(
      () => assertReadinessAccuracySummaryInput(accuracySummaryPath),
      /(accuracy bucket totals must equal summary total|non-negative integer|non-negative safe integer)/,
      "accuracy summary count inconsistencies must not qualify for elevated outcome readiness",
    );
  }

  writeFileSync(accuracySummaryPath, "{ broken");
  assert.throws(
    () => assertReadinessAccuracySummaryInput(accuracySummaryPath),
    /invalid JSON/,
    "unparsable accuracy summary must fail closed before readiness scoring",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("readiness-company-memory-input.test.ts passed");
