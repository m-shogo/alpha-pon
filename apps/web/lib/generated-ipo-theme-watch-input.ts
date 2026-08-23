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

const CANONICAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || isStringArray(value)
}

function currentJstDate(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function isCanonicalPastOrPresentDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = CANONICAL_DATE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1) return false
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return false
  return value <= currentJstDate()
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
    && rule.id === rule.id.trim()
    && typeof rule.label === 'string'
    && typeof rule.defaultAction === 'string'
    && isOptionalStringArray(rule.names)
    && isOptionalStringArray(rule.touchAvoidReasons)
    && isOptionalStringArray(rule.evidenceNeeded)
    && isOptionalStringArray(rule.japaneseSpilloverThemes)
    && (rule.relatedCompanies === undefined
      || (Array.isArray(rule.relatedCompanies) && rule.relatedCompanies.every(isRelatedCompany)))
}

function hasUniqueRuleIds(rules: GeneratedIpoThemeWatchRule[]): boolean {
  return new Set(rules.map((rule) => rule.id)).size === rules.length
}

export function isGeneratedIpoThemeWatchInput(value: unknown): value is GeneratedIpoThemeWatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const watch = value as Record<string, unknown>
  if (watch.rules !== undefined && (!Array.isArray(watch.rules) || !watch.rules.every(isRule))) return false
  const rules = (watch.rules ?? []) as GeneratedIpoThemeWatchRule[]

  return (watch.generatedAt === null || isCanonicalPastOrPresentDate(watch.generatedAt))
    && (watch.defaultAction === undefined || typeof watch.defaultAction === 'string')
    && isOptionalStringArray(watch.neverTreatAs)
    && hasUniqueRuleIds(rules)
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
