const ACTION_SIGNALS = new Set([
  'DANGER',
  'EXIT_WATCH',
  'TRIM_WATCH',
  'WAIT_PULLBACK',
  'ENTRY_WATCH',
  'ADD_WATCH',
  'HOLD',
  'NO_ACTION',
])

const EXPLICIT_TIMEZONE_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
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
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp <= Date.now()
}

function isFiniteNumberOrNull(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isPriceSignal(value: unknown): boolean {
  if (value === undefined) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const signal = value as Record<string, unknown>
  return isFiniteNumberOrNull(signal.change5dPct)
    && isFiniteNumberOrNull(signal.change20dPct)
    && isFiniteNumberOrNull(signal.relativeTopix20dPct)
    && isFiniteNumberOrNull(signal.volumeSpikeRatio)
    && typeof signal.source === 'string'
    && typeof signal.quality === 'string'
}

function isPriceRiskWarnings(value: unknown): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
    const warning = entry as Record<string, unknown>
    return (warning.level === 'info' || warning.level === 'warning' || warning.level === 'block')
      && typeof warning.reason === 'string'
      && isStringArray(warning.evidence)
  })
}

export function isGeneratedCompanyRuleInput(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const rule = value as Record<string, unknown>
  return typeof rule.generatedRuleId === 'string'
    && rule.generatedRuleId.trim().length > 0
    && rule.generatedRuleId === rule.generatedRuleId.trim()
    && typeof rule.code === 'string'
    && rule.code.trim().length > 0
    && rule.code === rule.code.trim()
    && typeof rule.name === 'string'
    && rule.name.trim().length > 0
    && isPastOrPresentExplicitTimezoneInstant(rule.generatedAt)
    && typeof rule.actionSignal === 'string'
    && ACTION_SIGNALS.has(rule.actionSignal)
    && typeof rule.confidence === 'number'
    && Number.isFinite(rule.confidence)
    && rule.confidence >= 0
    && rule.confidence <= 1
    && isStringArray(rule.reasons)
    && isStringArray(rule.risks)
    && isStringArray(rule.evidenceNeeded)
    && isStringArray(rule.invalidationSignals)
    && isPriceSignal(rule.priceSignal)
    && isPriceRiskWarnings(rule.priceRiskWarnings)
}

export function normalizeGeneratedCompanyRules(value: unknown): { rows: unknown[]; warning: string | null } {
  if (value === undefined || value === null) return { rows: [], warning: null }
  if (!Array.isArray(value)) return { rows: [], warning: 'generatedCompanyRules: invalid_root' }
  const structurallyValidRows = value.filter(isGeneratedCompanyRuleInput) as Array<{ generatedRuleId: string }>
  const idCounts = new Map<string, number>()
  for (const row of structurallyValidRows) {
    idCounts.set(row.generatedRuleId, (idCounts.get(row.generatedRuleId) ?? 0) + 1)
  }
  const rows = structurallyValidRows.filter((row) => idCounts.get(row.generatedRuleId) === 1)
  const invalidCount = value.length - rows.length
  return {
    rows,
    warning: invalidCount > 0 ? `generatedCompanyRules: invalid_rows ${invalidCount}` : null,
  }
}
