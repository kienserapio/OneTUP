/*
 * OneTUP service worker.
 *
 * Deliberately small and hand-written. A generated worker is a large amount of
 * code doing things this app does not need, and the offline behaviour here is
 * specific enough to be worth stating explicitly:
 *
 *   - The app shell is precached, so a cold open with no signal still paints.
 *   - Navigations are network-first with a cached-shell fallback, so a deploy
 *     is picked up immediately but a dead zone still opens the app.
 *   - Data is never cached here. IndexedDB is the offline read source, and two
 *     competing caches would eventually disagree about what a student's
 *     schedule says.
 *   - Web Push is handled here, because on iOS an installed PWA is the only
 *     place a notification can arrive at all.
 */

const VERSION = 'v1'
const SHELL_CACHE = `onetup-shell-${VERSION}`
const ASSET_CACHE = `onetup-assets-${VERSION}`

const SHELL_URLS = ['/today', '/offline', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('onetup-') && !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Anything authenticated or dynamic goes straight to the network. Caching a
  // student's own data here would put it in two places with two lifetimes.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request))
  }
})

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/icons/') ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(pathname)
  )
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = (await caches.match(request)) ?? (await caches.match('/today'))
    return cached ?? caches.match('/offline')
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(ASSET_CACHE)
    cache.put(request, response.clone())
  }
  return response
}

// --- Push ----------------------------------------------------------------

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'OneTUP', body: event.data.text() }
  }

  const options = {
    body: payload.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: payload.tag,
    // A replaced notification for the same class should not re-buzz a pocket.
    renotify: Boolean(payload.renotify),
    requireInteraction: payload.kind === 'wake_alarm',
    data: { url: payload.url ?? '/today', kind: payload.kind },
    actions: payload.actions ?? [],
    timestamp: payload.timestamp,
  }

  event.waitUntil(self.registration.showNotification(payload.title ?? 'OneTUP', options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const action = event.action
  const target = new URL(
    action && action.startsWith('/') ? action : (event.notification.data?.url ?? '/today'),
    self.location.origin,
  ).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reuse an open tab rather than stacking another one every notification.
      for (const client of clients) {
        if (client.url === target && 'focus' in client) return client.focus()
      }
      for (const client of clients) {
        if ('navigate' in client) return client.navigate(target).then((c) => c && c.focus())
      }
      return self.clients.openWindow(target)
    }),
  )
})

// Flush the offline write queue when the browser tells us we are back.
self.addEventListener('sync', (event) => {
  if (event.tag !== 'onetup-flush') return
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
      for (const client of clients) client.postMessage({ type: 'flush-queue' })
    }),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'skip-waiting') self.skipWaiting()
})
