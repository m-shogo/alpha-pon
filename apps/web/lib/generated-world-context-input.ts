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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isWorldContextRegime(value: unknown): value is GeneratedWorldContextRegime {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const regime = value as Record<string, unknown>
  return isNonEmptyString(regime.id)
    && isNonEmptyString(regime.level)
    && typeof regime.why === 'string'
    && isStringArray(regime.watchCategories)
    && isStringArray(regime.caution)
}

export function isGeneratedWorldContextInput(value: unknown): value is GeneratedWorldContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const context = value as Record<string, unknown>
  return isNonEmptyString(context.asOf)
    && isNonEmptyString(context.mode)
    && typeof context.summary === 'string'
    && Array.isArray(context.activeRegimes)
    && context.activeRegimes.every(isWorldContextRegime)
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
