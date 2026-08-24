const DEFAULT_ANALOGY_REVIEW_MAX_PER_RUN = 12;
const MAX_ANALOGY_REVIEW_MAX_PER_RUN = 120;
const DEFAULT_ANALOGY_REVIEW_RELATIVE_THRESHOLD_PCT = 2;

export function parseAnalogyReviewMaxPerRun(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_ANALOGY_REVIEW_MAX_PER_RUN;

  const value = raw.trim();
  if (!/^\d+$/.test(value)) return DEFAULT_ANALOGY_REVIEW_MAX_PER_RUN;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return DEFAULT_ANALOGY_REVIEW_MAX_PER_RUN;

  return Math.min(parsed, MAX_ANALOGY_REVIEW_MAX_PER_RUN);
}

export function parseAnalogyReviewOffset(raw: string): number {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return 0;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return 0;

  return parsed;
}

export function parseAnalogyReviewRelativeThresholdPct(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_ANALOGY_REVIEW_RELATIVE_THRESHOLD_PCT;

  const value = raw.trim();
  if (value === "") return DEFAULT_ANALOGY_REVIEW_RELATIVE_THRESHOLD_PCT;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_ANALOGY_REVIEW_RELATIVE_THRESHOLD_PCT;

  return parsed;
}
