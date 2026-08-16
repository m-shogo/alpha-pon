import { formatReadOnlyJsonlParseWarning, readJsonlWithErrors } from "./read-only-jsonl.js";

export type WorldThemeCandidateResultRecord = {
  theme: string;
  result: string;
  candidateCode: string;
  candidateCompany: string;
  reviewedAt: string;
  afterDays: number;
  memo: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isWorldThemeCandidateResultRecord(value: unknown): value is WorldThemeCandidateResultRecord {
  if (!isRecord(value)) return false;
  for (const key of ["theme", "result", "candidateCode", "candidateCompany", "reviewedAt", "memo"] as const) {
    if (typeof value[key] !== "string" || !value[key].trim()) return false;
  }
  return typeof value.afterDays === "number" && Number.isFinite(value.afterDays);
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
