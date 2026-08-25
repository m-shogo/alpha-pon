import { addDaysJst } from "./date.js";

const DEFAULT_JQUANTS_DELAY_DAYS = 84;
const MAX_JQUANTS_DELAY_DAYS = 3650;

export function resolveWorldImpactEvaluationAsOf(raw: string | null, fallback: string): string {
  if (raw == null) return fallback;
  try {
    if (addDaysJst(raw, 0) !== raw) throw new Error("invalid date");
  } catch {
    throw new Error(`evaluate:world-impact --as-of requires a real YYYY-MM-DD date: ${raw}`);
  }
  return raw;
}

export function resolveWorldImpactJquantsDelayDays(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_JQUANTS_DELAY_DAYS;

  const value = raw.trim();
  if (!/^\d+$/.test(value)) return DEFAULT_JQUANTS_DELAY_DAYS;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_JQUANTS_DELAY_DAYS) {
    return DEFAULT_JQUANTS_DELAY_DAYS;
  }

  return parsed;
}
