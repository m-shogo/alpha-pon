import { normalizeRegimeHistoryActiveRegimes } from "./regime-history-input.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUsableYearlyRegimeHistory(value: unknown): boolean {
  if (!isRecord(value)) return false;
  try {
    normalizeRegimeHistoryActiveRegimes(value.activeRegimes);
    return true;
  } catch {
    return false;
  }
}
