// Project Academy — Service Worker
// Strategy: Cache-first for app shell, network-first for API calls

const CACHE_NAME = 'project-academy-v3';
const STATIC_CACHE = 'pa-static-v3';
const FONT_CACHE   = 'pa-fonts-v3';

// App shell — cache on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Google Fonts — cache on first fetch
const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

// Never cache — always network
const NETWORK_ONLY = [
  'https://api.anthropic.com',
  '/api/',
];

// ── Install: pre-cache app shell ─────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== FONT_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: route requests ─────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Always network: Anthropic API, serverless functions, and HTML pages
  if (NETWORK_ONLY.some(u => request.url.includes(u))) {
    event.respondWith(fetch(request));
    return;
  }

  // Always fetch fresh HTML — never serve stale app shell
  if (request.destination === 'document') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first: Google Fonts
  if (FONT_ORIGINS.some(o => url.origin === o || request.url.startsWith(o))) {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // Cache-first with network fallback: app shell
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request).then(response => {
          // Update cache with fresh version
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached); // offline fallback

        // Return cached immediately, update in background
        return cached || networkFetch;
      })
    );
    return;
  }
});

// ── Background sync: save progress when back online ──────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-progress') {
    event.waitUntil(syncProgress());
  }
});

async function syncProgress() {
  // Notify all clients to trigger a cloud save
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'SYNC_PROGRESS' }));
}

// ── Push notifications (future) ───────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Project Academy', {
      body: data.body || 'You have a new lesson waiting!',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});
