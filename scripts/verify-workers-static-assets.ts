import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import worker, {
  shouldRunWorker,
  type WorkerEnv,
  type WorkerExecutionContext,
} from '../worker/index.js'

const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8')

for (const required of [
  '"main": "./worker/index.ts"',
  '"keep_vars": true',
  '"directory": "./apps/web/out"',
  '"binding": "ASSETS"',
  '"html_handling": "force-trailing-slash"',
  '"not_found_handling": "404-page"',
  '"/api/market-events*"',
  '"/api/calendar-feed-url*"',
  '"/calendar.ics*"',
  '"/healthz*"',
]) {
  assert.ok(config.includes(required), `wrangler.jsonc is missing ${required}`)
}
assert.ok(!config.includes('"/api*"'), 'broad /api* routing would shadow static /api/generated/* assets')

assert.equal(shouldRunWorker('/api/market-events'), true)
assert.equal(shouldRunWorker('/api/market-events/event-1'), true)
assert.equal(shouldRunWorker('/api/calendar-feed-url/'), true)
assert.equal(shouldRunWorker('/calendar.ics'), true)
assert.equal(shouldRunWorker('/healthz/'), true)
assert.equal(shouldRunWorker('/api/generated/alerts/'), false)
assert.equal(shouldRunWorker('/calendar/'), false)
assert.equal(shouldRunWorker('/_next/static/chunk.js'), false)

const assetRequests: string[] = []
const assets = {
  async fetch(request: Request): Promise<Response> {
    assetRequests.push(new URL(request.url).pathname)
    return new Response('static asset', { status: 200 })
  },
}

const envWithoutDb = { ASSETS: assets } as unknown as WorkerEnv
const eventId = 'evt_111111111111111111111111'
const eventRows = [{
  event_id: eventId,
  schema_version: 1,
  occurrence_key: 'fy2026-q1',
  issuer_code: '8136',
  issuer_name: 'サンリオ',
  event_type: 'EARNINGS_RELEASE',
  title: 'FY2026 Q1 決算発表',
  status: 'SCHEDULED',
  priority: 'S1',
  start_at: '2026-08-10T15:00:00+09:00',
  end_at: null,
  all_day: 0,
  timezone: 'Asia/Tokyo',
  time_precision: 'EXACT',
  window_start: null,
  window_end: null,
  edge_types_json: '[]',
  current_decision_state: 'WAIT',
  why_it_matters: '不祥事後の業績影響を確認する',
  checks_before_json: '[]',
  checks_after_json: '[]',
  related_event_ids_json: '[]',
  current_revision_id: 'rev_111111111111111111111111',
  last_verified_at: '2026-08-03T06:00:00Z',
  stale_after: '2099-08-04T06:00:00Z',
  created_at: '2026-08-03T06:00:00Z',
  updated_at: '2026-08-03T06:00:00Z',
}]
const fakeDb = {
  prepare(query: string) {
    return {
      bind() { return this },
      async all<T>() {
        if (query.includes('FROM market_events')) return { success: true, results: eventRows as T[] }
        if (query.includes('FROM event_sources')) return { success: true, results: [] as T[] }
        if (query.includes('FROM event_revisions')) {
          return { success: true, results: [{ event_id: eventId, revision_number: 1 }] as T[] }
        }
        throw new Error(`Unexpected query: ${query}`)
      },
      async first<T>() { return null as T | null },
    }
  },
}
const calendarToken = '0123456789abcdef0123456789abcdef'
const envWithDb = {
  ASSETS: assets,
  DB: fakeDb,
  PUBLIC_ORIGIN: 'https://alpha-pon.example',
  CALENDAR_FEED_TOKEN: calendarToken,
} as unknown as WorkerEnv

const pending: Promise<unknown>[] = []
const context: WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>) {
    pending.push(promise)
  },
}

for (const staticPath of ['/calendar/', '/api/generated/alerts/']) {
  const staticResponse = await worker.fetch(
    new Request(`https://alpha-pon.example${staticPath}`),
    envWithoutDb,
    context,
  )
  assert.equal(staticResponse.status, 200)
  assert.equal(await staticResponse.text(), 'static asset')
}
assert.deepEqual(assetRequests, ['/calendar/', '/api/generated/alerts/'])

const staticRequestCount = assetRequests.length
const healthResponse = await worker.fetch(
  new Request('https://alpha-pon.example/healthz'),
  envWithoutDb,
  context,
)
assert.equal(healthResponse.status, 200)
assert.equal(assetRequests.length, staticRequestCount, 'dynamic route must not use ASSETS')
const health = (await healthResponse.json()) as Record<string, unknown>
assert.equal(health.ok, true)
assert.equal(health.apiAccessMode, 'public-read-only')
assert.equal(health.databaseBound, false)

const feedResponse = await worker.fetch(
  new Request('https://alpha-pon.example/calendar.ics'),
  envWithoutDb,
  context,
)
assert.equal(feedResponse.status, 404)
assert.equal(assetRequests.length, staticRequestCount, 'tokenized ICS must not fall through to ASSETS')

const apiWithoutDb = await worker.fetch(
  new Request('https://alpha-pon.example/api/market-events'),
  envWithoutDb,
  context,
)
assert.equal(apiWithoutDb.status, 503)
assert.deepEqual(await apiWithoutDb.json(), { error: 'database unavailable' })
assert.equal(assetRequests.length, staticRequestCount, 'live API must not fall through to ASSETS')

const apiWithDb = await worker.fetch(
  new Request('https://alpha-pon.example/api/market-events'),
  envWithDb,
  context,
)
assert.equal(apiWithDb.status, 200)
const projection = await apiWithDb.json() as { source: string; events: Array<{ eventId: string }> }
assert.equal(projection.source, 'cloudflare-d1')
assert.equal(projection.events.length, 1)
assert.equal(projection.events[0].eventId, eventId)

const calendarWithDb = await worker.fetch(
  new Request(`https://alpha-pon.example/calendar.ics?token=${calendarToken}`),
  envWithDb,
  context,
)
assert.equal(calendarWithDb.status, 200)
assert.match(calendarWithDb.headers.get('content-type') ?? '', /text\/calendar/)
assert.match(await calendarWithDb.text(), new RegExp(`UID:${eventId}@alpha-pon`))
assert.equal(assetRequests.length, staticRequestCount, 'live ICS must not fall through to ASSETS')

await Promise.all(pending)
console.log('workers-static-assets: ok')
