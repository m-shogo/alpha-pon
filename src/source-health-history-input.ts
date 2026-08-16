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
      const malformedReport = Object.values(value.reports).some(report => !isRecord(report));
      if (malformedReport) {
        invalidRows += 1;
        continue;
      }
    }

    rows.push(value as SourceHealthHistoryRow);
  }

  return { rows, invalidRows };
}
