export type GeneratedReadinessItem = {
  id: string
  label: string
  status: string
  score: number
  evidence: string[]
  nextActions: string[]
}

export type GeneratedReadinessReport = {
  generatedAt: string
  overallScore: number
  overallStatus: string
  blockers: string[]
  items: GeneratedReadinessItem[]
}

export type GeneratedReadinessInputResult = {
  value: GeneratedReadinessReport | null
  warning: string | null
}

const READINESS_STATUSES = new Set(['done', 'partial', 'blocked', 'not_started'])
const EXPLICIT_TIMEZONE_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

function isCanonicalStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => (
    typeof item === 'string'
    && item.trim().length > 0
    && item === item.trim()
  ))
}

function isReadinessScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

function isReadinessStatus(value: unknown): value is string {
  return typeof value === 'string' && READINESS_STATUSES.has(value)
}

function readinessStatusForScore(score: number): string {
  if (score >= 85) return 'done'
  if (score >= 45) return 'partial'
  if (score > 0) return 'blocked'
  return 'not_started'
}

function isPastOrPresentExplicitTimezoneInstant(value: unknown): value is string {
  if (typeof value !== 'string' || value.endsWith('-00:00')) return false
  const match = EXPLICIT_TIMEZONE_INSTANT.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1) return false
  const calendarDate = new Date(Date.UTC(year, month - 1, day))
  if (calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() !== month - 1
    || calendarDate.getUTCDate() !== day) {
    return false
  }
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp <= Date.now()
}

function isReadinessItem(value: unknown): value is GeneratedReadinessItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string'
    && item.id.trim().length > 0
    && item.id === item.id.trim()
    && typeof item.label === 'string'
    && isReadinessStatus(item.status)
    && isReadinessScore(item.score)
    && item.status === readinessStatusForScore(item.score)
    && isCanonicalStringArray(item.evidence)
    && isCanonicalStringArray(item.nextActions)
}

function hasUniqueReadinessItemIds(items: GeneratedReadinessItem[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length
}

export function isGeneratedReadinessInput(value: unknown): value is GeneratedReadinessReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const report = value as Record<string, unknown>
  if (!Array.isArray(report.items) || !report.items.every(isReadinessItem)) return false

  return isPastOrPresentExplicitTimezoneInstant(report.generatedAt)
    && isReadinessScore(report.overallScore)
    && isReadinessStatus(report.overallStatus)
    && report.overallStatus === readinessStatusForScore(report.overallScore)
    && isCanonicalStringArray(report.blockers)
    && hasUniqueReadinessItemIds(report.items)
}

export function normalizeGeneratedReadinessInput(value: unknown): GeneratedReadinessInputResult {
  if (value === undefined || value === null) return { value: null, warning: null }
  if (!isGeneratedReadinessInput(value)) {
    return { value: null, warning: 'readiness: invalid_shape' }
  }
  return { value, warning: null }
}
