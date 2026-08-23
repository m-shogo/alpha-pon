export type GeneratedRuleDisplayInput = {
  generatedRuleId: string
  code: string
  name: string
  generatedAt: string
  thesis: string[]
  invalidationSignals: string[]
}

export type GeneratedRuleInputResult = {
  rows: GeneratedRuleDisplayInput[]
  warning: string | null
}

const EXPLICIT_TIMEZONE_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isPastOrPresentExplicitTimezoneInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !EXPLICIT_TIMEZONE_INSTANT.test(value) || value.endsWith('-00:00')) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp <= Date.now()
}

export function isGeneratedRuleDisplayInput(value: unknown): value is GeneratedRuleDisplayInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.generatedRuleId === 'string'
    && row.generatedRuleId.trim().length > 0
    && typeof row.code === 'string'
    && row.code.trim().length > 0
    && row.code === row.code.trim()
    && typeof row.name === 'string'
    && isPastOrPresentExplicitTimezoneInstant(row.generatedAt)
    && isStringArray(row.thesis)
    && isStringArray(row.invalidationSignals)
}

export function normalizeGeneratedRules(value: unknown): GeneratedRuleInputResult {
  if (!Array.isArray(value)) {
    return {
      rows: [],
      warning: value === undefined ? null : 'generatedCompanyRules: invalid_root (expected array)',
    }
  }

  const rows = value.filter(isGeneratedRuleDisplayInput)
  const invalidCount = value.length - rows.length
  return {
    rows,
    warning: invalidCount > 0 ? `generatedCompanyRules: invalid_entries (${invalidCount})` : null,
  }
}
