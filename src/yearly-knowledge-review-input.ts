import { addDaysJst, todayJst } from "./date.js";
import { normalizeRegimeHistoryActiveRegimes } from "./regime-history-input.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUniqueNonBlankStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  const items = value.filter((item): item is string => typeof item === "string");
  return (
    items.length === value.length &&
    items.every(item => item.trim().length > 0 && item === item.trim()) &&
    new Set(items).size === items.length
  );
}

function isRealDateOnOrBefore(value: unknown, asOf: string): boolean {
  if (typeof value !== "string") return false;
  try {
    return addDaysJst(value, 0) === value && value <= asOf;
  } catch {
    return false;
  }
}

export function isUsableYearlyNonMoveHistory(value: unknown, asOf = todayJst()): boolean {
  if (!isRecord(value)) return false;
  if (!isRealDateOnOrBefore(value.date, asOf)) return false;
  return (
    typeof value.code === "string" &&
    typeof value.name === "string" &&
    typeof value.category === "string" &&
    typeof value.hypothesis === "string" &&
    typeof value.outcome === "string" &&
    isUniqueNonBlankStringArray(value.nonMoveReasons) &&
    typeof value.lesson === "string" &&
    typeof value.nextAction === "string" &&
    typeof value.source === "string"
  );
}

export function isUsableYearlyRegimeHistory(value: unknown, asOf = todayJst()): boolean {
  if (!isRecord(value)) return false;
  if (!isRealDateOnOrBefore(value.date, asOf)) return false;
  try {
    normalizeRegimeHistoryActiveRegimes(value.activeRegimes);
    return true;
  } catch {
    return false;
  }
}

export function isUsableYearlySourceHealthHistory(value: unknown, asOf: string): boolean {
  if (!isRecord(value)) return false;
  if (!isRealDateOnOrBefore(value.date, asOf)) return false;
  if (!isRecord(value.reports)) return false;

  for (const report of Object.values(value.reports)) {
    if (!isRecord(report)) return false;
    if (typeof report.exists !== "boolean") return false;
    if (!Number.isSafeInteger(report.size) || (report.size as number) < 0) return false;
  }

  return true;
}
