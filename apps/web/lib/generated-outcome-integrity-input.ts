type DuplicateGroup = { key: string; count: number }

type OutcomeIntegrityInput = {
  generatedAt: string
  status: 'ok' | 'duplicate_found' | 'db_unavailable' | 'parse_error' | 'action_required'
  jsonl: {
    path?: string
    exists?: boolean
    totalRows: number
    duplicateGroups: DuplicateGroup[]
    parseErrors?: Array<{ lineNumber: number; preview: string; message: string }>
  }
  sqlite: {
    path?: string
    exists?: boolean
    totalRows: number | null
    uniqueIndexExists: boolean
    duplicateGroups: DuplicateGroup[]
    error: string | null
  }
  nextAction: string
}

const STATUSES = new Set(['ok', 'duplicate_found', 'db_unavailable', 'parse_error', 'action_required'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCanonicalText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function isSafeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isDuplicateGroup(value: unknown): value is DuplicateGroup {
  return isRecord(value) && isCanonicalText(value.key) && isSafeCount(value.count) && value.count >= 2
}

function isDuplicateGroupArray(value: unknown): value is DuplicateGroup[] {
  return Array.isArray(value) && value.every(isDuplicateGroup)
}

function hasValidJsonl(value: unknown): boolean {
  if (!isRecord(value)) return false
  return isSafeCount(value.totalRows)
    && isDuplicateGroupArray(value.duplicateGroups)
    && (value.path === undefined || isCanonicalText(value.path))
    && (value.exists === undefined || typeof value.exists === 'boolean')
    && (value.parseErrors === undefined || Array.isArray(value.parseErrors))
}

function hasValidSqlite(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (value.totalRows === null || isSafeCount(value.totalRows))
    && typeof value.uniqueIndexExists === 'boolean'
    && isDuplicateGroupArray(value.duplicateGroups)
    && (value.path === undefined || isCanonicalText(value.path))
    && (value.exists === undefined || typeof value.exists === 'boolean')
    && (value.error === null || typeof value.error === 'string')
}

export function normalizeGeneratedOutcomeIntegrityInput(value: unknown): {
  value: OutcomeIntegrityInput | null
  warning: string | null
} {
  if (value === undefined || value === null) return { value: null, warning: null }
  if (!isRecord(value)) return { value: null, warning: 'hypothesisOutcomeIntegrity: invalid_shape' }
  if (!isCanonicalText(value.generatedAt)
    || typeof value.status !== 'string'
    || !STATUSES.has(value.status)
    || !hasValidJsonl(value.jsonl)
    || !hasValidSqlite(value.sqlite)
    || !isCanonicalText(value.nextAction)) {
    return { value: null, warning: 'hypothesisOutcomeIntegrity: invalid_shape' }
  }
  return { value: value as OutcomeIntegrityInput, warning: null }
}
