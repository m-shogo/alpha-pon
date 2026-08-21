const REVIEW_STATUSES = new Set(['pending', 'reviewed', 'skipped', 'insufficient_data'])
const DIRECTIONS = new Set(['positive', 'negative', 'mixed', 'unclear'])
const OUTCOME_RESULTS = new Set(['hit', 'miss', 'inverse', 'too_early', 'unclear', 'insufficient_data', 'unknown'])
const OUTCOME_DIRECTIONS = new Set(['up', 'down', 'sideways', 'mixed', 'unknown'])
const DATA_AVAILABILITY = new Set(['ok', 'partial', 'missing', 'priceDataPending'])
const HORIZONS = new Set(['1d', '1w', '1m'])
const AUDIT_HEALTH = new Set(['ok', 'needs_attention', 'action_required'])
const ISSUE_SEVERITIES = new Set(['urgent', 'attention', 'info'])

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isCanonicalString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isFiniteNumberOrNullish(value: unknown): boolean {
  return value == null || (typeof value === 'number' && Number.isFinite(value))
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isOutcome(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false
  return typeof value.horizon === 'string'
    && HORIZONS.has(value.horizon)
    && typeof value.dueAt === 'string'
    && (value.result === null || (typeof value.result === 'string' && OUTCOME_RESULTS.has(value.result)))
    && typeof value.expectedDirection === 'string'
    && OUTCOME_DIRECTIONS.has(value.expectedDirection)
    && typeof value.actualDirection === 'string'
    && OUTCOME_DIRECTIONS.has(value.actualDirection)
    && typeof value.dataAvailability === 'string'
    && DATA_AVAILABILITY.has(value.dataAvailability)
    && isFiniteNumberOrNullish(value.returnPct)
    && isFiniteNumberOrNullish(value.topixReturnPct)
    && isFiniteNumberOrNullish(value.relativeToTopixPct)
    && isFiniteNumberOrNullish(value.priceReturnPct)
    && isFiniteNumberOrNullish(value.benchmarkReturnPct)
    && isFiniteNumberOrNullish(value.relativeReturnPct)
    && (value.missedSignals === undefined || isStringArray(value.missedSignals))
    && (value.evidence === undefined || isStringArray(value.evidence))
}

function isWorldImpactReview(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false
  if (!isCanonicalString(value.reviewKey)
    || !isCanonicalString(value.eventId)
    || typeof value.eventDate !== 'string'
    || typeof value.topic !== 'string'
    || !isStringArray(value.affectedCompanyCodes)
    || !Array.isArray(value.outcomes)
    || !value.outcomes.every(isOutcome)) return false

  if (value.mechanisms !== undefined && !isStringArray(value.mechanisms)) return false
  if (value.reviewStatus !== undefined && (typeof value.reviewStatus !== 'string' || !REVIEW_STATUSES.has(value.reviewStatus))) return false
  if (value.direction !== undefined && (typeof value.direction !== 'string' || !DIRECTIONS.has(value.direction))) return false
  if (value.confidence !== undefined && value.confidence !== null
    && (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1)) return false
  return true
}

function isPriorityIssue(value: unknown): boolean {
  if (!isObject(value)) return false
  return typeof value.severity === 'string'
    && ISSUE_SEVERITIES.has(value.severity)
    && typeof value.category === 'string'
    && typeof value.title === 'string'
    && typeof value.detail === 'string'
}

function isWorldImpactAudit(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false
  return value.schemaVersion === 1
    && typeof value.generatedAt === 'string'
    && typeof value.healthStatus === 'string'
    && AUDIT_HEALTH.has(value.healthStatus)
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
  rows: Record<string, unknown>[]
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
  value: Record<string, unknown> | null
  warning: string | null
} {
  if (value === undefined || value === null) return { value: null, warning: null }
  if (!isWorldImpactAudit(value)) return { value: null, warning: 'worldImpactAudit: invalid_shape' }
  return { value, warning: null }
}
