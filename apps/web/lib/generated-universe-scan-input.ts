import type { UniverseScanMetadata } from '../types/universe'

export type GeneratedUniverseScanInputResult = {
  value: UniverseScanMetadata | null
  warning: string | null
}

const CANONICAL_DATE = /^\d{4}-\d{2}-\d{2}$/

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

export function isGeneratedUniverseScanInput(value: unknown): value is UniverseScanMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  if (!isCanonicalPastOrPresentDate(row.generatedAt)) return false
  if (row.dataSource !== 'jquants' && row.dataSource !== 'mock') return false
  if (row.scanStatus !== 'fresh' && row.scanStatus !== 'stale_fallback' && row.scanStatus !== 'mock') return false
  if (row.fallbackReason !== null && row.fallbackReason !== 'jquants_zero_candidates') return false
  if (!Number.isSafeInteger(row.count) || (row.count as number) < 0) return false

  if (row.dataSource === 'mock') {
    return row.scanStatus === 'mock' && row.fallbackReason === null
  }
  if (row.scanStatus === 'mock') return false
  if (row.scanStatus === 'stale_fallback') return row.fallbackReason === 'jquants_zero_candidates'
  return row.fallbackReason === null
}

export function normalizeGeneratedUniverseScanInput(value: unknown): GeneratedUniverseScanInputResult {
  if (value === undefined || value === null) return { value: null, warning: null }
  if (!isGeneratedUniverseScanInput(value)) {
    return { value: null, warning: 'universeScan: invalid_shape' }
  }
  return { value, warning: null }
}
