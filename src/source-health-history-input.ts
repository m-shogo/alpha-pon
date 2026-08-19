import { addDaysJst } from "./date.js";

export type SourceHealthHistoryRow = {
  date?: string;
  reports?: Record<string, { exists?: boolean; size?: number }>;
};

type NormalizedSourceHealthHistory = {
  rows: SourceHealthHistoryRow[];
  invalidRows: number;
};

const REQUIRED_REPORT_KEYS = [
  "sourceHealth",
  "daily",
  "scores",
  "proposals",
  "stockPro",
  "regime",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalHistoryDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return addDaysJst(value, 0) === value ? value : null;
  } catch {
    return null;
  }
}

function isValidReportValue(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.exists !== undefined && typeof value.exists !== "boolean") return false;
  if (
    value.size !== undefined
    && (typeof value.size !== "number" || !Number.isSafeInteger(value.size) || value.size < 0)
  ) return false;
  return true;
}

function hasCanonicalReports(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return REQUIRED_REPORT_KEYS.every(key => key in value && isValidReportValue(value[key]));
}

export function normalizeSourceHealthHistoryRows(values: unknown[], asOf?: string): NormalizedSourceHealthHistory {
  const latestByDate = new Map<string, SourceHealthHistoryRow>();
  let invalidRows = 0;
  const cutoff = asOf === undefined ? null : canonicalHistoryDate(asOf);

  for (const value of values) {
    if (!isRecord(value)) {
      invalidRows += 1;
      continue;
    }

    const date = canonicalHistoryDate(value.date);
    if (!date || (asOf !== undefined && (!cutoff || date > cutoff))) {
      invalidRows += 1;
      continue;
    }

    if (!hasCanonicalReports(value.reports)) {
      invalidRows += 1;
      continue;
    }

    const malformedReport = Object.values(value.reports).some(report => !isValidReportValue(report));
    if (malformedReport) {
      invalidRows += 1;
      continue;
    }

    latestByDate.set(date, value as SourceHealthHistoryRow);
  }

  const rows = [...latestByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, row]) => row);
  return { rows, invalidRows };
}