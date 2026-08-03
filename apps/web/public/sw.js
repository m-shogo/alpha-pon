const CACHE_VERSION = 'alpha-pon-v2'
const SHELL_CACHE = `${CACHE_VERSION}-shell`
const DATA_CACHE = `${CACHE_VERSION}-data`
const SHELL_URLS = [
  '/',
  '/calendar/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/generated/alpha-pon-events.json',
  '/generated/alpha-pon-events.ics',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => Promise.allSettled(
      SHELL_URLS.map(async (url) => {
        const response = await fetch(url, { cache: 'reload' })
        if (!response.ok) throw new Error(`precache failed: ${url} ${response.status}`)
        await cache.put(url, response)
      }),
    )),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key)),
    )),
  )
  self.clients.claim()
})

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch (error) {
    const cached = await cache.match(request)
    if (cached) return cached
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // API and tokenized calendar feeds must never be persisted by the service worker.
  if (url.pathname.startsWith('/api/') || url.pathname === '/calendar.ics') return

  if (url.pathname.startsWith('/generated/')) {
    event.respondWith(networkFirst(request, DATA_CACHE))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, SHELL_CACHE).catch(async () => {
        const cache = await caches.open(SHELL_CACHE)
        return (await cache.match(request)) || (await cache.match('/')) || Response.error()
      }),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then(async (response) => {
      if (response.ok && ['style', 'script', 'image', 'font'].includes(request.destination)) {
        const cache = await caches.open(SHELL_CACHE)
        await cache.put(request, response.clone())
      }
      return response
    })),
  )
})
