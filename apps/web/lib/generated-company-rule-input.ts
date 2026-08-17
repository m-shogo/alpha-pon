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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
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
    && typeof rule.code === 'string'
    && rule.code.trim().length > 0
    && typeof rule.name === 'string'
    && rule.name.trim().length > 0
    && typeof rule.actionSignal === 'string'
    && ACTION_SIGNALS.has(rule.actionSignal)
    && typeof rule.confidence === 'number'
    && Number.isFinite(rule.confidence)
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
  const rows = value.filter(isGeneratedCompanyRuleInput)
  const invalidCount = value.length - rows.length
  return {
    rows,
    warning: invalidCount > 0 ? `generatedCompanyRules: invalid_rows ${invalidCount}` : null,
  }
}
