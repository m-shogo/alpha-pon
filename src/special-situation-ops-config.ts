export const SPECIAL_SITUATION_MIN_SAMPLE_SIZE_DEFAULT = 5;

export function resolveSpecialSituationMinSampleSize(value: unknown): number {
  if (typeof value !== "number") return SPECIAL_SITUATION_MIN_SAMPLE_SIZE_DEFAULT;
  if (!Number.isSafeInteger(value) || value <= 0) return SPECIAL_SITUATION_MIN_SAMPLE_SIZE_DEFAULT;
  return value;
}
