// public/sw.js
// Service Worker for offline PWA support

const CACHE_NAME = 'yt-archive-v1.0.0';
const RUNTIME_CACHE = 'yt-archive-runtime';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/../src/css/tokens/variables.css',
  '/../src/css/tokens/base.css',
  '/../src/js/services/storage.js',
  '/../src/js/services/youtube-api.js',
  '/../src/js/services/github-sync.js',
  '/../src/js/services/offline-queue.js',
  '/../src/js/app.js',
];

// Install event - precache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precaching app shell');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      console.log('[SW] Install complete');
      return self.skipWaiting();
    })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Activate complete');
      return self.clients.claim();
    })
  );
});

// Fetch event - cache-first strategy for static, network-first for API
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and browser extensions
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }

  // For GitHub API calls - network first, no caching
  if (url.hostname === 'api.github.com') {
    return; // Let the browser handle API calls normally
  }

  // For YouTube oEmbed - network first with cache fallback
  if (url.hostname === 'www.youtube.com' && url.pathname === '/oembed') {
    event.respondWith(networkFirstWithCache(request, RUNTIME_CACHE));
    return;
  }

  // For static assets - cache first with network fallback
  event.respondWith(cacheFirstWithNetwork(request, CACHE_NAME));
});

/**
 * Cache-first strategy: try cache first, fallback to network
 * @param {Request} request - Fetch request
 * @param {string} cacheName - Cache storage name
 * @returns {Promise<Response>}
 */
async function cacheFirstWithNetwork(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    // Cache a copy of the response
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn('[SW] Network request failed, no cache available:', request.url);
    // Return a fallback for HTML requests
    if (request.headers.get('accept')?.includes('text/html')) {
      return caches.match('/index.html');
    }
    throw error;
  }
}

/**
 * Network-first strategy: try network first, fallback to cache
 * @param {Request} request - Fetch request
 * @param {string} cacheName - Cache storage name
 * @returns {Promise<Response>}
 */
async function networkFirstWithCache(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn('[SW] Network request failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Handle messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});