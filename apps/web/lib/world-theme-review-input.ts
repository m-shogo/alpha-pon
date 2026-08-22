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

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isNonEmptyCanonicalString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim()
}

function isDueItem(value: unknown): value is WorldThemeReviewDueItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return isNonEmptyCanonicalString(row.hypothesisId)
    && isNonEmptyCanonicalString(row.dueAt)
    && (row.afterDays === 30 || row.afterDays === 90 || row.afterDays === 180)
    && isNonEmptyCanonicalString(row.sourceEventTitle)
    && isNonEmptyCanonicalString(row.theme)
    && isNonEmptyCanonicalString(row.candidateCode)
    && isNonEmptyCanonicalString(row.candidateCompany)
    && isNonEmptyCanonicalString(row.nextPrimaryCheck)
}

export function normalizeWorldThemeReviewInput(value: unknown): WorldThemeReviewInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>

  if (!Array.isArray(input.dueReviews) || !input.dueReviews.every(isDueItem)) return null
  if (input.generatedAt !== undefined && !isNonEmptyCanonicalString(input.generatedAt)) return null
  if (input.totalHypotheses !== undefined && !isFiniteNonNegativeNumber(input.totalHypotheses)) return null
  if (input.reviewedResults !== undefined && !isFiniteNonNegativeNumber(input.reviewedResults)) return null

  return {
    ...(input.generatedAt !== undefined ? { generatedAt: input.generatedAt } : {}),
    ...(input.totalHypotheses !== undefined ? { totalHypotheses: input.totalHypotheses } : {}),
    ...(input.reviewedResults !== undefined ? { reviewedResults: input.reviewedResults } : {}),
    dueReviews: input.dueReviews,
  }
}
