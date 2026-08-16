import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { hasValidPrimaryDisclosureReview, normalizeSourceHealthArray } from "./source-health-input.js";

const READINESS_DATA_QUALITY_VALUES = new Set(["ok", "missing", "unknown"]);
const ACTION_LABEL_KEYS = ["watch", "log", "ignore"] as const;
const SCORE_BAND_KEYS = ["0-49", "50-69", "70-84", "85-100", "unknown"] as const;

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    throw new Error(`${path}: invalid JSON`);
  }
}

function readGeneratedObject(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  const generated = readJson(path);
  if (typeof generated !== "object" || generated === null || Array.isArray(generated)) {
    throw new Error(`${path}: generated root must be an object`);
  }
  return generated as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isIdentifiedRow(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && isNonEmptyString(value.code) && isNonEmptyString(value.name);
}

function isIdentifiedArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isIdentifiedRow);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function hasCanonicalAccuracyBucketMap(value: unknown, requiredKeys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  return requiredKeys.every((key) => {
    const bucket = value[key];
    return isRecord(bucket) && isNonNegativeFiniteNumber(bucket.total);
  });
}

function hasUsableScoreSnapshot(reportsDir: string): boolean {
  if (!existsSync(reportsDir)) return false;
  try {
    const latest = readdirSync(reportsDir)
      .filter((file) => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(file))
      .sort()
      .at(-1);
    if (!latest) return false;
    const raw = JSON.parse(readFileSync(join(reportsDir, latest), "utf-8"));
    return normalizeSourceHealthArray(raw).valid;
  } catch {
    return false;
  }
}

export function assertReadinessCompanyMemoryInput(
  generatedPath = "apps/web/public/generated/alpha-pon-data.json",
  reportPath = "reports/company_memory_latest.json",
): void {
  const generated = readGeneratedObject(generatedPath);
  if (generated) {
    const companyMemory = generated.companyMemory;
    if (companyMemory !== undefined && !isIdentifiedArray(companyMemory)) {
      throw new Error(`${generatedPath}: companyMemory must be an array of objects with non-empty code and name when present`);
    }
  }

  if (!existsSync(reportPath)) return;
  const report = readJson(reportPath);
  if (!isIdentifiedArray(report)) {
    throw new Error(`${reportPath}: company-memory root must be an array of objects with non-empty code and name`);
  }
}

export function assertReadinessHypothesisPredictionInput(
  generatedPath = "apps/web/public/generated/alpha-pon-data.json",
): void {
  const generated = readGeneratedObject(generatedPath);
  if (!generated || generated.hypothesisPredictions === undefined) return;
  if (!isIdentifiedArray(generated.hypothesisPredictions)) {
    throw new Error(`${generatedPath}: hypothesisPredictions must be an array of objects with non-empty code and name when present`);
  }
}

export function assertReadinessPrimaryDisclosureReviewInput(
  generatedPath = "apps/web/public/generated/alpha-pon-data.json",
): void {
  const generated = readGeneratedObject(generatedPath);
  if (!generated || generated.primaryDisclosureReviews === undefined) return;
  if (!isRecord(generated.primaryDisclosureReviews)) {
    throw new Error(`${generatedPath}: primaryDisclosureReviews must be an object when present`);
  }
  for (const [code, review] of Object.entries(generated.primaryDisclosureReviews)) {
    if (!isRecord(review)) {
      throw new Error(`${generatedPath}: primaryDisclosureReviews.${code} must be an object`);
    }
    if (!hasValidPrimaryDisclosureReview(review)) {
      throw new Error(`${generatedPath}: primaryDisclosureReviews.${code} must include a canonical decision and finite source coverage counts`);
    }
  }
}

export function assertReadinessDataQualityFallbackInput(
  generatedPath = "apps/web/public/generated/alpha-pon-data.json",
  reportsDir = "reports",
): void {
  if (hasUsableScoreSnapshot(reportsDir)) return;
  const generated = readGeneratedObject(generatedPath);
  if (!generated || generated.dataQualityByCode === undefined) return;
  if (!isRecord(generated.dataQualityByCode)) {
    throw new Error(`${generatedPath}: dataQualityByCode must be an object when score snapshots are absent or unusable`);
  }
  for (const [code, quality] of Object.entries(generated.dataQualityByCode)) {
    if (!isRecord(quality)) {
      throw new Error(`${generatedPath}: dataQualityByCode.${code} must be an object`);
    }
    if (
      quality.dataQuality !== undefined
      && (typeof quality.dataQuality !== "string" || !READINESS_DATA_QUALITY_VALUES.has(quality.dataQuality))
    ) {
      throw new Error(`${generatedPath}: dataQualityByCode.${code}.dataQuality must be one of ok, missing, unknown when present`);
    }
    if (
      quality.warnings !== undefined
      && (!Array.isArray(quality.warnings) || !quality.warnings.every((warning) => typeof warning === "string"))
    ) {
      throw new Error(`${generatedPath}: dataQualityByCode.${code}.warnings must be a string array when present`);
    }
  }
}

export function assertReadinessAccuracySummaryInput(
  summaryPath = "data/hypothesis_accuracy_summary.json",
): void {
  if (!existsSync(summaryPath)) return;
  const summary = readJson(summaryPath);
  if (!isRecord(summary)) {
    throw new Error(`${summaryPath}: accuracy summary root must be an object`);
  }
  if (summary.total !== undefined && !isNonNegativeFiniteNumber(summary.total)) {
    throw new Error(`${summaryPath}: total must be a non-negative finite number when present`);
  }
  if (!hasCanonicalAccuracyBucketMap(summary.byActionLabel, ACTION_LABEL_KEYS)) {
    throw new Error(`${summaryPath}: byActionLabel must contain watch/log/ignore buckets with non-negative finite totals`);
  }
  if (!hasCanonicalAccuracyBucketMap(summary.byScoreBand, SCORE_BAND_KEYS)) {
    throw new Error(`${summaryPath}: byScoreBand must contain canonical score-band buckets with non-negative finite totals`);
  }
}

if (process.argv[1]?.endsWith("readiness-company-memory-input.ts")) {
  assertReadinessCompanyMemoryInput();
  assertReadinessHypothesisPredictionInput();
  assertReadinessPrimaryDisclosureReviewInput();
  assertReadinessDataQualityFallbackInput();
  assertReadinessAccuracySummaryInput();
}
