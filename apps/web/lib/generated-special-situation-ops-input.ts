import type { SpecialSituationOpsSummary } from './types'

const HEALTH_STATUSES = new Set(['ok', 'needs_attention', 'action_required'])
const ACTION_PRIORITIES = new Set(['urgent', 'attention', 'info', 'ok'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCanonicalText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
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

function hasValidReviewDue(value: unknown): boolean {
  if (!isRecord(value)) return false
  return isSafeCount(value.overdue)
    && isSafeCount(value.historicalSeedOverdue)
    && isSafeCount(value.dueToday)
    && isSafeCount(value.dueThisWeek)
    && isSafeCount(value.notDueYet)
}

export function normalizeGeneratedSpecialSituationOpsInput(value: unknown): {
  value: SpecialSituationOpsSummary | null
  warning: string | null
} {
  if (value === undefined || value === null) return { value: null, warning: null }
  if (!isRecord(value)) return { value: null, warning: 'specialSituationOps: invalid_shape' }
  if (typeof value.healthStatus !== 'string' || !HEALTH_STATUSES.has(value.healthStatus)) {
    return { value: null, warning: 'specialSituationOps: invalid_shape' }
  }
  if (!Array.isArray(value.actionItems) || !value.actionItems.every(isActionItem)) {
    return { value: null, warning: 'specialSituationOps: invalid_shape' }
  }
  if (!hasValidReviewDue(value.reviewDue)) {
    return { value: null, warning: 'specialSituationOps: invalid_shape' }
  }

  return { value: value as SpecialSituationOpsSummary, warning: null }
}
