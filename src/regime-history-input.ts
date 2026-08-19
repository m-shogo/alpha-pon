import { addDaysJst } from "./date.js";

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
