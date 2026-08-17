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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isReadinessItem(value: unknown): value is GeneratedReadinessItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string'
    && item.id.trim().length > 0
    && typeof item.label === 'string'
    && typeof item.status === 'string'
    && typeof item.score === 'number'
    && Number.isFinite(item.score)
    && isStringArray(item.evidence)
    && isStringArray(item.nextActions)
}

export function isGeneratedReadinessInput(value: unknown): value is GeneratedReadinessReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const report = value as Record<string, unknown>
  return typeof report.generatedAt === 'string'
    && typeof report.overallScore === 'number'
    && Number.isFinite(report.overallScore)
    && typeof report.overallStatus === 'string'
    && isStringArray(report.blockers)
    && Array.isArray(report.items)
    && report.items.every(isReadinessItem)
}

export function normalizeGeneratedReadinessInput(value: unknown): GeneratedReadinessInputResult {
  if (value === undefined || value === null) return { value: null, warning: null }
  if (!isGeneratedReadinessInput(value)) {
    return { value: null, warning: 'readiness: invalid_shape' }
  }
  return { value, warning: null }
}
