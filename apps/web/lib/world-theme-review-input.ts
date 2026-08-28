export type WorldThemeReviewDueItem = {
  hypothesisId: string
  dueAt: string
  afterDays: 30 | 90 | 180
  sourceEventTitle: string
  theme: string
  candidateCode: string
  candidateCompany: string
  nextPrimaryCheck: string
}

export type WorldThemeReviewInput = {
  generatedAt?: string
  totalHypotheses?: number
  reviewedResults?: number
  dueReviews: WorldThemeReviewDueItem[]
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isNonEmptyCanonicalString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim()
}

function isGregorianDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  return day <= daysInMonth
}

function isDueItem(value: unknown): value is WorldThemeReviewDueItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return isNonEmptyCanonicalString(row.hypothesisId)
    && isGregorianDate(row.dueAt)
    && (row.afterDays === 30 || row.afterDays === 90 || row.afterDays === 180)
    && isNonEmptyCanonicalString(row.sourceEventTitle)
    && isNonEmptyCanonicalString(row.theme)
    && isNonEmptyCanonicalString(row.candidateCode)
    && isNonEmptyCanonicalString(row.candidateCompany)
    && isNonEmptyCanonicalString(row.nextPrimaryCheck)
}

function hasUniqueDueReviewIdentities(rows: WorldThemeReviewDueItem[]): boolean {
  const identities = rows.map(row => `${row.hypothesisId}\u0000${row.afterDays}`)
  return new Set(identities).size === identities.length
}

export function normalizeWorldThemeReviewInput(value: unknown): WorldThemeReviewInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>

  if (!Array.isArray(input.dueReviews) || !input.dueReviews.every(isDueItem)) return null
  if (!hasUniqueDueReviewIdentities(input.dueReviews)) return null
  if (input.generatedAt !== undefined && !isGregorianDate(input.generatedAt)) return null
  if (
    typeof input.generatedAt === 'string'
    && input.dueReviews.some(row => row.dueAt > input.generatedAt!)
  ) return null
  if (input.totalHypotheses !== undefined && !isNonNegativeInteger(input.totalHypotheses)) return null
  if (input.reviewedResults !== undefined && !isNonNegativeInteger(input.reviewedResults)) return null
  if (
    typeof input.totalHypotheses === 'number'
    && typeof input.reviewedResults === 'number'
    && input.reviewedResults > input.totalHypotheses
  ) return null

  return {
    ...(input.generatedAt !== undefined ? { generatedAt: input.generatedAt } : {}),
    ...(input.totalHypotheses !== undefined ? { totalHypotheses: input.totalHypotheses } : {}),
    ...(input.reviewedResults !== undefined ? { reviewedResults: input.reviewedResults } : {}),
    dueReviews: input.dueReviews,
  }
}
