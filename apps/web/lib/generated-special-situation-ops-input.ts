import type { SpecialSituationOpsSummary } from './types'

const HEALTH_STATUSES = new Set(['ok', 'needs_attention', 'action_required'])
const ACTION_PRIORITIES = new Set(['urgent', 'attention', 'info', 'ok'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isFiniteCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function hasCountFields(value: unknown, fields: readonly string[]): boolean {
  if (!isRecord(value)) return false
  return fields.every((field) => isFiniteCount(value[field]))
}

function isActionItem(value: unknown): boolean {
  if (!isRecord(value)) return false
  return typeof value.priority === 'string'
    && ACTION_PRIORITIES.has(value.priority)
    && typeof value.category === 'string'
    && typeof value.title === 'string'
    && typeof value.detail === 'string'
    && (value.command === undefined || typeof value.command === 'string')
}

export function isGeneratedSpecialSituationOpsInput(value: unknown): value is SpecialSituationOpsSummary {
  if (!isRecord(value)) return false
  if (typeof value.generatedAt !== 'string' || typeof value.today !== 'string') return false
  if (typeof value.healthStatus !== 'string' || !HEALTH_STATUSES.has(value.healthStatus)) return false
  if (!Array.isArray(value.actionItems) || !value.actionItems.every(isActionItem)) return false

  const coverage = value.coverage
  if (!hasCountFields(coverage, ['totalCandidates', 'withSpecialOutcome', 'noOutcomeRecord'])) return false
  if (!isRecord(coverage) || !isStringArray(coverage.noOutcomeRecordCodes) || typeof coverage.needSeed !== 'boolean') return false

  return hasCountFields(value.reviewDue, ['overdue', 'historicalSeedOverdue', 'dueToday', 'dueThisWeek', 'notDueYet'])
    && hasCountFields(value.backfill, ['structurallyUpdatable', 'historicalUpdatable', 'recentUpdatable', 'notDueYet'])
    && hasCountFields(value.outcomeStats, ['sampleTooSmall', 'hasStats'])
    && hasCountFields(value.mixedOutcomes, ['count'])
}

export function normalizeGeneratedSpecialSituationOpsInput(value: unknown): {
  value: SpecialSituationOpsSummary | null
  warning: string | null
} {
  if (value === undefined || value === null) return { value: null, warning: null }
  if (!isGeneratedSpecialSituationOpsInput(value)) {
    return { value: null, warning: 'specialSituationOps: invalid_shape' }
  }
  return { value, warning: null }
}
