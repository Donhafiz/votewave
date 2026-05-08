/**
 * VoteWave PWA - Service Worker
 * Enables offline caching and app-like experience
 */

const CACHE_NAME = 'votewave-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/frontend/index.html',
  '/frontend/css/styles.css',
  '/frontend/css/landing.css',
  '/frontend/css/admin.css',
  '/frontend/js/main.js',
  '/frontend/js/landing.js',
  '/frontend/js/chatbot.js',
  '/frontend/js/payment.js',
  '/frontend/js/admin.js',
  '/frontend/js/admin-dashboard.js',
  '/frontend/js/admin-elections.js',
  '/frontend/js/admin-users.js',
  '/frontend/js/pwa.js',
  '/frontend/auth/login.html',
  '/frontend/auth/register.html',
  '/frontend/voter/elections.html',
  '/frontend/voter/vote.html',
  '/frontend/voter/nominations.html',
  '/frontend/voter/events.html',
  '/frontend/voter/club-elections.html',
  '/frontend/admin/dashboard.html',
  '/frontend/admin/elections.html',
  '/frontend/admin/candidates.html',
  '/frontend/admin/users.html',
  '/frontend/admin/results.html',
  '/frontend/admin/settings.html',
  '/frontend/event-micro.html',
  '/frontend/nominee-register.html',
  '/frontend/manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap',
  'https://unpkg.com/lucide@latest',
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://js.paystack.co/v2/paystack.js',
];

// Install event - Cache all assets
self.addEventListener('install', (event) => {
  console.log('📦 VoteWave Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Caching app shell');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        console.log('📦 Service Worker installed');
        return self.skipWaiting();
      })
  );
});

// Activate event - Clean old caches
self.addEventListener('activate', (event) => {
  console.log('✅ VoteWave Service Worker: Activated');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip API calls and non-GET requests
  if (
    event.request.url.includes('/api/') ||
    event.request.url.includes('paystack') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached response if available
      if (cachedResponse) {
        // Fetch update in background
        fetch(event.request)
          .then((response) => {
            if (response.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, response);
              });
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      // Network first, cache as fallback
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // Return offline fallback for HTML pages
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match('/frontend/index.html');
          }
        });
    })
  );
});

// Push notification event
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New update from VoteWave',
    icon: 'https://votewave-three.vercel.app/frontend/assets/icons/icon-192.png',
    badge: 'https://votewave-three.vercel.app/frontend/assets/icons/icon-72.png',
    vibrate: [200, 100, 200],
    tag: 'votewave-notification',
    actions: [
      { action: 'open', title: 'Open VoteWave' },
      { action: 'close', title: 'Dismiss' }
    ],
    data: { url: 'https://votewave-three.vercel.app' }
  };

  event.waitUntil(
    self.registration.showNotification('VoteWave 🗳️', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    const url = event.notification.data?.url || 'https://votewave-three.vercel.app';
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
  }
});

console.log('📱 VoteWave PWA Service Worker Ready');