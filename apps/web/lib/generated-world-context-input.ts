export type GeneratedWorldContextRegime = {
  id: string
  level: string
  why: string
  watchCategories: string[]
  caution: string[]
}

export type GeneratedWorldContext = {
  asOf: string
  mode: string
  summary: string
  activeRegimes: GeneratedWorldContextRegime[]
  operatingRules: string[]
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isCanonicalNonEmptyString(value: unknown): value is string {
  return isNonEmptyString(value) && value === value.trim()
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function todayJstDate(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function isStrictPastOrPresentDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return false
  return value <= todayJstDate()
}

function isWorldContextRegime(value: unknown): value is GeneratedWorldContextRegime {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const regime = value as Record<string, unknown>
  return isCanonicalNonEmptyString(regime.id)
    && isNonEmptyString(regime.level)
    && typeof regime.why === 'string'
    && isStringArray(regime.watchCategories)
    && isStringArray(regime.caution)
}

function hasUniqueRegimeIds(regimes: GeneratedWorldContextRegime[]): boolean {
  return new Set(regimes.map((regime) => regime.id)).size === regimes.length
}

export function isGeneratedWorldContextInput(value: unknown): value is GeneratedWorldContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const context = value as Record<string, unknown>
  if (!Array.isArray(context.activeRegimes) || !context.activeRegimes.every(isWorldContextRegime)) return false

  return isStrictPastOrPresentDate(context.asOf)
    && isNonEmptyString(context.mode)
    && typeof context.summary === 'string'
    && hasUniqueRegimeIds(context.activeRegimes)
    && isStringArray(context.operatingRules)
}

export function normalizeGeneratedWorldContextInput(
  value: unknown,
): { value: GeneratedWorldContext | null; warning: string | null } {
  if (value === undefined || value === null) return { value: null, warning: null }
  if (!isGeneratedWorldContextInput(value)) {
    return { value: null, warning: 'worldContext: invalid_shape' }
  }
  return { value, warning: null }
}
