export type GeneratedIpoThemeWatchRule = {
  id: string
  label: string
  names?: string[]
  defaultAction: string
  touchAvoidReasons?: string[]
  evidenceNeeded?: string[]
  japaneseSpilloverThemes?: string[]
  relatedCompanies?: Array<{ code: string; name: string; relation: string }>
}

export type GeneratedIpoThemeWatch = {
  generatedAt: string | null
  defaultAction?: string
  neverTreatAs?: string[]
  rules?: GeneratedIpoThemeWatchRule[]
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || isStringArray(value)
}

function isRelatedCompany(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const company = value as Record<string, unknown>
  return typeof company.code === 'string'
    && company.code.trim().length > 0
    && typeof company.name === 'string'
    && typeof company.relation === 'string'
}

function isRule(value: unknown): value is GeneratedIpoThemeWatchRule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const rule = value as Record<string, unknown>
  return typeof rule.id === 'string'
    && rule.id.trim().length > 0
    && typeof rule.label === 'string'
    && typeof rule.defaultAction === 'string'
    && isOptionalStringArray(rule.names)
    && isOptionalStringArray(rule.touchAvoidReasons)
    && isOptionalStringArray(rule.evidenceNeeded)
    && isOptionalStringArray(rule.japaneseSpilloverThemes)
    && (rule.relatedCompanies === undefined
      || (Array.isArray(rule.relatedCompanies) && rule.relatedCompanies.every(isRelatedCompany)))
}

export function isGeneratedIpoThemeWatchInput(value: unknown): value is GeneratedIpoThemeWatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const watch = value as Record<string, unknown>
  return (watch.generatedAt === null || typeof watch.generatedAt === 'string')
    && (watch.defaultAction === undefined || typeof watch.defaultAction === 'string')
    && isOptionalStringArray(watch.neverTreatAs)
    && (watch.rules === undefined || (Array.isArray(watch.rules) && watch.rules.every(isRule)))
}

export function normalizeGeneratedIpoThemeWatchInput(
  value: unknown,
): { value: GeneratedIpoThemeWatch | null; warning: string | null } {
  if (value === undefined || value === null) return { value: null, warning: null }
  if (!isGeneratedIpoThemeWatchInput(value)) {
    return { value: null, warning: 'ipoThemeWatch: invalid_shape' }
  }
  return { value, warning: null }
}
