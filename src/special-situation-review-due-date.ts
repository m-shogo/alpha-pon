import { addDaysJst } from "./date.js";
import type { ReviewHorizon } from "./universe.js";

const HORIZON_DAYS: Record<ReviewHorizon, number> = { "1d": 1, "1w": 7, "1m": 30, "3m": 90 };

export function calcSpecialSituationDueAt(
  detectedAt: string | null | undefined,
  horizon: ReviewHorizon,
): string | null {
  if (!detectedAt) return null;
  try {
    return addDaysJst(detectedAt, HORIZON_DAYS[horizon] ?? 30);
  } catch {
    return null;
  }
}
