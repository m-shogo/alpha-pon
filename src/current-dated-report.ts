export function normalizeCurrentDatedReportText(value: unknown, asOf: string): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text) return "";
  const reportDate = text.match(/^date: (\d{4}-\d{2}-\d{2})$/m)?.[1];
  return reportDate === asOf ? text : "";
}
