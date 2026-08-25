export type ProCommandSummaryInput = {
  strategic: string
  pipeline: string
  committee: string
  roadmap: string[]
  refresh: string[]
}

const EMPTY_PRO_COMMAND_SUMMARY: ProCommandSummaryInput = {
  strategic: '',
  pipeline: '',
  committee: '',
  roadmap: [],
  refresh: [],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function stringRows(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((row): row is string => typeof row === 'string') : []
}

function isRealGregorianDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

function todayJst(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function normalizeProGeneratedDate(value: unknown, now = new Date()): string | null {
  if (typeof value !== 'string' || !isRealGregorianDate(value)) return null
  return value <= todayJst(now) ? value : null
}

export function normalizeProCommandSummaryInput(value: unknown): ProCommandSummaryInput {
  if (!isRecord(value)) return EMPTY_PRO_COMMAND_SUMMARY
  return {
    strategic: stringOrEmpty(value.strategic),
    pipeline: stringOrEmpty(value.pipeline),
    committee: stringOrEmpty(value.committee),
    roadmap: stringRows(value.roadmap),
    refresh: stringRows(value.refresh),
  }
}
