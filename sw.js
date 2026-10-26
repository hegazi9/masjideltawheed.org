/* ═══════════════════════════════════════════════════════════════════════
   sw.js — عامل الخدمة (Service Worker) | مدرسة التوحيد القرآنية — دفعة ٣٥ (الموبايل)
   • التطبيق: صفحات الموقع من النت الأول (أحدث نسخة دايماً) — لو النت بطيء أو
     مقطوع: آخر نسخة محفوظة، ولو مفيش: صفحة «مفيش إنترنت».
   • إشعارات Push: بتيجي من السيرفر (Edge Function send-push) وبتظهر على الجهاز
     حتى لو التطبيق مقفول. الضغط عليها بيفتح اللوحة على الإشعار.
   • Supabase والمكتبات الخارجية مالهمش دعوة بالكاش خالص.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const VER = 'tawheed-v2';
const CORE = ['offline.html', 'pwa-192.png', 'pwa-512.png', 'pwa-64.png', 'pwa-badge.png'];
// Safari (آيفون/ماك): أي Push من غير إشعار ظاهر ← بيلغي الاشتراك بعد كام مرة → لازم يظهر دايماً
const STRICT = /Safari/.test(self.navigator.userAgent) && !/Chrome|Chromium|CriOS|Android|Edg/.test(self.navigator.userAgent);
const NET_WAIT_MS = 4500;   // لو فيه نسخة محفوظة والنت أبطأ من كده → المحفوظة

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VER).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) { /* مش مدعوم */ }
    }
    await self.clients.claim();
  })());
});

/* ══════════ الصفحات والملفات ══════════ */
function cacheKey(url) { const u = new URL(url); return u.origin + u.pathname; }
function cacheable(r) { return r && r.ok && r.type === 'basic' && !r.redirected; }
function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (err) => { clearTimeout(t); reject(err); });
  });
}

async function fromNet(e, cache) {
  const r = (e.request.mode === 'navigate' && (await e.preloadResponse)) || (await fetch(e.request));
  if (cacheable(r)) e.waitUntil(cache.put(cacheKey(e.request.url), r.clone()).catch(() => { /* الكاش مليان */ }));
  return r;
}

async function handle(e) {
  const cache = await caches.open(VER);
  const hit = await cache.match(cacheKey(e.request.url));
  const net = fromNet(e, cache);
  e.waitUntil(net.then(() => {}, () => {}));          // يكمّل تحديث الكاش في الخلفية
  try {
    return await (hit ? withTimeout(net, NET_WAIT_MS) : net);
  } catch (_) {
    if (hit) return hit;
    if (e.request.mode === 'navigate') {
      const off = await cache.match(cacheKey(new URL('offline.html', self.registration.scope).href));
      if (off) return off;
    }
    return Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // Supabase / CDN → المتصفح عادي
  if (req.mode === 'navigate' || /\.(js|png|webmanifest)$/i.test(url.pathname)) e.respondWith(handle(e));
});

/* ══════════ إشعارات Push ══════════ */
function targetUrl(u) {
  return new URL(String(u || 'login.html').replace(/^\//, ''), self.registration.scope).href;
}

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    // رقم الإشعارات غير المقروءة على أيقونة التطبيق
    if (typeof d.badge === 'number' && self.navigator && self.navigator.setAppBadge) {
      try { if (d.badge > 0) await self.navigator.setAppBadge(d.badge); else await self.navigator.clearAppBadge(); } catch (_) { /* مش مدعوم */ }
    }
    const url = targetUrl(d.url);
    const path = new URL(url).pathname;
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // اللوحة مفتوحة قدّامه دلوقتي → الإشعار جوه اللوحة كفاية (إلا إشعار التجربة • والآيفون لازم يظهر دايماً)
    const inFront = wins.some((w) => w.focused && w.visibilityState === 'visible' && new URL(w.url).pathname === path);
    if (inFront && !d.force && !STRICT) return;
    await self.registration.showNotification(d.title || 'مدرسة التوحيد', {
      body: d.body || '',
      icon: 'pwa-192.png',
      badge: 'pwa-badge.png',        // الأيقونة الصغيرة في شريط الأندرويد
      vibrate: [80, 40, 80],
      tag: d.tag || undefined,
      renotify: !!d.tag,
      dir: 'rtl',
      lang: 'ar',
      timestamp: Date.now(),
      data: { url, id: d.id || null },
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  const url = data.url || targetUrl('login.html');
  const path = new URL(url).pathname;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).pathname === path && 'focus' in w) {
        try { await w.focus(); } catch (_) { /* مش مشكلة */ }
        w.postMessage({ type: 'pwa-open', id: data.id || null });
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
