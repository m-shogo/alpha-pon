import { onRequest } from '../functions/[[path]].js'

type PagesRequestContext = Parameters<typeof onRequest>[0]

type AssetsBinding = {
  fetch: (request: Request) => Promise<Response>
}

export type WorkerEnv = PagesRequestContext['env'] & {
  ASSETS: AssetsBinding
}

export type WorkerExecutionContext = {
  waitUntil: (promise: Promise<unknown>) => void
}

/**
 * Only live D1/auth routes execute the Worker before static-asset lookup.
 * Existing /api/generated/* exports must remain static assets.
 */
export function shouldRunWorker(pathname: string): boolean {
  return (
    pathname === '/api/market-events' ||
    pathname.startsWith('/api/market-events/') ||
    pathname === '/api/calendar-feed-url' ||
    pathname === '/api/calendar-feed-url/' ||
    pathname === '/calendar.ics' ||
    pathname === '/calendar.ics/' ||
    pathname === '/healthz' ||
    pathname === '/healthz/'
  )
}

function isDatabaseBackedRoute(pathname: string): boolean {
  return (
    pathname === '/api/market-events' ||
    pathname.startsWith('/api/market-events/') ||
    pathname === '/calendar.ics' ||
    pathname === '/calendar.ics/'
  )
}

function databaseUnavailableResponse(): Response {
  return new Response(JSON.stringify({ error: 'database unavailable' }), {
    status: 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  })
}

function hardenDynamicResponse(response: Response): Response {
  const headers = new Headers(response.headers)
  // Public means anonymously readable by direct request. Browser cross-origin reads remain disabled.
  headers.delete('access-control-allow-origin')
  headers.delete('access-control-allow-credentials')
  headers.set('cross-origin-resource-policy', 'same-origin')
  headers.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'no-referrer')
  headers.set('x-frame-options', 'DENY')
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export async function fetchAlphaPon(
  request: Request,
  env: WorkerEnv,
  context: WorkerExecutionContext,
): Promise<Response> {
  const pathname = new URL(request.url).pathname

  if (shouldRunWorker(pathname)) {
    const response = await onRequest({
      request,
      env,
      waitUntil: (promise: Promise<unknown>) => context.waitUntil(promise),
    })
    if (response.status === 500 && isDatabaseBackedRoute(pathname)) {
      return hardenDynamicResponse(databaseUnavailableResponse())
    }
    return hardenDynamicResponse(response)
  }

  return env.ASSETS.fetch(request)
}

export default {
  fetch: fetchAlphaPon,
}
