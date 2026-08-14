import { addDaysJst } from "./date.js";
import type { ReviewHorizon } from "./universe.js";

const HORIZON_DAYS: Record<ReviewHorizon, number> = { "1d": 1, "1w": 7, "1m": 30, "3m": 90 };

type DetectedAtOutcome = {
  hypothesis: { detectedAt: string | null | undefined };
  reviewHorizon: ReviewHorizon;
};

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

export function partitionSpecialSituationOutcomesByDetectedAt<T extends DetectedAtOutcome>(
  outcomes: T[],
): { valid: T[]; invalid: T[] } {
  const valid: T[] = [];
  const invalid: T[] = [];
  for (const outcome of outcomes) {
    if (calcSpecialSituationDueAt(outcome.hypothesis.detectedAt, outcome.reviewHorizon) === null) {
      invalid.push(outcome);
    } else {
      valid.push(outcome);
    }
  }
  return { valid, invalid };
}
