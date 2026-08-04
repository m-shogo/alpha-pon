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
 * These routes contain dynamic or protected responses and must execute the
 * Worker before Cloudflare attempts a static-asset lookup.
 */
export function shouldRunWorker(pathname: string): boolean {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
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
