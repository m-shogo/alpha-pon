type D1Result<T> = { results?: T[]; success?: boolean; error?: string }

type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement
  all: <T>() => Promise<D1Result<T>>
  first: <T>() => Promise<T | null>
}

type D1Database = {
  prepare: (query: string) => D1PreparedStatement
}

type Env = {
  DB: D1Database
  PUBLIC_ORIGIN?: string
  CALENDAR_FEED_TOKEN?: string
}

type PagesContext = {
  request: Request
  env: Env
  waitUntil: (promise: Promise<unknown>) => void
}

type EventRow = {
  event_id: string
  schema_version: number
  occurrence_key: string
  issuer_code: string | null
  issuer_name: string
  event_type: string
  title: string
  status: string
  priority: 'S0' | 'S1' | 'S2' | 'S3'
  start_at: string | null
  end_at: string | null
  all_day: number
  timezone: string
  time_precision: 'EXACT' | 'DATE_ONLY' | 'WINDOW' | 'UNKNOWN'
  window_start: string | null
  window_end: string | null
  edge_types_json: string
  current_decision_state: 'BUY_WATCH' | 'WAIT' | 'BLOCK' | 'ABSTAIN' | 'INFO'
  why_it_matters: string
  checks_before_json: string
  checks_after_json: string
  related_event_ids_json: string
  current_revision_id: string | null
  last_verified_at: string
  stale_after: string | null
  created_at: string
  updated_at: string
}

type SourceRow = {
  source_id: string
  event_id: string
  authority: string
  source_type: string
  url: string
  title: string
  published_at: string | null
  retrieved_at: string
  content_hash: string
}

type RevisionRow = { event_id: string; revision_number: number }

type ProjectionEvent = {
  schemaVersion: 1
  eventId: string
  occurrenceKey: string
  issuerCode: string | null
  issuerName: string
  eventType: string
  title: string
  status: string
  priority: 'S0' | 'S1' | 'S2' | 'S3'
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
  currentDecisionState: 'BUY_WATCH' | 'WAIT' | 'BLOCK' | 'ABSTAIN' | 'INFO'
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

type MarketEventProjection = {
  schemaVersion: 1
  generatedAt: string
  source: 'cloudflare-d1'
  events: ProjectionEvent[]
  summary: {
    total: number
    scheduled: number
    unknownDate: number
    stale: number
    calendarIncluded: number
    calendarExcludedUnknownDate: number
    priorityCounts: Record<'S0' | 'S1' | 'S2' | 'S3', number>
    decisionCounts: Record<'BUY_WATCH' | 'WAIT' | 'BLOCK' | 'ABSTAIN' | 'INFO', number>
    nextEventAt: string | null
  }
  meta: {
    warnings: string[]
    databasePath: null
    calendarFeedConfigured: boolean
  }
}

function securityHeaders(): Record<string, string> {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  }
}

function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      ...securityHeaders(),
      ...headers,
    },
  })
}

function safeParseArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []
  } catch {
    return []
  }
}

function eventSortAt(row: EventRow): string | null {
  return row.time_precision === 'WINDOW' ? row.window_start : row.start_at
}

function freshness(row: EventRow, generatedAt: string): 'FRESH' | 'STALE' | 'UNKNOWN' {
  if (!row.stale_after) return 'UNKNOWN'
  return Date.parse(generatedAt) > Date.parse(row.stale_after) ? 'STALE' : 'FRESH'
}

async function projection(env: Env): Promise<MarketEventProjection> {
  const generatedAt = new Date().toISOString()
  const [eventResult, sourceResult, revisionResult] = await Promise.all([
    env.DB.prepare("SELECT * FROM market_events ORDER BY priority, COALESCE(start_at, window_start, '9999-12-31'), event_id").all<EventRow>(),
    env.DB.prepare(`
      SELECT source_id, event_id, authority, source_type, url, title,
             published_at, retrieved_at, content_hash
      FROM event_sources
      ORDER BY event_id, COALESCE(published_at, retrieved_at), source_id
    `).all<SourceRow>(),
    env.DB.prepare(`
      SELECT event_id, MAX(revision_number) AS revision_number
      FROM event_revisions
      GROUP BY event_id
    `).all<RevisionRow>(),
  ])
  if (eventResult.success === false || sourceResult.success === false || revisionResult.success === false) {
    throw new Error(eventResult.error || sourceResult.error || revisionResult.error || 'D1 query failed')
  }

  const sourceMap = new Map<string, SourceRow[]>()
  for (const source of sourceResult.results ?? []) {
    const values = sourceMap.get(source.event_id) ?? []
    values.push(source)
    sourceMap.set(source.event_id, values)
  }
  const revisionMap = new Map((revisionResult.results ?? []).map(row => [row.event_id, row.revision_number]))
  const events: ProjectionEvent[] = (eventResult.results ?? []).map(row => ({
    schemaVersion: 1,
    eventId: row.event_id,
    occurrenceKey: row.occurrence_key,
    issuerCode: row.issuer_code,
    issuerName: row.issuer_name,
    eventType: row.event_type,
    title: row.title,
    status: row.status,
    priority: row.priority,
    time: {
      startAt: row.start_at,
      endAt: row.end_at,
      allDay: row.all_day === 1,
      timezone: row.timezone,
      precision: row.time_precision,
      windowStart: row.window_start,
      windowEnd: row.window_end,
    },
    edgeTypes: safeParseArray(row.edge_types_json),
    currentDecisionState: row.current_decision_state,
    whyItMatters: row.why_it_matters,
    checksBefore: safeParseArray(row.checks_before_json),
    checksAfter: safeParseArray(row.checks_after_json),
    relatedEventIds: safeParseArray(row.related_event_ids_json),
    lastVerifiedAt: row.last_verified_at,
    staleAfter: row.stale_after,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revisionNumber: revisionMap.get(row.event_id) ?? 0,
    sources: (sourceMap.get(row.event_id) ?? []).map(source => ({
      sourceId: source.source_id,
      authority: source.authority,
      sourceType: source.source_type,
      url: source.url,
      title: source.title,
      publishedAt: source.published_at,
      retrievedAt: source.retrieved_at,
      contentHash: source.content_hash,
    })),
    freshnessState: freshness(row, generatedAt),
    calendarIncluded: row.time_precision !== 'UNKNOWN',
    sortAt: eventSortAt(row),
  }))

  const priorityCounts: MarketEventProjection['summary']['priorityCounts'] = { S0: 0, S1: 0, S2: 0, S3: 0 }
  const decisionCounts: MarketEventProjection['summary']['decisionCounts'] = { BUY_WATCH: 0, WAIT: 0, BLOCK: 0, ABSTAIN: 0, INFO: 0 }
  for (const event of events) {
    priorityCounts[event.priority] += 1
    decisionCounts[event.currentDecisionState] += 1
  }
  const stale = events.filter(event => event.freshnessState === 'STALE').length
  const unknownDate = events.filter(event => event.time.precision === 'UNKNOWN').length
  const today = generatedAt.slice(0, 10)
  const nextEventAt = events
    .filter(event => event.sortAt && !['COMPLETED', 'CANCELLED'].includes(event.status) && event.sortAt >= today)
    .map(event => event.sortAt as string)
    .sort()[0] ?? null
  const warnings: string[] = []
  if (stale) warnings.push(`${stale}件のイベントがstaleです。一次情報を再確認してください。`)
  if (unknownDate) warnings.push(`${unknownDate}件は日程未確定のためICSから除外します。`)

  return {
    schemaVersion: 1,
    generatedAt,
    source: 'cloudflare-d1',
    events,
    summary: {
      total: events.length,
      scheduled: events.filter(event => !['CANCELLED', 'COMPLETED', 'UNKNOWN_DATE'].includes(event.status)).length,
      unknownDate,
      stale,
      calendarIncluded: events.length - unknownDate,
      calendarExcludedUnknownDate: unknownDate,
      priorityCounts,
      decisionCounts,
      nextEventAt,
    },
    meta: {
      warnings,
      databasePath: null,
      calendarFeedConfigured: Boolean(env.CALENDAR_FEED_TOKEN && env.PUBLIC_ORIGIN),
    },
  }
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}

function utc(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function dateOnly(value: string): string {
  return value.slice(0, 10).replace(/-/g, '')
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function fold(line: string): string[] {
  const encoder = new TextEncoder()
  const output: string[] = []
  let current = ''
  let bytes = 0
  for (const character of line) {
    const size = encoder.encode(character).byteLength
    if (current && bytes + size > 75) {
      output.push(current)
      current = ` ${character}`
      bytes = size + 1
    } else {
      current += character
      bytes += size
    }
  }
  output.push(current)
  return output
}

function calendarFeed(data: MarketEventProjection): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Alpha Pon//Market Events v1//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Alpha Pon Market Events',
    'X-WR-CALDESC:Alpha Ponが一次情報から追跡する重要イベント。売買推奨ではありません。',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]
  for (const event of data.events) {
    if (event.time.precision === 'UNKNOWN') continue
    const dateLines: string[] = []
    if (event.time.precision === 'EXACT' && event.time.startAt) {
      const start = new Date(event.time.startAt)
      const end = event.time.endAt ? new Date(event.time.endAt) : new Date(start.getTime() + 3_600_000)
      dateLines.push(`DTSTART:${utc(start.toISOString())}`, `DTEND:${utc(end.toISOString())}`)
    } else if (event.time.precision === 'DATE_ONLY' && event.time.startAt) {
      dateLines.push(`DTSTART;VALUE=DATE:${dateOnly(event.time.startAt)}`)
      dateLines.push(`DTEND;VALUE=DATE:${dateOnly(event.time.endAt ? addDays(event.time.endAt, 1) : addDays(event.time.startAt, 1))}`)
    } else if (event.time.precision === 'WINDOW' && event.time.windowStart && event.time.windowEnd) {
      dateLines.push(`DTSTART;VALUE=DATE:${dateOnly(event.time.windowStart)}`)
      dateLines.push(`DTEND;VALUE=DATE:${dateOnly(addDays(event.time.windowEnd, 1))}`)
    }
    if (!dateLines.length) continue
    const description = [
      `判断状態: ${event.currentDecisionState}`,
      `重要理由: ${event.whyItMatters}`,
      event.checksBefore.length ? `事前確認: ${event.checksBefore.join(' / ')}` : '',
      event.checksAfter.length ? `通過後確認: ${event.checksAfter.join(' / ')}` : '',
      event.sources.length ? `一次情報: ${event.sources.map(source => source.url).join(' / ')}` : '',
      '売買推奨ではありません。',
    ].filter(Boolean).join('\n')
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.eventId}@alpha-pon`,
      `SEQUENCE:${Math.max(0, event.revisionNumber - 1)}`,
      `DTSTAMP:${utc(data.generatedAt)}`,
      `LAST-MODIFIED:${utc(event.updatedAt)}`,
      `STATUS:${event.status === 'CANCELLED' ? 'CANCELLED' : event.status === 'TENTATIVE' || event.status === 'POSTPONED' ? 'TENTATIVE' : 'CONFIRMED'}`,
      `SUMMARY:${escapeIcs(`[${event.priority}][${event.issuerCode ?? '--'}] ${event.issuerName} ${event.title}`)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      ...dateLines,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return `${lines.flatMap(fold).join('\r\n')}\r\n`
}

async function tokenMatches(requestToken: string, expectedToken: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [actual, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(requestToken)),
    crypto.subtle.digest('SHA-256', encoder.encode(expectedToken)),
  ])
  const a = new Uint8Array(actual)
  const b = new Uint8Array(expected)
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index]
  return difference === 0
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, { allow: 'GET' })

  if (url.pathname === '/healthz' || url.pathname === '/healthz/') {
    return json({
      ok: true,
      accessConfigured: false,
      apiAccessMode: 'public-read-only',
      calendarFeedConfigured: Boolean(env.CALENDAR_FEED_TOKEN && env.PUBLIC_ORIGIN),
      databaseBound: Boolean(env.DB),
    })
  }

  if (url.pathname === '/calendar.ics' || url.pathname === '/calendar.ics/') {
    const expected = env.CALENDAR_FEED_TOKEN ?? ''
    const supplied = url.searchParams.get('token') ?? ''
    if (!expected || !supplied || !(await tokenMatches(supplied, expected))) return new Response('Not found', { status: 404 })
    const data = await projection(env)
    return new Response(calendarFeed(data), {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': 'inline; filename="alpha-pon-events.ics"',
        'cache-control': 'private, max-age=300',
        ...securityHeaders(),
      },
    })
  }

  if (url.pathname === '/api/market-events' || url.pathname === '/api/market-events/') return json(await projection(env))

  if (url.pathname.startsWith('/api/market-events/')) {
    const eventId = decodeURIComponent(url.pathname.slice('/api/market-events/'.length).replace(/\/$/, ''))
    const data = await projection(env)
    const event = data.events.find(item => item.eventId === eventId)
    return event ? json(event) : json({ error: 'not found' }, 404)
  }

  if (url.pathname === '/api/calendar-feed-url' || url.pathname === '/api/calendar-feed-url/') {
    return json({ error: 'not found' }, 404)
  }

  return json({ error: 'not found' }, 404)
}

export async function onRequest(context: PagesContext): Promise<Response> {
  try {
    return await handle(context.request, context.env)
  } catch (error) {
    console.error('alpha-pon-pages-function', error)
    return json({ error: 'internal error' }, 500)
  }
}
