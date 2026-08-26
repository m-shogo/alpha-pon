import { existsSync, readdirSync } from "fs";
import { join } from "path";
import type { AnalogyOutcomeRecord, AnalogyPredictionRecord } from "./analysis/analogy-db.js";
import { analogyReviewDueDate } from "./analogy-review-date.js";
import { addDaysJst, todayJst } from "./date.js";
import { formatReadOnlyJsonlParseWarning, readJsonlWithErrors } from "./read-only-jsonl.js";

export type AnalogyReviewPredictionInput = {
  rows: AnalogyPredictionRecord[];
  warnings: string[];
};

export type AnalogyReviewOutcomeInput = {
  rows: AnalogyOutcomeRecord[];
  warnings: string[];
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isRealJstDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function isCanonicalIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalCanonicalIdentity(value: unknown): boolean {
  return value === undefined || isCanonicalIdentity(value);
}

function isUsableAnalogyPredictionRecord(value: unknown): value is AnalogyPredictionRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (!isRealJstDate(row.createdAt) || !isRealJstDate(row.reviewDueAt)) return false;
  if (row.timeframe !== "1d" && row.timeframe !== "1w" && row.timeframe !== "1m") return false;
  if (row.reviewDueAt !== analogyReviewDueDate(row.createdAt, row.timeframe)) return false;
  return (
    row.schemaVersion === 1 &&
    isCanonicalIdentity(row.eventId) &&
    isOptionalCanonicalIdentity(row.candidateCode) &&
    (row.candidateName === undefined || typeof row.candidateName === "string") &&
    isCanonicalIdentity(row.lessonId) &&
    isNonBlankString(row.lessonTitle) &&
    isNonBlankString(row.thesis) &&
    (row.expectedDirection === "up" || row.expectedDirection === "down" || row.expectedDirection === "mixed" || row.expectedDirection === "risk_off" || row.expectedDirection === "unknown") &&
    typeof row.confidence === "number" && Number.isFinite(row.confidence) && row.confidence >= 0 && row.confidence <= 1 &&
    isStringArray(row.conditions) &&
    isStringArray(row.invalidationSignals) &&
    isStringArray(row.evidenceNeeded) &&
    isStringArray(row.similarPoints) &&
    isStringArray(row.differentPoints) &&
    (row.status === "open" || row.status === "reviewed")
  );
}

function isUsableAnalogyOutcomeRecord(value: unknown, asOf: string): value is AnalogyOutcomeRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    row.schemaVersion === 1 &&
    isRealJstDate(row.createdAt) &&
    isRealJstDate(row.evaluatedAt) &&
    row.createdAt <= row.evaluatedAt &&
    row.evaluatedAt <= asOf &&
    isCanonicalIdentity(row.eventId) &&
    (row.timeframe === "1d" || row.timeframe === "1w" || row.timeframe === "1m") &&
    isOptionalCanonicalIdentity(row.candidateCode) &&
    isCanonicalIdentity(row.lessonId) &&
    isNonBlankString(row.lessonTitle) &&
    (row.direction === "same" || row.direction === "opposite" || row.direction === "mixed" || row.direction === "unknown") &&
    (row.quality === "useful" || row.quality === "misleading" || row.quality === "too_early" || row.quality === "unknown") &&
    isNonBlankString(row.actualOutcome) &&
    isOptionalFiniteNumber(row.startClose) &&
    isOptionalFiniteNumber(row.endClose) &&
    isOptionalFiniteNumber(row.returnPct) &&
    isOptionalFiniteNumber(row.benchmarkReturnPct) &&
    isOptionalFiniteNumber(row.relativeReturnPct) &&
    isOptionalFiniteNumber(row.maxDrawdownPct) &&
    isOptionalFiniteNumber(row.benchmarkMaxDrawdownPct) &&
    isStringArray(row.whatMatched) &&
    isStringArray(row.whatDiffered) &&
    isStringArray(row.missedSignals) &&
    isStringArray(row.improvedRuleIdeas)
  );
}

export function loadAnalogyPredictionsForReview(dir: string): AnalogyReviewPredictionInput {
  if (!existsSync(dir)) return { rows: [], warnings: [] };

  const rows: AnalogyPredictionRecord[] = [];
  const warnings: string[] = [];

  for (const file of readdirSync(dir).filter(name => name.endsWith(".jsonl")).sort()) {
    const path = join(dir, file);
    const parsed = readJsonlWithErrors<unknown>(path);
    const validRows = parsed.rows.filter(isUsableAnalogyPredictionRecord);
    rows.push(...validRows);
    const warning = formatReadOnlyJsonlParseWarning(path, parsed.parseErrors);
    if (warning) warnings.push(warning);
    const invalidRows = parsed.rows.length - validRows.length;
    if (invalidRows > 0) warnings.push(`${path}: invalid_shape ${invalidRows}`);
  }

  return { rows, warnings };
}

export function loadAnalogyOutcomesForReview(path: string, asOf = todayJst()): AnalogyReviewOutcomeInput {
  if (!isRealJstDate(asOf)) {
    throw new Error("analogy review asOf must be a real YYYY-MM-DD date");
  }
  const parsed = readJsonlWithErrors<unknown>(path);
  const validRows = parsed.rows.filter(row => isUsableAnalogyOutcomeRecord(row, asOf));
  const seen = new Set<string>();
  const rows: AnalogyOutcomeRecord[] = [];
  let duplicateRows = 0;
  for (const row of validRows) {
    const key = `${row.eventId}__${row.timeframe}`;
    if (seen.has(key)) {
      duplicateRows += 1;
      continue;
    }
    seen.add(key);
    rows.push(row);
  }
  const warnings: string[] = [];
  const warning = formatReadOnlyJsonlParseWarning(path, parsed.parseErrors);
  if (warning) warnings.push(warning);
  const invalidRows = parsed.rows.length - validRows.length;
  if (invalidRows > 0) warnings.push(`${path}: invalid_shape ${invalidRows}`);
  if (duplicateRows > 0) warnings.push(`${path}: duplicate_identity ${duplicateRows}`);
  return {
    rows,
    warnings,
  };
}