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
