import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type MarketEventDecisionState = 'BUY_WATCH' | 'WAIT' | 'BLOCK' | 'ABSTAIN' | 'INFO'
export type MarketEventPriority = 'S0' | 'S1' | 'S2' | 'S3'

export type MarketEventView = {
  schemaVersion: 1
  eventId: string
  issuerCode: string | null
  issuerName: string
  eventType: string
  title: string
  status: string
  priority: MarketEventPriority
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
  currentDecisionState: MarketEventDecisionState
  whyItMatters: string
  checksBefore: string[]
  checksAfter: string[]
  createdAt: string
  updatedAt: string
}

export type MarketEventProjection = {
  schemaVersion: 1
  generatedAt: string | null
  source: 'local-ledger' | 'd1' | 'fallback'
  staleAfter: string | null
  events: MarketEventView[]
  counts: {
    total: number
    scheduled: number
    unknownDate: number
    actionRequired: number
  }
  warnings: string[]
}

const DATA_PATH = join(process.cwd(), 'public', 'generated', 'alpha-pon-events.json')

const FALLBACK: MarketEventProjection = {
  schemaVersion: 1,
  generatedAt: null,
  source: 'fallback',
  staleAfter: null,
  events: [],
  counts: { total: 0, scheduled: 0, unknownDate: 0, actionRequired: 0 },
  warnings: ['イベントデータが未生成です。Cloudflare接続前はローカル台帳からprojectionを生成してください。'],
}

export function loadMarketEvents(now = new Date()): MarketEventProjection {
  if (!existsSync(DATA_PATH)) return FALLBACK
  try {
    const value = JSON.parse(readFileSync(DATA_PATH, 'utf8')) as Partial<MarketEventProjection>
    const events = Array.isArray(value.events) ? value.events : []
    const stale = typeof value.staleAfter === 'string' && Date.parse(value.staleAfter) < now.getTime()
    return {
      ...FALLBACK,
      ...value,
      generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : null,
      staleAfter: typeof value.staleAfter === 'string' ? value.staleAfter : null,
      source: value.source === 'd1' || value.source === 'local-ledger' ? value.source : 'fallback',
      events,
      counts: {
        total: events.length,
        scheduled: events.filter((event) => ['SCHEDULED', 'TENTATIVE', 'IN_PROGRESS'].includes(event.status)).length,
        unknownDate: events.filter((event) => event.time?.precision === 'UNKNOWN').length,
        actionRequired: events.filter((event) => ['BUY_WATCH', 'WAIT', 'BLOCK', 'ABSTAIN'].includes(event.currentDecisionState)).length,
      },
      warnings: stale ? ['イベントデータが古い可能性があります。最終更新時刻を確認してください。'] : [],
    }
  } catch {
    return { ...FALLBACK, warnings: ['イベントデータの読み込みに失敗しました。壊れたprojectionは表示していません。'] }
  }
}

export function eventDisplayDate(event: MarketEventView): string {
  if (event.time.precision === 'UNKNOWN') return '日程未確定'
  if (event.time.precision === 'WINDOW') {
    return `${event.time.windowStart?.slice(0, 10) ?? '?'} 〜 ${event.time.windowEnd?.slice(0, 10) ?? '?'}`
  }
  if (!event.time.startAt) return '日程未確定'
  const date = new Date(event.time.startAt)
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: event.time.timezone || 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: event.time.precision === 'EXACT' ? '2-digit' : undefined,
    minute: event.time.precision === 'EXACT' ? '2-digit' : undefined,
  }).format(date)
}
