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
const env = {
  ASSETS: {
    async fetch(request: Request): Promise<Response> {
      assetRequests.push(new URL(request.url).pathname)
      return new Response('static asset', { status: 200 })
    },
  },
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
    env,
    context,
  )
  assert.equal(staticResponse.status, 200)
  assert.equal(await staticResponse.text(), 'static asset')
}
assert.deepEqual(assetRequests, ['/calendar/', '/api/generated/alerts/'])

const staticRequestCount = assetRequests.length
const healthResponse = await worker.fetch(
  new Request('https://alpha-pon.example/healthz'),
  env,
  context,
)
assert.equal(healthResponse.status, 200)
assert.equal(assetRequests.length, staticRequestCount, 'dynamic route must not use ASSETS')
const health = (await healthResponse.json()) as Record<string, unknown>
assert.equal(health.ok, true)
assert.equal(health.databaseBound, false)

const feedResponse = await worker.fetch(
  new Request('https://alpha-pon.example/calendar.ics'),
  env,
  context,
)
assert.equal(feedResponse.status, 404)
assert.equal(assetRequests.length, staticRequestCount, 'tokenized ICS must not fall through to ASSETS')

const apiResponse = await worker.fetch(
  new Request('https://alpha-pon.example/api/market-events'),
  env,
  context,
)
assert.equal(apiResponse.status, 503)
assert.deepEqual(await apiResponse.json(), { error: 'OWNER_EMAIL is not configured' })
assert.equal(assetRequests.length, staticRequestCount, 'live API must not fall through to ASSETS')

await Promise.all(pending)
console.log('workers-static-assets: ok')
