type WorldImpactDataAvailability = 'ok' | 'partial' | 'missing' | 'priceDataPending'
type WorldImpactResult = 'hit' | 'miss' | 'inverse' | 'too_early' | 'unclear' | 'insufficient_data' | 'unknown' | null
type WorldImpactDirection = 'up' | 'down' | 'sideways' | 'mixed' | 'unknown'
type WorldImpactSourceQuality = 'official' | 'tier1' | 'tier2' | 'unknown'
type WorldImpactReviewStatus = 'pending' | 'reviewed' | 'skipped' | 'insufficient_data'
type WorldImpactReviewDirection = 'positive' | 'negative' | 'mixed' | 'unclear'
type WorldImpactIssueSeverity = 'urgent' | 'attention' | 'info'
type WorldImpactMechanism =
  | 'demand' | 'supply' | 'cost' | 'fx' | 'rates' | 'regulation' | 'energy' | 'defense'
  | 'semiconductor' | 'consumer' | 'travel' | 'logistics' | 'ip_brand' | 'geopolitical'
  | 'climate_disaster' | 'unknown'

type ValidatedWorldImpactOutcome = {
  horizon: '1d' | '1w' | '1m' | string
  dueAt: string
  result: WorldImpactResult
  expectedDirection: WorldImpactDirection
  actualDirection: WorldImpactDirection
  dataAvailability: WorldImpactDataAvailability
  returnPct: number | null
  topixReturnPct: number | null
  relativeToTopixPct: number | null
  missedSignals: string[]
  lesson: string | null
  priceReturnPct?: number | null
  benchmarkReturnPct?: number | null
  relativeReturnPct?: number | null
  evidence?: string[]
  [key: string]: unknown
}

type ValidatedWorldImpactReview = {
  schemaVersion: 1 | 2
  reviewKey: string
  eventId: string
  eventDate: string
  topic: string
  source: string | null
  sourceQuality: WorldImpactSourceQuality
  namedEntities: string[]
  affectedSectors: string[]
  affectedCompanyCodes: string[]
  expectedMechanism: string
  secondOrderEffect: string
  counterArgument: string
  timeLag: string
  expectedHorizon: '1d' | '1w' | '1m' | string
  dataAvailability: WorldImpactDataAvailability
  outcomes: ValidatedWorldImpactOutcome[]
  missedSignals: string[]
  lesson: string | null
  createdAt: string
  updatedAt: string
  mechanisms?: WorldImpactMechanism[]
  direction?: WorldImpactReviewDirection
  confidence?: number | null
  reviewStatus?: WorldImpactReviewStatus
  [key: string]: unknown
}

type ValidatedWorldImpactAudit = {
  schemaVersion: 1
  generatedAt: string
  healthStatus: 'ok' | 'needs_attention' | 'action_required'
  totalReviews: number
  pendingReviews: number
  overdueReviews: number
  missingCounterArguments: number
  missingMechanisms: number
  dataUnavailable: number
  priceDataPending: number
  sourceQualityUnknown: number
  unknownMatchedAsHit: number
  priorityIssues: Array<{
    severity: WorldImpactIssueSeverity
    category: string
    title: string
    detail: string
  }>
  [key: string]: unknown
}

const REVIEW_STATUSES = new Set<WorldImpactReviewStatus>(['pending', 'reviewed', 'skipped', 'insufficient_data'])
const DIRECTIONS = new Set<WorldImpactReviewDirection>(['positive', 'negative', 'mixed', 'unclear'])
const OUTCOME_RESULTS = new Set<Exclude<WorldImpactResult, null>>(['hit', 'miss', 'inverse', 'too_early', 'unclear', 'insufficient_data', 'unknown'])
const OUTCOME_DIRECTIONS = new Set<WorldImpactDirection>(['up', 'down', 'sideways', 'mixed', 'unknown'])
const DATA_AVAILABILITY = new Set<WorldImpactDataAvailability>(['ok', 'partial', 'missing', 'priceDataPending'])
const MECHANISMS = new Set<WorldImpactMechanism>([
  'demand', 'supply', 'cost', 'fx', 'rates', 'regulation', 'energy', 'defense',
  'semiconductor', 'consumer', 'travel', 'logistics', 'ip_brand', 'geopolitical',
  'climate_disaster', 'unknown',
])
const HORIZONS = new Set(['1d', '1w', '1m'])
const AUDIT_HEALTH = new Set<ValidatedWorldImpactAudit['healthStatus']>(['ok', 'needs_attention', 'action_required'])
const ISSUE_SEVERITIES = new Set<WorldImpactIssueSeverity>(['urgent', 'attention', 'info'])

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isCanonicalString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isMechanismArray(value: unknown): value is WorldImpactMechanism[] {
  return Array.isArray(value)
    && value.every(item => typeof item === 'string' && MECHANISMS.has(item as WorldImpactMechanism))
}

function isFiniteNumberOrNullish(value: unknown): boolean {
  return value == null || (typeof value === 'number' && Number.isFinite(value))
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
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
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= (days[month - 1] ?? 0)
}

function isOutcome(value: unknown): value is ValidatedWorldImpactOutcome {
  if (!isObject(value)) return false
  return typeof value.horizon === 'string'
    && HORIZONS.has(value.horizon)
    && isGregorianDate(value.dueAt)
    && (value.result === null || (typeof value.result === 'string' && OUTCOME_RESULTS.has(value.result as Exclude<WorldImpactResult, null>)))
    && typeof value.expectedDirection === 'string'
    && OUTCOME_DIRECTIONS.has(value.expectedDirection as WorldImpactDirection)
    && typeof value.actualDirection === 'string'
    && OUTCOME_DIRECTIONS.has(value.actualDirection as WorldImpactDirection)
    && typeof value.dataAvailability === 'string'
    && DATA_AVAILABILITY.has(value.dataAvailability as WorldImpactDataAvailability)
    && isFiniteNumberOrNullish(value.returnPct)
    && isFiniteNumberOrNullish(value.topixReturnPct)
    && isFiniteNumberOrNullish(value.relativeToTopixPct)
    && isFiniteNumberOrNullish(value.priceReturnPct)
    && isFiniteNumberOrNullish(value.benchmarkReturnPct)
    && isFiniteNumberOrNullish(value.relativeReturnPct)
    && isStringArray(value.missedSignals)
    && (value.lesson === null || typeof value.lesson === 'string')
    && (value.evidence === undefined || isStringArray(value.evidence))
}

function isWorldImpactReview(value: unknown): value is ValidatedWorldImpactReview {
  if (!isObject(value)) return false
  if ((value.schemaVersion !== 1 && value.schemaVersion !== 2)
    || !isCanonicalString(value.reviewKey)
    || !isCanonicalString(value.eventId)
    || !isGregorianDate(value.eventDate)
    || typeof value.topic !== 'string'
    || (value.source !== null && typeof value.source !== 'string')
    || (value.sourceQuality !== 'official' && value.sourceQuality !== 'tier1' && value.sourceQuality !== 'tier2' && value.sourceQuality !== 'unknown')
    || !isStringArray(value.namedEntities)
    || !isStringArray(value.affectedSectors)
    || !isStringArray(value.affectedCompanyCodes)
    || typeof value.expectedMechanism !== 'string'
    || typeof value.secondOrderEffect !== 'string'
    || typeof value.counterArgument !== 'string'
    || typeof value.timeLag !== 'string'
    || typeof value.expectedHorizon !== 'string'
    || typeof value.dataAvailability !== 'string'
    || !DATA_AVAILABILITY.has(value.dataAvailability as WorldImpactDataAvailability)
    || !Array.isArray(value.outcomes)
    || !value.outcomes.every(isOutcome)
    || !isStringArray(value.missedSignals)
    || (value.lesson !== null && typeof value.lesson !== 'string')
    || !isGregorianDate(value.createdAt)
    || !isGregorianDate(value.updatedAt)) return false

  if (value.mechanisms !== undefined && !isMechanismArray(value.mechanisms)) return false
  if (value.reviewStatus !== undefined && (typeof value.reviewStatus !== 'string' || !REVIEW_STATUSES.has(value.reviewStatus as WorldImpactReviewStatus))) return false
  if (value.direction !== undefined && (typeof value.direction !== 'string' || !DIRECTIONS.has(value.direction as WorldImpactReviewDirection))) return false
  if (value.confidence !== undefined && value.confidence !== null
    && (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1)) return false
  return true
}

function isPriorityIssue(value: unknown): value is ValidatedWorldImpactAudit['priorityIssues'][number] {
  if (!isObject(value)) return false
  return typeof value.severity === 'string'
    && ISSUE_SEVERITIES.has(value.severity as WorldImpactIssueSeverity)
    && typeof value.category === 'string'
    && typeof value.title === 'string'
    && typeof value.detail === 'string'
}

function isWorldImpactAudit(value: unknown): value is ValidatedWorldImpactAudit {
  if (!isObject(value)) return false
  return value.schemaVersion === 1
    && typeof value.generatedAt === 'string'
    && typeof value.healthStatus === 'string'
    && AUDIT_HEALTH.has(value.healthStatus as ValidatedWorldImpactAudit['healthStatus'])
    && isNonNegativeSafeInteger(value.totalReviews)
    && isNonNegativeSafeInteger(value.pendingReviews)
    && isNonNegativeSafeInteger(value.overdueReviews)
    && isNonNegativeSafeInteger(value.missingCounterArguments)
    && isNonNegativeSafeInteger(value.missingMechanisms)
    && isNonNegativeSafeInteger(value.dataUnavailable)
    && isNonNegativeSafeInteger(value.priceDataPending)
    && isNonNegativeSafeInteger(value.sourceQualityUnknown)
    && isNonNegativeSafeInteger(value.unknownMatchedAsHit)
    && Array.isArray(value.priorityIssues)
    && value.priorityIssues.every(isPriorityIssue)
}

export function normalizeGeneratedWorldImpactReviewsInput(value: unknown): {
  rows: ValidatedWorldImpactReview[]
  warning: string | null
} {
  if (value === undefined || value === null) return { rows: [], warning: null }
  if (!Array.isArray(value)) return { rows: [], warning: 'worldImpactReviews: invalid_shape' }

  const rows = value.filter(isWorldImpactReview)
  return {
    rows,
    warning: rows.length === value.length ? null : `worldImpactReviews: isolated_${value.length - rows.length}_invalid_rows`,
  }
}

export function normalizeGeneratedWorldImpactAuditInput(value: unknown): {
  value: ValidatedWorldImpactAudit | null
  warning: string | null
} {
  if (value === undefined || value === null) return { value: null, warning: null }
  if (!isWorldImpactAudit(value)) return { value: null, warning: 'worldImpactAudit: invalid_shape' }
  return { value, warning: null }
}
