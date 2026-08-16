import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { addDaysJst } from "./date.js";
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

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function canonicalAccuracyBucketTotal(value: unknown, requiredKeys: readonly string[]): number | null {
  if (!isRecord(value)) return null;
  let total = 0;
  for (const key of requiredKeys) {
    const bucket = value[key];
    if (!isRecord(bucket) || !isNonNegativeInteger(bucket.total)) return null;
    total += bucket.total;
  }
  return total;
}

function isRealJstDate(date: string): boolean {
  try {
    return addDaysJst(date, 0) === date;
  } catch {
    return false;
  }
}

function isCanonicalScoreSnapshotFilename(file: string): boolean {
  const match = /^scores_(\d{4}-\d{2}-\d{2})\.json$/.exec(file);
  return Boolean(match && isRealJstDate(match[1]));
}

function hasUsableScoreSnapshot(reportsDir: string): boolean {
  if (!existsSync(reportsDir)) return false;
  try {
    const latest = readdirSync(reportsDir)
      .filter(isCanonicalScoreSnapshotFilename)
      .sort()
      .at(-1);
    if (!latest) return false;
    const raw = JSON.parse(readFileSync(join(reportsDir, latest), "utf-8"));
    return normalizeSourceHealthArray(raw).valid;
  } catch {
    return false;
  }
}

export function assertReadinessScoreSnapshotFilenameInput(reportsDir = "reports"): void {
  if (!existsSync(reportsDir)) return;
  for (const name of readdirSync(reportsDir)) {
    const match = /^scores_(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
    if (!match) continue;
    if (!isRealJstDate(match[1])) {
      throw new Error(`${join(reportsDir, name)}: score snapshot filename must contain a real Gregorian date`);
    }
  }
}

export function assertReadinessBackupDirectoryInput(backupsDir = "backups"): void {
  if (!existsSync(backupsDir)) return;
  for (const name of readdirSync(backupsDir)) {
    if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(name)) continue;
    const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2})-(\d{2})-(\d{2}))?$/.exec(name);
    const hour = match?.[2] === undefined ? null : Number(match[2]);
    const minute = match?.[3] === undefined ? null : Number(match[3]);
    const second = match?.[4] === undefined ? null : Number(match[4]);
    const validTime = hour === null || (
      Number.isInteger(hour) && hour >= 0 && hour <= 23
      && Number.isInteger(minute) && minute! >= 0 && minute! <= 59
      && Number.isInteger(second) && second! >= 0 && second! <= 59
    );
    if (!match || !isRealJstDate(match[1]) || !validTime) {
      throw new Error(`${join(backupsDir, name)}: backup directory name must contain a real Gregorian date and valid HH-mm-ss time`);
    }
    try {
      if (!statSync(join(backupsDir, name)).isDirectory()) {
        throw new Error(`${join(backupsDir, name)}: backup evidence candidate must be a directory`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("backup evidence candidate")) throw error;
      throw new Error(`${join(backupsDir, name)}: backup evidence candidate cannot be inspected`);
    }
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
  if (!isNonNegativeInteger(summary.total)) {
    throw new Error(`${summaryPath}: total must be a non-negative safe integer`);
  }
  const actionTotal = canonicalAccuracyBucketTotal(summary.byActionLabel, ACTION_LABEL_KEYS);
  if (actionTotal === null) {
    throw new Error(`${summaryPath}: byActionLabel must contain watch/log/ignore buckets with non-negative integer totals`);
  }
  const scoreBandTotal = canonicalAccuracyBucketTotal(summary.byScoreBand, SCORE_BAND_KEYS);
  if (scoreBandTotal === null) {
    throw new Error(`${summaryPath}: byScoreBand must contain canonical score-band buckets with non-negative integer totals`);
  }
  if (actionTotal !== summary.total || scoreBandTotal !== summary.total) {
    throw new Error(`${summaryPath}: accuracy bucket totals must equal summary total`);
  }
}

if (process.argv[1]?.endsWith("readiness-company-memory-input.ts")) {
  assertReadinessScoreSnapshotFilenameInput();
  assertReadinessBackupDirectoryInput();
  assertReadinessCompanyMemoryInput();
  assertReadinessHypothesisPredictionInput();
  assertReadinessPrimaryDisclosureReviewInput();
  assertReadinessDataQualityFallbackInput();
  assertReadinessAccuracySummaryInput();
}
