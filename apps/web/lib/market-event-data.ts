export type WebMarketEventPriority = 'S0' | 'S1' | 'S2' | 'S3'
export type WebMarketEventDecision = 'BUY_WATCH' | 'WAIT' | 'BLOCK' | 'ABSTAIN' | 'INFO'
export type WebMarketEventStatus =
  | 'TENTATIVE'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'POSTPONED'
  | 'CANCELLED'
  | 'UNKNOWN_DATE'

export type WebMarketEvent = {
  schemaVersion: 1
  eventId: string
  occurrenceKey: string
  issuerCode: string | null
  issuerName: string
  eventType: string
  title: string
  status: WebMarketEventStatus
  priority: WebMarketEventPriority
  time: {
    startAt: string | null
    endAt: string | null
    allDay: boolean
    timezone: string
    precision: 'EXACT' | 'DATE_ONLY' | 'WINDOW' | 'UNKNOWN'
    windowStart: string | null
    windowEnd: string | null
  }
  edgeTypes: string[]
  currentDecisionState: WebMarketEventDecision
  whyItMatters: string
  checksBefore: string[]
  checksAfter: string[]
  relatedEventIds: string[]
  lastVerifiedAt: string
  staleAfter: string | null
  createdAt: string
  updatedAt: string
  revisionNumber: number
  sources: Array<{
    sourceId: string
    authority: string
    sourceType: string
    url: string
    title: string
    publishedAt: string | null
    retrievedAt: string
    contentHash: string
  }>
  freshnessState: 'FRESH' | 'STALE' | 'UNKNOWN'
  calendarIncluded: boolean
  sortAt: string | null
}

export type WebMarketEventData = {
  schemaVersion: 1
  generatedAt: string | null
  source: 'local-sqlite' | 'cloudflare-d1' | 'fallback'
  events: WebMarketEvent[]
  summary: {
    total: number
    scheduled: number
    unknownDate: number
    stale: number
    calendarIncluded: number
    calendarExcludedUnknownDate: number
    priorityCounts: Record<WebMarketEventPriority, number>
    decisionCounts: Record<WebMarketEventDecision, number>
    nextEventAt: string | null
  }
  meta: {
    warnings: string[]
    databasePath: string | null
  }
}

export const EMPTY_MARKET_EVENT_DATA: WebMarketEventData = {
  schemaVersion: 1,
  generatedAt: null,
  source: 'fallback',
  events: [],
  summary: {
    total: 0,
    scheduled: 0,
    unknownDate: 0,
    stale: 0,
    calendarIncluded: 0,
    calendarExcludedUnknownDate: 0,
    priorityCounts: { S0: 0, S1: 0, S2: 0, S3: 0 },
    decisionCounts: { BUY_WATCH: 0, WAIT: 0, BLOCK: 0, ABSTAIN: 0, INFO: 0 },
    nextEventAt: null,
  },
  meta: {
    warnings: ['イベントデータはまだ生成されていません。'],
    databasePath: null,
  },
}

const WEB_MARKET_EVENT_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/

function leapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function daysInMonth(year: number, month: number): number {
  return [31, leapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0
}

function strictMarketEventMilliseconds(value: string): number {
  const match = WEB_MARKET_EVENT_INSTANT.exec(value)
  if (!match) throw new Error(`invalid market event sortAt: ${value}`)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const fractional = match[7] ?? ''
  const zone = match[8]

  if (
    year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)
    || hour > 23 || minute > 59 || second > 59
  ) throw new Error('market event sortAt must be a valid Gregorian ISO-8601 timestamp')

  let offsetMinutes = 0
  if (zone !== 'Z') {
    if (zone === '-00:00') throw new Error('market event sortAt must use a known timezone offset')
    const offsetHour = Number(zone.slice(1, 3))
    const offsetMinute = Number(zone.slice(4, 6))
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
      throw new Error('market event sortAt must have a valid timezone offset within ±14:00')
    }
    offsetMinutes = (zone.startsWith('+') ? 1 : -1) * (offsetHour * 60 + offsetMinute)
  }

  const localClock = new Date(0)
  localClock.setUTCFullYear(year, month - 1, day)
  localClock.setUTCHours(hour, minute, second, Number((fractional + '000').slice(0, 3)))
  return localClock.getTime() - offsetMinutes * 60_000
}

function sortAtInstant(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+09:00` : value
}

function sortAtNanoseconds(value: string): bigint {
  const instant = sortAtInstant(value)
  const match = WEB_MARKET_EVENT_INSTANT.exec(instant)
  if (!match) throw new Error(`invalid market event sortAt: ${value}`)
  const milliseconds = strictMarketEventMilliseconds(instant)
  const fractional = match[7] ?? ''
  const subMillisecond = BigInt((fractional + '000000000').slice(3, 9))
  return BigInt(milliseconds) * BigInt(1_000_000) + subMillisecond
}

export function compareWebMarketEventSortAt(left: string, right: string): -1 | 0 | 1 {
  const leftNs = sortAtNanoseconds(left)
  const rightNs = sortAtNanoseconds(right)
  if (leftNs < rightNs) return -1
  if (leftNs > rightNs) return 1
  return 0
}

export function compareWebMarketEventsBySortAt(
  left: Pick<WebMarketEvent, 'sortAt' | 'priority'>,
  right: Pick<WebMarketEvent, 'sortAt' | 'priority'>,
): number {
  if (!left.sortAt && !right.sortAt) return left.priority.localeCompare(right.priority)
  if (!left.sortAt) return 1
  if (!right.sortAt) return -1
  const instantOrder = compareWebMarketEventSortAt(left.sortAt, right.sortAt)
  if (instantOrder !== 0) return instantOrder
  return left.priority.localeCompare(right.priority)
}

export function webMarketEventJapanDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const instant = sortAtInstant(value)
  const milliseconds = strictMarketEventMilliseconds(instant)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(milliseconds))
}

function array<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

export function normalizeMarketEventData(value: unknown): WebMarketEventData {
  if (!value || typeof value !== 'object') return EMPTY_MARKET_EVENT_DATA
  const data = value as Partial<WebMarketEventData>
  const summary = data.summary ?? EMPTY_MARKET_EVENT_DATA.summary
  return {
    schemaVersion: 1,
    generatedAt: typeof data.generatedAt === 'string' ? data.generatedAt : null,
    source: data.source === 'local-sqlite' || data.source === 'cloudflare-d1' ? data.source : 'fallback',
    events: array<WebMarketEvent>(data.events),
    summary: {
      total: Number(summary.total ?? 0),
      scheduled: Number(summary.scheduled ?? 0),
      unknownDate: Number(summary.unknownDate ?? 0),
      stale: Number(summary.stale ?? 0),
      calendarIncluded: Number(summary.calendarIncluded ?? 0),
      calendarExcludedUnknownDate: Number(summary.calendarExcludedUnknownDate ?? 0),
      priorityCounts: { ...EMPTY_MARKET_EVENT_DATA.summary.priorityCounts, ...(summary.priorityCounts ?? {}) },
      decisionCounts: { ...EMPTY_MARKET_EVENT_DATA.summary.decisionCounts, ...(summary.decisionCounts ?? {}) },
      nextEventAt: typeof summary.nextEventAt === 'string' ? summary.nextEventAt : null,
    },
    meta: {
      warnings: array<string>(data.meta?.warnings),
      databasePath: typeof data.meta?.databasePath === 'string' ? data.meta.databasePath : null,
    },
  }
}

export function marketEventDateLabel(event: WebMarketEvent): string {
  if (event.time.precision === 'UNKNOWN') return '日程未確定'
  if (event.time.precision === 'WINDOW') {
    return `${event.time.windowStart ?? '?'} 〜 ${event.time.windowEnd ?? '?'}`
  }
  if (!event.time.startAt) return '日程未確定'
  if (event.time.precision === 'DATE_ONLY') return event.time.startAt
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(event.time.startAt))
  } catch {
    return event.time.startAt
  }
}