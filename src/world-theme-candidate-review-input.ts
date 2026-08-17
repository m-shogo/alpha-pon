import { formatReadOnlyJsonlParseWarning, readJsonlWithErrors } from "./read-only-jsonl.js";

export type WorldThemeReviewDue = {
  afterDays: 30 | 90 | 180;
  dueAt: string;
  status: "open" | "reviewed";
};

export type PersistedWorldThemeCandidateHypothesis = {
  schemaVersion?: 1;
  hypothesisId: string;
  detectedAt: string;
  sourceEventTitle: string;
  theme: string;
  candidateCode: string;
  candidateCompany: string;
  whyThisCompany?: string;
  upsideHypothesis?: string;
  downsideRisk?: string;
  nextPrimaryCheck: string;
  reviewDueDates: WorldThemeReviewDue[];
  status?: "open" | "closed";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReviewDue(value: unknown): value is WorldThemeReviewDue {
  if (!isRecord(value)) return false;
  return (
    (value.afterDays === 30 || value.afterDays === 90 || value.afterDays === 180) &&
    typeof value.dueAt === "string" &&
    (value.status === "open" || value.status === "reviewed")
  );
}

function hasUniqueReviewHorizons(reviewDueDates: WorldThemeReviewDue[]): boolean {
  const horizons = reviewDueDates.map(due => due.afterDays);
  return new Set(horizons).size === horizons.length;
}

export function isWorldThemeCandidateReviewInput(value: unknown): value is PersistedWorldThemeCandidateHypothesis {
  if (!isRecord(value)) return false;
  for (const key of [
    "hypothesisId",
    "detectedAt",
    "sourceEventTitle",
    "theme",
    "candidateCode",
    "candidateCompany",
    "nextPrimaryCheck",
  ] as const) {
    if (typeof value[key] !== "string" || !value[key].trim()) return false;
  }
  if (!Array.isArray(value.reviewDueDates) || !value.reviewDueDates.every(isReviewDue)) return false;
  return hasUniqueReviewHorizons(value.reviewDueDates);
}

export function readWorldThemeCandidateReviewInput(path: string): {
  rows: PersistedWorldThemeCandidateHypothesis[];
  warning: string | null;
} {
  const result = readJsonlWithErrors<unknown>(path);
  const parseWarning = formatReadOnlyJsonlParseWarning(path, result.parseErrors);
  const rows = result.rows.filter(isWorldThemeCandidateReviewInput);
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
