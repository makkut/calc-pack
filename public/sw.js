const CACHE = 'parcel-calculator-cloud-v3'

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(['/', '/manifest.webmanifest']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names
          .filter(name => name.startsWith('parcel-calculator-') && name !== CACHE)
          .map(name => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url)
  // Never intercept Firebase/Auth/Firestore network traffic.
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return

  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone()
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)))
      }
      return response
    }).catch(async () => {
      const cached = await caches.match(event.request)
      return cached || caches.match('/')
    }),
  )
})
