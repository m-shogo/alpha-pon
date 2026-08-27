import { addDaysJst, todayJst } from "./date.js";
import { normalizeRegimeHistoryActiveRegimes } from "./regime-history-input.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value === value.trim();
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
    isCanonicalNonBlankString(value.code) &&
    isCanonicalNonBlankString(value.name) &&
    isCanonicalNonBlankString(value.category) &&
    isCanonicalNonBlankString(value.hypothesis) &&
    isCanonicalNonBlankString(value.outcome) &&
    isUniqueNonBlankStringArray(value.nonMoveReasons) &&
    isCanonicalNonBlankString(value.lesson) &&
    isCanonicalNonBlankString(value.nextAction) &&
    isCanonicalNonBlankString(value.source)
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

const REQUIRED_SOURCE_HEALTH_REPORTS = [
  "sourceHealth",
  "daily",
  "scores",
  "proposals",
  "stockPro",
  "regime",
] as const;
const REQUIRED_SOURCE_HEALTH_REPORT_SET = new Set<string>(REQUIRED_SOURCE_HEALTH_REPORTS);

export function isUsableYearlySourceHealthHistory(value: unknown, asOf: string): boolean {
  if (!isRecord(value)) return false;
  if (!isRealDateOnOrBefore(value.date, asOf)) return false;
  if (!isRecord(value.reports)) return false;
  const reportNames = Object.keys(value.reports);
  if (
    reportNames.length !== REQUIRED_SOURCE_HEALTH_REPORTS.length ||
    reportNames.some(name => !REQUIRED_SOURCE_HEALTH_REPORT_SET.has(name))
  ) {
    return false;
  }
  if (!REQUIRED_SOURCE_HEALTH_REPORTS.every(name => Object.prototype.hasOwnProperty.call(value.reports, name))) {
    return false;
  }

  for (const report of Object.values(value.reports)) {
    if (!isRecord(report)) return false;
    if (typeof report.exists !== "boolean") return false;
    if (!Number.isSafeInteger(report.size) || (report.size as number) < 0) return false;
  }

  return true;
}