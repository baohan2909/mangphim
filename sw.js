/**
 * Nón Sơn — Service Worker
 * Strategy:
 *   - HTML (index.html, /) : NETWORK-FIRST (luôn lấy bản mới khi có mạng)
 *   - Static assets (icons, manifest) : STALE-WHILE-REVALIDATE
 *   - Supabase API : Never cached (always fresh)
 *
 * Update flow:
 *   1. Đổi CACHE_VERSION khi update HTML
 *   2. SW mới install ngầm
 *   3. Postmessage cho app → app hiển thị banner "Có bản mới"
 *   4. User bấm → skipWaiting + reload
 */

const CACHE_VERSION = 'nonson-v17.39';
const CACHE_NAME = `nonson-cache-${CACHE_VERSION}`;

// Files cần precache cho offline (chỉ static assets quan trọng)
// CSS/JS không cần precache vì đã có cache-busting qua query string ?v=X.X
// và sẽ được cache runtime khi browser fetch lần đầu
const PRECACHE_ASSETS = [
  '/chamcong/',
  '/chamcong/index.html',
  '/chamcong/manifest.json',
  '/chamcong/icons/icon-192.png',
  '/chamcong/icons/icon-512.png',
  '/chamcong/icons/apple-touch-icon.png'
];

// ─── INSTALL ──────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  // [v13.26] AUTO skipWaiting — iOS Safari PWA standalone không tự update
  // nếu chờ user bấm banner. Force takeover → controllerchange → auto reload.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn('[SW] Precache partial:', err);
      }))
  );
});

// ─── ACTIVATE — xóa cache cũ ──────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME && k.startsWith('nonson-cache-'))
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ─── FETCH ────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  
  // Chỉ handle GET
  if (req.method !== 'GET') return;
  
  // Bỏ qua: Supabase API, GitHub raw, websocket, chrome-extension
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('googleapis.com') ||
      url.protocol === 'chrome-extension:' ||
      url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }
  
  // HTML / navigation → NETWORK FIRST
  if (req.mode === 'navigate' || 
      (req.destination === 'document') ||
      url.pathname.endsWith('.html') ||
      url.pathname === '/chamcong/' ||
      url.pathname === '/chamcong') {
    event.respondWith(networkFirst(req));
    return;
  }
  
  // Static assets → STALE-WHILE-REVALIDATE
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|woff2?|ttf|json)$/i)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  
  // Default: try cache, fallback network
  event.respondWith(
    caches.match(req).then(r => r || fetch(req))
  );
});

// ─── Strategies ───────────────────────────────────────────────────────────
async function networkFirst(req) {
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    // Fallback: trả index.html cached nếu navigate fail
    if (req.mode === 'navigate') {
      const fallback = await caches.match('/chamcong/index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then(resp => {
    if (resp && resp.status === 200) {
      cache.put(req, resp.clone());
    }
    return resp;
  }).catch(() => cached);
  return cached || fetchPromise;
}

// ─── Message handler — cho phép app ra lệnh skipWaiting ────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data && event.data.action === 'getVersion') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// [v13.38] WEB PUSH — nhận thông báo đẩy từ Supabase Edge Function
// ═══════════════════════════════════════════════════════════════════════════
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch(e) {
    payload = { title: 'Nón Sơn', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Nón Sơn · Thông báo';
  const options = {
    body: payload.body || '',
    icon: payload.icon || './icons/icon-192.png',
    badge: payload.badge || './icons/icon-192.png',
    tag: payload.tag || 'nonson-tb',
    renotify: true,
    data: { url: payload.url || './' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) { c.focus(); return; }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
