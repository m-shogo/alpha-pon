const DEFAULT_CATCHUP_DAYS = 7;
const MAX_CATCHUP_DAYS = 90;

export function parseCatchupDays(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_CATCHUP_DAYS;

  const value = raw.trim();
  if (!/^\d+$/.test(value)) return DEFAULT_CATCHUP_DAYS;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return DEFAULT_CATCHUP_DAYS;

  return Math.min(parsed, MAX_CATCHUP_DAYS);
}
