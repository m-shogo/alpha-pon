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

const EXPLICIT_TIMEZONE_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => (
    typeof item === 'string'
    && item.trim().length > 0
    && item === item.trim()
  ))
}

function isPastOrPresentExplicitTimezoneInstant(value: unknown): value is string {
  if (typeof value !== 'string' || value.endsWith('-00:00')) return false
  const match = EXPLICIT_TIMEZONE_INSTANT.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const zone = match[5]
  if (year < 1) return false
  const calendarDate = new Date(Date.UTC(year, month - 1, day))
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) return false
  if (zone !== 'Z') {
    const offsetHour = Number(zone.slice(1, 3))
    const offsetMinute = Number(zone.slice(4, 6))
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return false
  }
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp <= Date.now()
}

export function isGeneratedRuleDisplayInput(value: unknown): value is GeneratedRuleDisplayInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.generatedRuleId === 'string'
    && row.generatedRuleId.trim().length > 0
    && row.generatedRuleId === row.generatedRuleId.trim()
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

  const structurallyValidRows = value.filter(isGeneratedRuleDisplayInput)
  const idCounts = new Map<string, number>()
  for (const row of structurallyValidRows) {
    idCounts.set(row.generatedRuleId, (idCounts.get(row.generatedRuleId) ?? 0) + 1)
  }
  const rows = structurallyValidRows.filter((row) => idCounts.get(row.generatedRuleId) === 1)
  const invalidCount = value.length - rows.length
  return {
    rows,
    warning: invalidCount > 0 ? `generatedCompanyRules: invalid_entries (${invalidCount})` : null,
  }
}