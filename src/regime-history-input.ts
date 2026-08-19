import { addDaysJst } from "./date.js";

export type RegimeHistoryActiveRegime = {
  id: string;
  level: string;
  why: string;
  watchCategories: string[];
  caution: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalStringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array of strings`);
  if (value.some(item => typeof item !== "string")) throw new Error(`${field} must be an array of strings`);
  return value as string[];
}

export function normalizeRegimeHistoryActiveRegimes(value: unknown): RegimeHistoryActiveRegime[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("current regime activeRegimes must be an array");

  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`current regime activeRegimes[${index}] must be an object`);
    if (typeof item.id !== "string" || item.id.trim().length === 0) {
      throw new Error(`current regime activeRegimes[${index}].id must be a non-empty string`);
    }
    if (typeof item.level !== "string" || item.level.trim().length === 0) {
      throw new Error(`current regime activeRegimes[${index}].level must be a non-empty string`);
    }
    if (typeof item.why !== "string" || item.why.trim().length === 0) {
      throw new Error(`current regime activeRegimes[${index}].why must be a non-empty string`);
    }
    return {
      id: item.id,
      level: item.level,
      why: item.why,
      watchCategories: canonicalStringArray(item.watchCategories, `current regime activeRegimes[${index}].watchCategories`),
      caution: canonicalStringArray(item.caution, `current regime activeRegimes[${index}].caution`),
    };
  });
}

export function resolveRegimeHistoryAsOf(value: unknown, historyDate: string): string {
  let canonicalHistoryDate: string;
  try {
    canonicalHistoryDate = addDaysJst(historyDate, 0);
  } catch {
    throw new Error("regime history date must be a real YYYY-MM-DD date");
  }
  if (canonicalHistoryDate !== historyDate) {
    throw new Error("regime history date must be a canonical YYYY-MM-DD date");
  }

  if (value === undefined) return historyDate;
  if (typeof value !== "string") {
    throw new Error("current regime asOf must be a real YYYY-MM-DD date");
  }

  let canonicalAsOf: string;
  try {
    canonicalAsOf = addDaysJst(value, 0);
  } catch {
    throw new Error("current regime asOf must be a real YYYY-MM-DD date");
  }
  if (canonicalAsOf !== value) {
    throw new Error("current regime asOf must be a canonical YYYY-MM-DD date");
  }
  if (value > historyDate) {
    throw new Error("current regime asOf must not be after the history date");
  }
  return value;
}
