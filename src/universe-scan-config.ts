const DEFAULT_UNIVERSE_SCAN_MAX_PER_RUN = 8;
const MAX_UNIVERSE_SCAN_MAX_PER_RUN = 120;

export function parseUniverseScanMaxPerRun(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_UNIVERSE_SCAN_MAX_PER_RUN;

  const value = raw.trim();
  if (!/^\d+$/.test(value)) return DEFAULT_UNIVERSE_SCAN_MAX_PER_RUN;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return DEFAULT_UNIVERSE_SCAN_MAX_PER_RUN;

  return Math.min(parsed, MAX_UNIVERSE_SCAN_MAX_PER_RUN);
}

export function parseUniverseScanOffset(raw: string): number {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return 0;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return 0;

  return parsed;
}
