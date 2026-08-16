export type SourceHealthHistoryRow = {
  date?: string;
  reports?: Record<string, { exists?: boolean; size?: number }>;
};

type NormalizedSourceHealthHistory = {
  rows: SourceHealthHistoryRow[];
  invalidRows: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidReportValue(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.exists !== undefined && typeof value.exists !== "boolean") return false;
  if (
    value.size !== undefined
    && (typeof value.size !== "number" || !Number.isFinite(value.size) || value.size < 0)
  ) return false;
  return true;
}

export function normalizeSourceHealthHistoryRows(values: unknown[]): NormalizedSourceHealthHistory {
  const rows: SourceHealthHistoryRow[] = [];
  let invalidRows = 0;

  for (const value of values) {
    if (!isRecord(value)) {
      invalidRows += 1;
      continue;
    }

    if (value.reports !== undefined) {
      if (!isRecord(value.reports)) {
        invalidRows += 1;
        continue;
      }
      const malformedReport = Object.values(value.reports).some(report => !isValidReportValue(report));
      if (malformedReport) {
        invalidRows += 1;
        continue;
      }
    }

    rows.push(value as SourceHealthHistoryRow);
  }

  return { rows, invalidRows };
}
