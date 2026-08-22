export type WorldThemeCandidateReviewResult = 'hit' | 'miss' | 'too_early' | 'priced_in' | 'unclear'
export type WorldThemeCandidateReviewHorizon = 30 | 90 | 180

export type WorldThemeCandidateStatsRow = {
  theme: string
  candidateCode: string
  candidateCompany: string
  reviewedAt: string
  afterDays: WorldThemeCandidateReviewHorizon
  result: WorldThemeCandidateReviewResult
  memo: string
}

export type WorldThemeCandidateThemeStat = {
  theme: string
  total: number
  resultCounts: Record<WorldThemeCandidateReviewResult, number> | Partial<Record<WorldThemeCandidateReviewResult, number>>
  recent: WorldThemeCandidateStatsRow[]
}

export type WorldThemeCandidateStats = {
  generatedAt: string
  total: number
  byTheme: WorldThemeCandidateThemeStat[]
  recent: WorldThemeCandidateStatsRow[]
  inputWarnings: string[]
}

export type GeneratedWorldThemeStatsInputResult = {
  value: WorldThemeCandidateStats | null
  warning: string | null
}

const RESULTS = new Set<WorldThemeCandidateReviewResult>(['hit', 'miss', 'too_early', 'priced_in', 'unclear'])
const HORIZONS = new Set<WorldThemeCandidateReviewHorizon>([30, 90, 180])
const CANONICAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyCanonicalString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim()
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isCanonicalPastOrPresentDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = CANONICAL_DATE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false
  const now = new Date()
  const tokyoNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const todayJst = `${tokyoNow.getUTCFullYear().toString().padStart(4, '0')}-${(tokyoNow.getUTCMonth() + 1).toString().padStart(2, '0')}-${tokyoNow.getUTCDate().toString().padStart(2, '0')}`
  return value <= todayJst
}

function isStatsRow(value: unknown): value is WorldThemeCandidateStatsRow {
  if (!isRecord(value)) return false
  return isNonEmptyCanonicalString(value.theme)
    && isNonEmptyCanonicalString(value.candidateCode)
    && isNonEmptyCanonicalString(value.candidateCompany)
    && isCanonicalPastOrPresentDate(value.reviewedAt)
    && typeof value.afterDays === 'number'
    && HORIZONS.has(value.afterDays as WorldThemeCandidateReviewHorizon)
    && typeof value.result === 'string'
    && RESULTS.has(value.result as WorldThemeCandidateReviewResult)
    && typeof value.memo === 'string'
}

function isResultCounts(value: unknown, expectedTotal: number): boolean {
  if (!isRecord(value)) return false
  let total = 0
  for (const [key, count] of Object.entries(value)) {
    if (!RESULTS.has(key as WorldThemeCandidateReviewResult) || !isNonNegativeInteger(count)) return false
    total += count
  }
  return total === expectedTotal
}

function isThemeStat(value: unknown): value is WorldThemeCandidateThemeStat {
  if (!isRecord(value) || !isNonEmptyCanonicalString(value.theme) || !isNonNegativeInteger(value.total)) return false
  if (!Array.isArray(value.recent) || !value.recent.every(isStatsRow)) return false
  if (!value.recent.every((row) => row.theme === value.theme)) return false
  return value.recent.length <= value.total && isResultCounts(value.resultCounts, value.total)
}

export function isGeneratedWorldThemeStatsInput(value: unknown): value is WorldThemeCandidateStats {
  if (!isRecord(value)) return false
  if (!isCanonicalPastOrPresentDate(value.generatedAt) || !isNonNegativeInteger(value.total)) return false
  if (!Array.isArray(value.byTheme) || !value.byTheme.every(isThemeStat)) return false
  if (!Array.isArray(value.recent) || !value.recent.every(isStatsRow) || value.recent.length > value.total) return false
  if (!Array.isArray(value.inputWarnings) || !value.inputWarnings.every((warning) => typeof warning === 'string')) return false
  if (new Set(value.byTheme.map((stat) => stat.theme)).size !== value.byTheme.length) return false
  return value.byTheme.reduce((sum, stat) => sum + stat.total, 0) === value.total
}

export function normalizeGeneratedWorldThemeStatsInput(value: unknown): GeneratedWorldThemeStatsInputResult {
  if (value === undefined || value === null) return { value: null, warning: null }
  if (!isGeneratedWorldThemeStatsInput(value)) {
    return { value: null, warning: 'world_theme_candidate_stats: invalid_shape' }
  }
  return { value, warning: null }
}
