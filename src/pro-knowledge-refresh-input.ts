import { addDaysJst } from "./date.js";
import { normalizeRegimeHistoryActiveRegimes } from "./regime-history-input.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUsableProKnowledgeRegimeAsOf(value: unknown, today: string): value is string {
  if (typeof value !== "string") return false;
  try {
    return addDaysJst(value, 0) === value && value <= today;
  } catch {
    return false;
  }
}

export function isUsableProKnowledgeRegime(value: unknown, today: string): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if (!isUsableProKnowledgeRegimeAsOf(value.asOf, today)) return false;
  if (value.summary !== undefined && typeof value.summary !== "string") return false;
  try {
    normalizeRegimeHistoryActiveRegimes(value.activeRegimes);
    return true;
  } catch {
    return false;
  }
}
