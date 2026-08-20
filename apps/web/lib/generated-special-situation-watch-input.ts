type SpecialSituationWatchCandidate = {
  code: string
  name?: string
  [key: string]: unknown
}

type TopChanceCandidate = Record<string, unknown> & {
  code: string
  name: string
  finalLabel: string
  chanceLevel: string
  reasonSummary: string
  mainRisks: string[]
  nextCheck: string[]
  whyNow: string[]
  whyNotNow: string[]
}

type SpecialSituationWatchInput = Record<string, unknown> & {
  candidates?: SpecialSituationWatchCandidate[]
  topChanceList?: TopChanceCandidate[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCanonicalText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function isCanonicalCode(value: unknown): value is string {
  return isCanonicalText(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isCandidate(value: unknown): value is SpecialSituationWatchCandidate {
  return isRecord(value) && isCanonicalCode(value.code)
}

function hasValidThemeCompanyFitSummary(value: unknown): boolean {
  if (value === undefined || value === null) return true
  return isRecord(value)
    && typeof value.themeLabel === 'string'
    && typeof value.selectedCompanyFit === 'string'
    && isStringArray(value.betterCompanyCodes)
}

function hasValidSellerPressureSummary(value: unknown): boolean {
  if (value === undefined || value === null) return true
  return isRecord(value)
    && typeof value.sellerType === 'string'
    && (value.sellerName === null || typeof value.sellerName === 'string')
    && typeof value.remainingOverhang === 'string'
}

function hasValidListingInfo(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (!isRecord(value)) return false
  for (const key of ['listedAt', 'plannedListingAt', 'lockupExpiryAt', 'firstEarningsAt', 'confidence'] as const) {
    if (value[key] !== undefined && value[key] !== null && typeof value[key] !== 'string') return false
  }
  return true
}

function isTopChanceCandidate(value: unknown): value is TopChanceCandidate {
  if (!isRecord(value)) return false
  return isCanonicalCode(value.code)
    && isCanonicalText(value.name)
    && typeof value.finalLabel === 'string'
    && typeof value.chanceLevel === 'string'
    && typeof value.reasonSummary === 'string'
    && isStringArray(value.mainRisks)
    && isStringArray(value.nextCheck)
    && isStringArray(value.whyNow)
    && isStringArray(value.whyNotNow)
    && hasValidThemeCompanyFitSummary(value.themeCompanyFitSummary)
    && hasValidSellerPressureSummary(value.sellerPressureSummary)
    && hasValidListingInfo(value.listingInfo)
}

function normalizeRows<T>(
  value: unknown,
  field: string,
  predicate: (row: unknown) => row is T,
): { rows: T[] | undefined; warning: string | null } {
  if (value === undefined) return { rows: undefined, warning: null }
  if (!Array.isArray(value)) return { rows: [], warning: `${field}: invalid_shape` }
  const rows = value.filter(predicate)
  return {
    rows,
    warning: rows.length === value.length ? null : `${field}: invalid_rows ${value.length - rows.length}`,
  }
}

export function normalizeGeneratedSpecialSituationWatchInput(value: unknown): {
  value: SpecialSituationWatchInput | null
  warning: string | null
} {
  if (value === undefined || value === null) return { value: null, warning: null }
  if (!isRecord(value)) return { value: null, warning: 'specialSituationWatch: invalid_shape' }

  const candidates = normalizeRows(value.candidates, 'specialSituationWatch.candidates', isCandidate)
  const topChanceList = normalizeRows(value.topChanceList, 'specialSituationWatch.topChanceList', isTopChanceCandidate)
  const warnings = [candidates.warning, topChanceList.warning].filter((warning): warning is string => Boolean(warning))

  return {
    value: {
      ...value,
      ...(candidates.rows === undefined ? {} : { candidates: candidates.rows }),
      ...(topChanceList.rows === undefined ? {} : { topChanceList: topChanceList.rows }),
    },
    warning: warnings.length > 0 ? warnings.join('; ') : null,
  }
}
