export type GeneratedArrayInput<T> = {
  rows: T[]
  warning: string | null
}

export type GeneratedObjectInput = {
  object: Record<string, unknown>
  warning: string | null
}

export type GeneratedRecordInput<T> = {
  record: Record<string, T>
  warning: string | null
}

export type GeneratedWarningsInput = {
  warnings: string[]
  warning: string | null
}

export type GeneratedRunCursorState = {
  jobName?: string
  offset?: number
  maxPerRun?: number
  total?: number
  updatedAt?: string
}

export type GeneratedReportInput = {
  key: string
  label: string
  path: string
  available: boolean
  excerpt: string[]
  fullContent?: string
}

export type GeneratedWorldThemeCandidateHypothesisInput = {
  sourceEventTitle: string
  sourceEventPublishedAt: string | null
  theme: string
  candidateCode: string
  candidateCompany: string
  whyThisCompany: string
  upsideHypothesis: string
  downsideRisk: string
  nextPrimaryCheck: string
  reviewAfterDays: [30, 90, 180]
  disclaimer: string
}

export function isGeneratedRunCursorState(value: unknown): value is GeneratedRunCursorState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return (row.jobName === undefined || typeof row.jobName === 'string')
    && (row.offset === undefined || (typeof row.offset === 'number' && Number.isFinite(row.offset)))
    && (row.maxPerRun === undefined || (typeof row.maxPerRun === 'number' && Number.isFinite(row.maxPerRun)))
    && (row.total === undefined || (typeof row.total === 'number' && Number.isFinite(row.total)))
    && (row.updatedAt === undefined || typeof row.updatedAt === 'string')
}

export function isGeneratedReportInput(value: unknown): value is GeneratedReportInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.key === 'string'
    && typeof row.label === 'string'
    && typeof row.path === 'string'
    && typeof row.available === 'boolean'
    && Array.isArray(row.excerpt)
    && row.excerpt.every((item) => typeof item === 'string')
    && (row.fullContent === undefined || typeof row.fullContent === 'string')
}

export function isGeneratedWorldThemeCandidateHypothesisInput(
  value: unknown,
): value is GeneratedWorldThemeCandidateHypothesisInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  const reviewAfterDays = row.reviewAfterDays
  return typeof row.sourceEventTitle === 'string'
    && (row.sourceEventPublishedAt === null || typeof row.sourceEventPublishedAt === 'string')
    && typeof row.theme === 'string'
    && typeof row.candidateCode === 'string'
    && typeof row.candidateCompany === 'string'
    && typeof row.whyThisCompany === 'string'
    && typeof row.upsideHypothesis === 'string'
    && typeof row.downsideRisk === 'string'
    && typeof row.nextPrimaryCheck === 'string'
    && Array.isArray(reviewAfterDays)
    && reviewAfterDays.length === 3
    && reviewAfterDays[0] === 30
    && reviewAfterDays[1] === 90
    && reviewAfterDays[2] === 180
    && typeof row.disclaimer === 'string'
}

export function normalizeGeneratedWarningsInput(
  value: unknown,
  field = 'meta.warnings',
): GeneratedWarningsInput {
  if (value === undefined) return { warnings: [], warning: null }
  if (!Array.isArray(value)) {
    return { warnings: [], warning: `${field}: invalid_root (expected string array)` }
  }

  const warnings = value.filter((item): item is string => typeof item === 'string')
  const invalidEntries = value.length - warnings.length
  return {
    warnings,
    warning: invalidEntries > 0 ? `${field}: invalid_entries (${invalidEntries})` : null,
  }
}

export function normalizeGeneratedArrayInput<T>(
  value: unknown,
  field: string,
  isValidEntry?: (value: unknown) => value is T,
): GeneratedArrayInput<T> {
  if (value === undefined) return { rows: [], warning: null }
  if (!Array.isArray(value)) {
    return { rows: [], warning: `${field}: invalid_root (expected array)` }
  }
  if (!isValidEntry) return { rows: value as T[], warning: null }

  const rows = value.filter(isValidEntry)
  const invalidEntries = value.length - rows.length
  return {
    rows,
    warning: invalidEntries > 0 ? `${field}: invalid_entries (${invalidEntries})` : null,
  }
}

export function normalizeGeneratedObjectInput(
  value: unknown,
  field: string,
): GeneratedObjectInput {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { object: value as Record<string, unknown>, warning: null }
  }
  return { object: {}, warning: `${field}: invalid_root (expected object)` }
}

export function normalizeOptionalGeneratedObjectInput(
  value: unknown,
  field: string,
): GeneratedObjectInput {
  if (value === undefined) return { object: {}, warning: null }
  return normalizeGeneratedObjectInput(value, field)
}

export function normalizeOptionalGeneratedRecordInput<T>(
  value: unknown,
  field: string,
  isValidEntry: (value: unknown) => value is T,
): GeneratedRecordInput<T> {
  const root = normalizeOptionalGeneratedObjectInput(value, field)
  if (root.warning) return { record: {}, warning: root.warning }

  const validEntries: Array<[string, T]> = []
  let invalidEntries = 0
  for (const [key, entry] of Object.entries(root.object)) {
    if (isValidEntry(entry)) {
      validEntries.push([key, entry])
    } else {
      invalidEntries += 1
    }
  }

  return {
    record: Object.fromEntries(validEntries),
    warning: invalidEntries > 0 ? `${field}: invalid_entries (${invalidEntries})` : null,
  }
}