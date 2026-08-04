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

export async function fetchAlphaPon(
  request: Request,
  env: WorkerEnv,
  context: WorkerExecutionContext,
): Promise<Response> {
  const pathname = new URL(request.url).pathname

  if (shouldRunWorker(pathname)) {
    return onRequest({
      request,
      env,
      waitUntil: (promise: Promise<unknown>) => context.waitUntil(promise),
    })
  }

  return env.ASSETS.fetch(request)
}

export default {
  fetch: fetchAlphaPon,
}
