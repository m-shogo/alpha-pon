import { todayJst } from "./date.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isStrictGregorianDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isCurrentStockProCommitteeGeneratedAt(value: unknown, asOf = todayJst()): value is string {
  return isStrictGregorianDate(value) && value === asOf;
}

export function isStockProCommitteeDecision(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return isCanonicalText(value.code)
    && isCanonicalText(value.name)
    && isCanonicalText(value.finalLabel)
    && typeof value.finalScore === "number"
    && Number.isFinite(value.finalScore)
    && (value.originalFinalLabel === undefined || value.originalFinalLabel === null || isCanonicalText(value.originalFinalLabel));
}
