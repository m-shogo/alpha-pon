import { addDaysJst } from "./date.js";

export function resolveWorldImpactEvaluationAsOf(raw: string | null, fallback: string): string {
  if (raw == null) return fallback;
  try {
    if (addDaysJst(raw, 0) !== raw) throw new Error("invalid date");
  } catch {
    throw new Error(`evaluate:world-impact --as-of requires a real YYYY-MM-DD date: ${raw}`);
  }
  return raw;
}
