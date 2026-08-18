export function normalizeStockProAgentReportText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
