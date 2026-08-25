import { addDaysJst } from "./date.js";

const DEFAULT_JQUANTS_DELAY_DAYS = 84;
const MAX_JQUANTS_DELAY_DAYS = 3650;

function requireRealCanonicalJstDate(value: string, field: string): string {
  try {
    if (addDaysJst(value, 0) !== value) throw new Error("invalid date");
  } catch {
    throw new Error(`${field} requires a real YYYY-MM-DD date: ${value}`);
  }
  return value;
}

export function resolveWorldImpactEvaluationAsOf(raw: string | null, fallback: string): string {
  const canonicalFallback = requireRealCanonicalJstDate(fallback, "evaluate:world-impact fallback as-of");
  if (raw == null) return canonicalFallback;

  const canonicalAsOf = requireRealCanonicalJstDate(raw, "evaluate:world-impact --as-of");
  if (canonicalAsOf > canonicalFallback) {
    throw new Error(`evaluate:world-impact --as-of must not be in the future: ${canonicalAsOf}`);
  }
  return canonicalAsOf;
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
