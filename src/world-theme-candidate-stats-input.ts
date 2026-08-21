import { todayJst } from "./date.js";
import { formatReadOnlyJsonlParseWarning, readJsonlWithErrors } from "./read-only-jsonl.js";
import { isValidWorldThemeReviewDueDate } from "./world-theme-review-date.js";

export type WorldThemeCandidateReviewResult = "hit" | "miss" | "too_early" | "priced_in" | "unclear";
export type WorldThemeCandidateReviewHorizon = 30 | 90 | 180;

export type WorldThemeCandidateResultRecord = {
  theme: string;
  result: WorldThemeCandidateReviewResult;
  candidateCode: string;
  candidateCompany: string;
  reviewedAt: string;
  afterDays: WorldThemeCandidateReviewHorizon;
  memo: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReviewResult(value: unknown): value is WorldThemeCandidateReviewResult {
  return value === "hit" || value === "miss" || value === "too_early" || value === "priced_in" || value === "unclear";
}

function isReviewHorizon(value: unknown): value is WorldThemeCandidateReviewHorizon {
  return value === 30 || value === 90 || value === 180;
}

export function isWorldThemeCandidateResultRecord(value: unknown): value is WorldThemeCandidateResultRecord {
  if (!isRecord(value)) return false;
  for (const key of ["theme", "candidateCode", "candidateCompany", "reviewedAt", "memo"] as const) {
    if (typeof value[key] !== "string" || !value[key].trim()) return false;
  }
  if (!isValidWorldThemeReviewDueDate(value.reviewedAt as string) || (value.reviewedAt as string) > todayJst()) return false;
  return isReviewResult(value.result) && isReviewHorizon(value.afterDays);
}

export function readWorldThemeCandidateStatsInput(path: string): {
  rows: WorldThemeCandidateResultRecord[];
  warning: string | null;
} {
  const result = readJsonlWithErrors<unknown>(path);
  const parseWarning = formatReadOnlyJsonlParseWarning(path, result.parseErrors);
  const rows = result.rows.filter(isWorldThemeCandidateResultRecord);
  const invalidCount = result.rows.length - rows.length;
  const warnings = [
    parseWarning,
    invalidCount > 0 ? `${path}: invalid_rows ${invalidCount}` : null,
  ].filter((warning): warning is string => warning !== null);

  return {
    rows,
    warning: warnings.length > 0 ? warnings.join("; ") : null,
  };
}
