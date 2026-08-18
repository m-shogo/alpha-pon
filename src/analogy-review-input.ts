import { existsSync, readdirSync } from "fs";
import { join } from "path";
import type { AnalogyOutcomeRecord, AnalogyPredictionRecord } from "./analysis/analogy-db.js";
import { addDaysJst } from "./date.js";
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

function isRealJstDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function isUsableAnalogyPredictionRecord(value: unknown): value is AnalogyPredictionRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    row.schemaVersion === 1 &&
    typeof row.createdAt === "string" &&
    typeof row.reviewDueAt === "string" &&
    typeof row.eventId === "string" && row.eventId.trim().length > 0 &&
    (row.timeframe === "1d" || row.timeframe === "1w" || row.timeframe === "1m") &&
    (row.candidateCode === undefined || typeof row.candidateCode === "string") &&
    (row.candidateName === undefined || typeof row.candidateName === "string") &&
    typeof row.lessonId === "string" &&
    typeof row.lessonTitle === "string" &&
    typeof row.thesis === "string" &&
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
    typeof row.eventId === "string" && row.eventId.trim().length > 0 &&
    (row.timeframe === "1d" || row.timeframe === "1w" || row.timeframe === "1m") &&
    typeof row.lessonId === "string" &&
    typeof row.lessonTitle === "string" &&
    (row.direction === "same" || row.direction === "opposite" || row.direction === "mixed" || row.direction === "unknown") &&
    (row.quality === "useful" || row.quality === "misleading" || row.quality === "too_early" || row.quality === "unknown") &&
    typeof row.actualOutcome === "string" &&
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

export function loadAnalogyOutcomesForReview(path: string, asOf: string): AnalogyReviewOutcomeInput {
  if (!isRealJstDate(asOf)) {
    throw new Error("analogy review asOf must be a real YYYY-MM-DD date");
  }
  const parsed = readJsonlWithErrors<unknown>(path);
  const validRows = parsed.rows.filter(row => isUsableAnalogyOutcomeRecord(row, asOf));
  const warnings: string[] = [];
  const warning = formatReadOnlyJsonlParseWarning(path, parsed.parseErrors);
  if (warning) warnings.push(warning);
  const invalidRows = parsed.rows.length - validRows.length;
  if (invalidRows > 0) warnings.push(`${path}: invalid_shape ${invalidRows}`);
  return {
    rows: validRows,
    warnings,
  };
}
