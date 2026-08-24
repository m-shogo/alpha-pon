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

function isUniqueStringArray(value: unknown): value is string[] {
  return isStringArray(value) && new Set(value).size === value.length
}

function isSafeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isRealGregorianDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1) return false
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

function currentJstDate(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
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

function hasConsistentHealthStatus(
  healthStatus: SpecialSituationOpsInput['healthStatus'],
  actionItems: SpecialSituationOpsInput['actionItems'],
): boolean {
  const hasUrgent = actionItems.some(item => item.priority === 'urgent')
  const hasAttention = actionItems.some(item => item.priority === 'attention')
  const expectedStatus = hasUrgent
    ? 'action_required'
    : hasAttention
      ? 'needs_attention'
      : 'ok'
  return healthStatus === expectedStatus
}

function hasValidCoverage(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (!isSafeCount(value.totalCandidates)
    || !isSafeCount(value.withSpecialOutcome)
    || !isSafeCount(value.noOutcomeRecord)
    || !isUniqueStringArray(value.noOutcomeRecordCodes)
    || typeof value.needSeed !== 'boolean') {
    return false
  }
  return value.withSpecialOutcome <= value.totalCandidates
    && value.noOutcomeRecord <= value.totalCandidates
    && value.noOutcomeRecord === value.noOutcomeRecordCodes.length
    && value.needSeed === (value.noOutcomeRecord > 0)
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
  if (!isSafeCount(value.structurallyUpdatable)
    || !isSafeCount(value.historicalUpdatable)
    || !isSafeCount(value.recentUpdatable)
    || !isSafeCount(value.notDueYet)) {
    return false
  }
  return value.structurallyUpdatable === value.historicalUpdatable + value.recentUpdatable
}

function hasValidOutcomeStats(value: unknown): boolean {
  if (!isRecord(value)) return false
  return isSafeCount(value.sampleTooSmall) && isSafeCount(value.hasStats)
}

function hasValidMixedOutcomes(value: unknown): boolean {
  return isRecord(value) && isSafeCount(value.count)
}

export function normalizeGeneratedSpecialSituationOpsInput(
  value: unknown,
  asOfDate = currentJstDate(),
): {
  value: SpecialSituationOpsInput | null
  warning: string | null
} {
  if (value === undefined || value === null) return { value: null, warning: null }
  if (!isRecord(value)) return { value: null, warning: 'specialSituationOps: invalid_shape' }
  if (!isRealGregorianDate(value.generatedAt)
    || !isRealGregorianDate(value.today)
    || !isRealGregorianDate(asOfDate)
    || value.generatedAt !== value.today
    || value.today !== asOfDate) {
    return { value: null, warning: 'specialSituationOps: invalid_shape' }
  }
  if (typeof value.healthStatus !== 'string' || !HEALTH_STATUSES.has(value.healthStatus)) {
    return { value: null, warning: 'specialSituationOps: invalid_shape' }
  }
  if (!Array.isArray(value.actionItems) || !value.actionItems.every(isActionItem)) {
    return { value: null, warning: 'specialSituationOps: invalid_shape' }
  }
  const actionItems = value.actionItems as SpecialSituationOpsInput['actionItems']
  if (!hasConsistentHealthStatus(value.healthStatus as SpecialSituationOpsInput['healthStatus'], actionItems)) {
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
