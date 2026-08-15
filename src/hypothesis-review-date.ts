import { addDaysJst } from "./date.js";

export type DetectedAtHypothesis = {
  detectedAt: string | null | undefined;
};

export function partitionHypothesesByDetectedAt<T extends DetectedAtHypothesis>(
  hypotheses: T[],
): { valid: T[]; invalid: T[] } {
  const valid: T[] = [];
  const invalid: T[] = [];
  for (const hypothesis of hypotheses) {
    if (!hypothesis.detectedAt) {
      invalid.push(hypothesis);
      continue;
    }
    try {
      addDaysJst(hypothesis.detectedAt, 0);
      valid.push(hypothesis);
    } catch {
      invalid.push(hypothesis);
    }
  }
  return { valid, invalid };
}
