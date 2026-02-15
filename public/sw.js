const CACHE_NAME = 'synapse-v1';
const STATIC_ASSETS = ['/icon-192.png', '/icon-512.png'];

// Install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch - network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) {
    // Network first for API
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  } else if (STATIC_ASSETS.includes(url.pathname)) {
    // Cache first for static
    event.respondWith(
      caches.match(event.request).then((r) => r || fetch(event.request))
    );
  }
});

// Push notification
self.addEventListener('push', (event) => {
  let data = { title: 'Synapse', body: 'New notification', url: '/chat' };
  try {
    data = { ...data, ...event.data.json() };
  } catch (e) {
    data.body = event.data?.text() || data.body;
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/chat' },
      vibrate: [200, 100, 200],
    })
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/chat';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
