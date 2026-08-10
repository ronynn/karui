const CACHE_NAME = 'app-cache-v1'

// Section: Cache Assets (Relative Paths)
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './android.js',
  './quotes.js',
  './flap.js',
  './snake.js',
  './confetti.browser.min.js'
]

// Section: Install & Pre-cache
self.addEventListener('install', (event) =>
{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  )
})

// Section: Activate & Clean Old Caches
self.addEventListener('activate', (event) =>
{
  event.waitUntil(
    caches.keys().then((keys) =>
    {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    }).then(() => self.clients.claim())
  )
})

// Section: Fetch Handler
self.addEventListener('fetch', (event) =>
{
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) =>
      {
        if (cachedResponse)
        {
          return cachedResponse
        }
        return fetch(event.request)
      })
  )
})