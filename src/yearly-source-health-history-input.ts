function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUsableYearlySourceHealthHistory(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.reports === undefined) return true;
  if (!isRecord(value.reports)) return false;
  return Object.values(value.reports).every(report => {
    if (!isRecord(report)) return false;
    const exists = report.exists;
    const size = report.size;
    if (exists !== undefined && typeof exists !== "boolean") return false;
    if (size !== undefined && (!Number.isSafeInteger(size) || (size as number) < 0)) return false;
    return true;
  });
}
