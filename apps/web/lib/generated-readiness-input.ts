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
const EXPLICIT_TIMEZONE_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
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
  if (typeof value !== 'string' || !EXPLICIT_TIMEZONE_INSTANT.test(value) || value.endsWith('-00:00')) return false
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
    && isStringArray(item.evidence)
    && isStringArray(item.nextActions)
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
    && isStringArray(report.blockers)
    && hasUniqueReadinessItemIds(report.items)
}

export function normalizeGeneratedReadinessInput(value: unknown): GeneratedReadinessInputResult {
  if (value === undefined || value === null) return { value: null, warning: null }
  if (!isGeneratedReadinessInput(value)) {
    return { value: null, warning: 'readiness: invalid_shape' }
  }
  return { value, warning: null }
}
