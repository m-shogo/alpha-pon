const DEFAULT_EDINET_ANNUAL_DAYS = 60;

export function resolveEdinetAnnualScanDays(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_EDINET_ANNUAL_DAYS;
  if (!/^\d+$/.test(value)) return DEFAULT_EDINET_ANNUAL_DAYS;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return DEFAULT_EDINET_ANNUAL_DAYS;
  return parsed;
}
