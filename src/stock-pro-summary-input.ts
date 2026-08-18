export function normalizeStockProAgentReportText(value: unknown, asOf?: string): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text) return "";
  if (asOf) {
    const generatedAt = text.match(/^生成日: (\d{4}-\d{2}-\d{2})$/m)?.[1];
    if (generatedAt !== asOf) return "";
  }
  return text;
}
