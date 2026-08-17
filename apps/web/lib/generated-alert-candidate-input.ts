export type GeneratedAlertCandidateInput = {
  code: string
  name: string
  dataSource: string
  drawdownPct: number | null
  screeningScore: number
  matchedWorldEventTags: string[]
  warnings: string[]
}

export type GeneratedAlertCandidateResult = {
  rows: GeneratedAlertCandidateInput[]
  warning: string | null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isFiniteNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

export function isGeneratedAlertCandidateInput(value: unknown): value is GeneratedAlertCandidateInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.code === 'string'
    && row.code.trim().length > 0
    && row.code === row.code.trim()
    && typeof row.name === 'string'
    && typeof row.dataSource === 'string'
    && isFiniteNumberOrNull(row.drawdownPct)
    && typeof row.screeningScore === 'number'
    && Number.isFinite(row.screeningScore)
    && isStringArray(row.matchedWorldEventTags)
    && isStringArray(row.warnings)
}

export function normalizeGeneratedAlertCandidates(value: unknown): GeneratedAlertCandidateResult {
  if (!Array.isArray(value)) {
    return {
      rows: [],
      warning: value === undefined ? null : 'universeCandidates: invalid_root (expected array)',
    }
  }

  const rows = value.filter(isGeneratedAlertCandidateInput)
  const invalidCount = value.length - rows.length
  return {
    rows,
    warning: invalidCount > 0 ? `universeCandidates: invalid_entries (${invalidCount})` : null,
  }
}
