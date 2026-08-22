type DuplicateGroup = { key: string; count: number }

type OutcomeIntegrityStatus = 'ok' | 'duplicate_found' | 'db_unavailable' | 'parse_error'

type OutcomeIntegrityInput = {
  generatedAt: string
  status: OutcomeIntegrityStatus
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
    invalidPayloadRows: number
    error: string | null
  }
  nextAction: string
}

const STATUSES = new Set<OutcomeIntegrityStatus>(['ok', 'duplicate_found', 'db_unavailable', 'parse_error'])
const CANONICAL_DATE = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCanonicalText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function todayJst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function isCanonicalPastOrPresentDate(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    year < 1
    || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return false
  return value <= todayJst()
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

function isParseError(value: unknown): boolean {
  return isRecord(value)
    && isSafeCount(value.lineNumber)
    && value.lineNumber >= 1
    && typeof value.preview === 'string'
    && typeof value.message === 'string'
}

function hasValidJsonl(value: unknown): boolean {
  if (!isRecord(value)) return false
  return isSafeCount(value.totalRows)
    && isDuplicateGroupArray(value.duplicateGroups)
    && (value.path === undefined || isCanonicalText(value.path))
    && (value.exists === undefined || typeof value.exists === 'boolean')
    && (value.parseErrors === undefined || (Array.isArray(value.parseErrors) && value.parseErrors.every(isParseError)))
}

function hasValidSqlite(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (value.totalRows === null || isSafeCount(value.totalRows))
    && typeof value.uniqueIndexExists === 'boolean'
    && isDuplicateGroupArray(value.duplicateGroups)
    && isSafeCount(value.invalidPayloadRows)
    && (value.path === undefined || isCanonicalText(value.path))
    && (value.exists === undefined || typeof value.exists === 'boolean')
    && (value.error === null || typeof value.error === 'string')
}

function expectedStatus(value: Record<string, unknown>): OutcomeIntegrityStatus | null {
  const jsonl = value.jsonl
  const sqlite = value.sqlite
  if (!isRecord(jsonl) || !isRecord(sqlite)) return null

  const jsonlDuplicateGroups = jsonl.duplicateGroups
  const sqliteDuplicateGroups = sqlite.duplicateGroups
  const parseErrors = jsonl.parseErrors
  const invalidPayloadRows = sqlite.invalidPayloadRows
  if (!Array.isArray(jsonlDuplicateGroups)
    || !Array.isArray(sqliteDuplicateGroups)
    || (parseErrors !== undefined && !Array.isArray(parseErrors))
    || !isSafeCount(invalidPayloadRows)) return null

  if (jsonlDuplicateGroups.length > 0 || sqliteDuplicateGroups.length > 0) return 'duplicate_found'
  if ((parseErrors?.length ?? 0) > 0 || invalidPayloadRows > 0) return 'parse_error'
  if (sqlite.exists === true && sqlite.error !== null) return 'db_unavailable'
  return 'ok'
}

export function normalizeGeneratedOutcomeIntegrityInput(value: unknown): {
  value: OutcomeIntegrityInput | null
  warning: string | null
} {
  if (value === undefined || value === null) return { value: null, warning: null }
  if (!isRecord(value)) return { value: null, warning: 'hypothesisOutcomeIntegrity: invalid_shape' }
  if (!isCanonicalPastOrPresentDate(value.generatedAt)
    || typeof value.status !== 'string'
    || !STATUSES.has(value.status as OutcomeIntegrityStatus)
    || !hasValidJsonl(value.jsonl)
    || !hasValidSqlite(value.sqlite)
    || !isCanonicalText(value.nextAction)
    || expectedStatus(value) !== value.status) {
    return { value: null, warning: 'hypothesisOutcomeIntegrity: invalid_shape' }
  }
  return { value: value as OutcomeIntegrityInput, warning: null }
}
