export type GeneratedArrayInput<T> = {
  rows: T[]
  warning: string | null
}

export type GeneratedObjectInput = {
  object: Record<string, unknown>
  warning: string | null
}

export type GeneratedRecordInput<T> = {
  record: Record<string, T>
  warning: string | null
}

export type GeneratedWarningsInput = {
  warnings: string[]
  warning: string | null
}

export type GeneratedRunCursorState = {
  jobName?: string
  offset?: number
  maxPerRun?: number
  total?: number
  updatedAt?: string
}

export type GeneratedReportInput = {
  key: string
  label: string
  path: string
  available: boolean
  excerpt: string[]
  fullContent?: string
}

export type GeneratedWorldThemeCandidateHypothesisInput = {
  sourceEventTitle: string
  sourceEventPublishedAt: string | null
  theme: string
  candidateCode: string
  candidateCompany: string
  whyThisCompany: string
  upsideHypothesis: string
  downsideRisk: string
  nextPrimaryCheck: string
  reviewAfterDays: [30, 90, 180]
  disclaimer: string
}

export type GeneratedPipelineStepInput = {
  name: string
  criticality: string
  status: string
  code: number
  durationSec: number
}

export type GeneratedPipelineStatusInput = {
  date?: string
  status?: string
  startedAt?: string
  endedAt?: string
  failedSteps?: string[]
  completeWrapperFailedSteps?: string[]
  completeWrapperRunAt?: string
  steps?: GeneratedPipelineStepInput[]
}

const HYPOTHESIS_OUTCOME_REVIEW_HORIZONS = new Set(['1d', '1w', '1m', '3m'])
const HYPOTHESIS_OUTCOME_ACTION_LABELS = new Set(['watch', 'log', 'ignore'])
const HYPOTHESIS_OUTCOME_RESULTS = new Set(['hit', 'miss', 'too_early', 'invalidated', 'unknown'])
const UNIVERSE_CANDIDATE_STATUSES = new Set(['monitoring', 'escalated', 'dismissed'])
const UNIVERSE_CANDIDATE_DATA_SOURCES = new Set(['jquants', 'mock'])

function isCanonicalHypothesisOutcomeDiscriminators(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.reviewHorizon === 'string'
    && HYPOTHESIS_OUTCOME_REVIEW_HORIZONS.has(row.reviewHorizon)
    && typeof row.actionLabel === 'string'
    && HYPOTHESIS_OUTCOME_ACTION_LABELS.has(row.actionLabel)
    && typeof row.result === 'string'
    && HYPOTHESIS_OUTCOME_RESULTS.has(row.result)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function hasCanonicalHypothesisPredictionCollections(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return isStringArray(row.invalidationSignals)
    && isStringArray(row.evidenceNeeded)
    && isStringArray(row.relatedWorldEventIds)
    && isStringArray(row.relatedDisclosureIds)
}

function hasCanonicalHypothesisPredictionConfidence(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const confidence = (value as Record<string, unknown>).confidence
  return typeof confidence === 'number'
    && Number.isFinite(confidence)
    && confidence >= 0
    && confidence <= 1
}

function isFiniteNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isCanonicalDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [yearText, monthText, dayText] = value.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (year < 1) return false
  const instant = new Date(Date.UTC(year, month - 1, day))
  return instant.getUTCFullYear() === year && instant.getUTCMonth() === month - 1 && instant.getUTCDate() === day
}

function isCanonicalPastOrTodayDate(value: unknown): value is string {
  if (!isCanonicalDate(value)) return false
  const todayInTokyo = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  return value <= todayInTokyo
}

function hasCanonicalHypothesisPredictionTemporalProvenance(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return isCanonicalPastOrTodayDate(row.detectedAt)
    && isCanonicalDate(row.reviewDueAt)
    && row.reviewDueAt >= row.detectedAt
}

function isCanonicalCandidateIdentity(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const code = (value as Record<string, unknown>).code
  return typeof code === 'string' && code.length > 0 && code === code.trim()
}

function isCanonicalUniverseCandidate(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.code === 'string'
    && row.code.trim().length > 0
    && row.code === row.code.trim()
    && typeof row.name === 'string'
    && (row.sector === null || typeof row.sector === 'string')
    && isCanonicalPastOrTodayDate(row.detectedAt)
    && isFiniteNumberOrNull(row.currentPrice)
    && isFiniteNumberOrNull(row.high52w)
    && isFiniteNumberOrNull(row.drawdownPct)
    && isFiniteNumberOrNull(row.operatingProfitYoY)
    && typeof row.hasDownwardRevision === 'boolean'
    && typeof row.hasNegativeFlag === 'boolean'
    && typeof row.hasRecentDisclosure === 'boolean'
    && isStringArray(row.matchedWorldEventTags)
    && typeof row.screeningScore === 'number'
    && Number.isFinite(row.screeningScore)
    && row.screeningScore >= 0
    && row.screeningScore <= 100
    && isStringArray(row.warnings)
    && typeof row.status === 'string'
    && UNIVERSE_CANDIDATE_STATUSES.has(row.status)
    && typeof row.dataSource === 'string'
    && UNIVERSE_CANDIDATE_DATA_SOURCES.has(row.dataSource)
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function isGeneratedRunCursorState(value: unknown): value is GeneratedRunCursorState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return (row.jobName === undefined || typeof row.jobName === 'string')
    && (row.offset === undefined || isNonNegativeSafeInteger(row.offset))
    && (row.maxPerRun === undefined || isNonNegativeSafeInteger(row.maxPerRun))
    && (row.total === undefined || isNonNegativeSafeInteger(row.total))
    && (row.updatedAt === undefined || isCanonicalPastOrTodayDate(row.updatedAt))
}

export function isGeneratedReportInput(value: unknown): value is GeneratedReportInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.key === 'string'
    && typeof row.label === 'string'
    && typeof row.path === 'string'
    && typeof row.available === 'boolean'
    && Array.isArray(row.excerpt)
    && row.excerpt.every((item) => typeof item === 'string')
    && (row.fullContent === undefined || typeof row.fullContent === 'string')
}

export function isGeneratedWorldThemeCandidateHypothesisInput(
  value: unknown,
): value is GeneratedWorldThemeCandidateHypothesisInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  const reviewAfterDays = row.reviewAfterDays
  return typeof row.sourceEventTitle === 'string'
    && (row.sourceEventPublishedAt === null || isCanonicalPastOrTodayDate(row.sourceEventPublishedAt))
    && typeof row.theme === 'string'
    && typeof row.candidateCode === 'string'
    && typeof row.candidateCompany === 'string'
    && typeof row.whyThisCompany === 'string'
    && typeof row.upsideHypothesis === 'string'
    && typeof row.downsideRisk === 'string'
    && typeof row.nextPrimaryCheck === 'string'
    && Array.isArray(reviewAfterDays)
    && reviewAfterDays.length === 3
    && reviewAfterDays[0] === 30
    && reviewAfterDays[1] === 90
    && reviewAfterDays[2] === 180
    && typeof row.disclaimer === 'string'
}

function isGeneratedPipelineStepInput(value: unknown): value is GeneratedPipelineStepInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.name === 'string'
    && typeof row.criticality === 'string'
    && typeof row.status === 'string'
    && typeof row.code === 'number'
    && Number.isFinite(row.code)
    && typeof row.durationSec === 'number'
    && Number.isFinite(row.durationSec)
    && row.durationSec >= 0
}

export function isGeneratedPipelineStatusInput(value: unknown): value is GeneratedPipelineStatusInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  const failedSteps = row.failedSteps
  if (failedSteps !== undefined
    && (!Array.isArray(failedSteps) || !failedSteps.every((item) => typeof item === 'string'))) return false
  if (row.status === 'ok' && Array.isArray(failedSteps) && failedSteps.length > 0) return false

  return (row.date === undefined || isCanonicalPastOrTodayDate(row.date))
    && (row.status === undefined || typeof row.status === 'string')
    && (row.startedAt === undefined || typeof row.startedAt === 'string')
    && (row.endedAt === undefined || typeof row.endedAt === 'string')
    && (row.completeWrapperFailedSteps === undefined
      || (Array.isArray(row.completeWrapperFailedSteps)
        && row.completeWrapperFailedSteps.every((item) => typeof item === 'string')))
    && (row.completeWrapperRunAt === undefined || typeof row.completeWrapperRunAt === 'string')
    && (row.steps === undefined || (Array.isArray(row.steps) && row.steps.every(isGeneratedPipelineStepInput)))
}

export function normalizeGeneratedWarningsInput(
  value: unknown,
  field = 'meta.warnings',
): GeneratedWarningsInput {
  if (value === undefined) return { warnings: [], warning: null }
  if (!Array.isArray(value)) {
    return { warnings: [], warning: `${field}: invalid_root (expected string array)` }
  }

  const warnings = value.filter((item): item is string => typeof item === 'string')
  const invalidEntries = value.length - warnings.length
  return {
    warnings,
    warning: invalidEntries > 0 ? `${field}: invalid_entries (${invalidEntries})` : null,
  }
}

export function normalizeGeneratedArrayInput<T>(
  value: unknown,
  field: string,
  isValidEntry?: (value: unknown) => value is T,
): GeneratedArrayInput<T> {
  if (value === undefined) return { rows: [], warning: null }
  if (!Array.isArray(value)) {
    return { rows: [], warning: `${field}: invalid_root (expected array)` }
  }
  if (!isValidEntry) return { rows: value as T[], warning: null }

  const validRows = value.filter((entry): entry is T => (
    isValidEntry(entry)
    && (field !== 'candidates' || isCanonicalCandidateIdentity(entry))
    && (field !== 'hypothesisPredictions' || hasCanonicalHypothesisPredictionCollections(entry))
    && (field !== 'hypothesisPredictions' || hasCanonicalHypothesisPredictionConfidence(entry))
    && (field !== 'hypothesisPredictions' || hasCanonicalHypothesisPredictionTemporalProvenance(entry))
    && (field !== 'hypothesisOutcomes' || isCanonicalHypothesisOutcomeDiscriminators(entry))
    && (field !== 'universeCandidates' || isCanonicalUniverseCandidate(entry))
  ))
  const seenCandidateCodes = new Set<string>()
  const seenUniverseCandidateCodes = new Set<string>()
  const seenHypothesisPredictionIdentities = new Set<string>()
  const rows = validRows.filter((entry) => {
    const row = entry as Record<string, unknown>
    if (field === 'candidates') {
      const code = row.code as string
      if (seenCandidateCodes.has(code)) return false
      seenCandidateCodes.add(code)
    }
    if (field === 'universeCandidates') {
      const code = row.code as string
      if (seenUniverseCandidateCodes.has(code)) return false
      seenUniverseCandidateCodes.add(code)
    }
    if (field === 'hypothesisPredictions') {
      const identity = `${row.code as string}:${row.detectedAt as string}`
      if (seenHypothesisPredictionIdentities.has(identity)) return false
      seenHypothesisPredictionIdentities.add(identity)
    }
    return true
  })
  const invalidEntries = value.length - rows.length
  return {
    rows,
    warning: invalidEntries > 0 ? `${field}: invalid_entries (${invalidEntries})` : null,
  }
}

export function normalizeGeneratedObjectInput(
  value: unknown,
  field: string,
): GeneratedObjectInput {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { object: value as Record<string, unknown>, warning: null }
  }
  return { object: {}, warning: `${field}: invalid_root (expected object)` }
}

export function normalizeOptionalGeneratedObjectInput(
  value: unknown,
  field: string,
): GeneratedObjectInput {
  if (value === undefined) return { object: {}, warning: null }
  return normalizeGeneratedObjectInput(value, field)
}

export function normalizeOptionalGeneratedRecordInput<T>(
  value: unknown,
  field: string,
  isValidEntry: (value: unknown) => value is T,
): GeneratedRecordInput<T> {
  const root = normalizeOptionalGeneratedObjectInput(value, field)
  if (root.warning) return { record: {}, warning: root.warning }

  const validEntries: Array<[string, T]> = []
  let invalidEntries = 0
  for (const [key, entry] of Object.entries(root.object)) {
    if (isValidEntry(entry)) {
      validEntries.push([key, entry])
    } else {
      invalidEntries += 1
    }
  }

  return {
    record: Object.fromEntries(validEntries),
    warning: invalidEntries > 0 ? `${field}: invalid_entries (${invalidEntries})` : null,
  }
}
