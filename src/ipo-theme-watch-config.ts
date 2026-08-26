const DEFAULT_IPO_THEME_MIN_SAMPLE_SIZE = 5;

export function resolveIpoThemeMinSampleSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return DEFAULT_IPO_THEME_MIN_SAMPLE_SIZE;
  }
  return value;
}
