type SpecialSituationOpsInput = {
  generatedAt: string
  today: string
  healthStatus: 'ok' | 'needs_attention' | 'action_required'
  actionItems: Array<{
    priority: 'urgent' | 'attention' | 'info' | 'ok'
    category: string
    title: string
    detail: string
    command?: string
  }>
  coverage: {
    totalCandidates: number
    withSpecialOutcome: number
    noOutcomeRecord: number
    noOutcomeRecordCodes: string[]
    needSeed: boolean
  }
  reviewDue: {
    overdue: number
    historicalSeedOverdue: number
    dueToday: number
    dueThisWeek: number
    notDueYet: number
  }
  backfill: {
    structurallyUpdatable: number
    historicalUpdatable: number
    recentUpdatable: number
    notDueYet: number
  }
  outcomeStats: {
    sampleTooSmall: number
    hasStats: number
  }
  mixedOutcomes: {
    count: number
  }
}

const HEALTH_STATUSES = new Set(['ok', 'needs_attention', 'action_required'])
const ACTION_PRIORITIES = new Set(['urgent', 'attention', 'info', 'ok'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCanonicalText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isCanonicalText)
}

function isSafeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isActionItem(value: unknown): boolean {
  if (!isRecord(value)) return false
  return typeof value.priority === 'string'
    && ACTION_PRIORITIES.has(value.priority)
    && isCanonicalText(value.category)
    && isCanonicalText(value.title)
    && isCanonicalText(value.detail)
    && (value.command === undefined || isCanonicalText(value.command))
}

function hasValidCoverage(value: unknown): boolean {
  if (!isRecord(value)) return false
  return isSafeCount(value.totalCandidates)
    && isSafeCount(value.withSpecialOutcome)
    && isSafeCount(value.noOutcomeRecord)
    && isStringArray(value.noOutcomeRecordCodes)
    && typeof value.needSeed === 'boolean'
}

function hasValidReviewDue(value: unknown): boolean {
  if (!isRecord(value)) return false
  return isSafeCount(value.overdue)
    && isSafeCount(value.historicalSeedOverdue)
    && isSafeCount(value.dueToday)
    && isSafeCount(value.dueThisWeek)
    && isSafeCount(value.notDueYet)
}

function hasValidBackfill(value: unknown): boolean {
  if (!isRecord(value)) return false
  return isSafeCount(value.structurallyUpdatable)
    && isSafeCount(value.historicalUpdatable)
    && isSafeCount(value.recentUpdatable)
    && isSafeCount(value.notDueYet)
}

function hasValidOutcomeStats(value: unknown): boolean {
  if (!isRecord(value)) return false
  return isSafeCount(value.sampleTooSmall) && isSafeCount(value.hasStats)
}

function hasValidMixedOutcomes(value: unknown): boolean {
  return isRecord(value) && isSafeCount(value.count)
}

export function normalizeGeneratedSpecialSituationOpsInput(value: unknown): {
  value: SpecialSituationOpsInput | null
  warning: string | null
} {
  if (value === undefined || value === null) return { value: null, warning: null }
  if (!isRecord(value)) return { value: null, warning: 'specialSituationOps: invalid_shape' }
  if (!isCanonicalText(value.generatedAt) || !isCanonicalText(value.today)) {
    return { value: null, warning: 'specialSituationOps: invalid_shape' }
  }
  if (typeof value.healthStatus !== 'string' || !HEALTH_STATUSES.has(value.healthStatus)) {
    return { value: null, warning: 'specialSituationOps: invalid_shape' }
  }
  if (!Array.isArray(value.actionItems) || !value.actionItems.every(isActionItem)) {
    return { value: null, warning: 'specialSituationOps: invalid_shape' }
  }
  if (!hasValidCoverage(value.coverage)
    || !hasValidReviewDue(value.reviewDue)
    || !hasValidBackfill(value.backfill)
    || !hasValidOutcomeStats(value.outcomeStats)
    || !hasValidMixedOutcomes(value.mixedOutcomes)) {
    return { value: null, warning: 'specialSituationOps: invalid_shape' }
  }

  return { value: value as SpecialSituationOpsInput, warning: null }
}
