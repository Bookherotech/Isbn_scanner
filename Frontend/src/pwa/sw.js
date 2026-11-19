/* global self, caches, fetch, Response, Request */
/**
 * BookHero service worker. Not bundled: vite.config.js copies it to dist/sw.js and replaces
 * __BUILD_ID__ with a hash of the build, so every deploy that changes the app is a new worker.
 *
 * A new worker waits (no skipWaiting on install): the page shows an "Update" button and sends
 * SKIP_WAITING when the user clicks it, so the app never changes version under someone mid-task.
 */
const CACHE = 'bookhero-__BUILD_ID__'
const SHELL = '/index.html'

self.addEventListener('install', (event) => {
  // The app shell, so the installed app still opens when the connection drops.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(new Request(SHELL, { cache: 'reload' }))))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('bookhero-') && key !== CACHE).map((key) => caches.delete(key)))),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Pages: always the network (fresh index.html after a deploy); the cached shell only when offline.
  if (request.mode === 'navigate') {
    if (/^\/(api|media|static)\//.test(url.pathname)) return
    event.respondWith(fetch(request).catch(() => caches.match(SHELL).then((hit) => hit || Response.error())))
    return
  }

  // Built files have a content hash in the name and never change: cache first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)))
            }
            return response
          }),
      ),
    )
  }
  // Everything else (API, media, fonts, icons): straight to the network as before.
})
