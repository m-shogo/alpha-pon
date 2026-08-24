const DEFAULT_PRIMARY_DISCLOSURE_EDINET_DAYS = 5;
const MAX_PRIMARY_DISCLOSURE_EDINET_DAYS = 30;

export function parsePrimaryDisclosureEdinetDays(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_PRIMARY_DISCLOSURE_EDINET_DAYS;

  const value = raw.trim();
  if (!/^\d+$/.test(value)) return DEFAULT_PRIMARY_DISCLOSURE_EDINET_DAYS;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return DEFAULT_PRIMARY_DISCLOSURE_EDINET_DAYS;

  return Math.min(parsed, MAX_PRIMARY_DISCLOSURE_EDINET_DAYS);
}
