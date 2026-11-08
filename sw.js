/* Сервис-воркер «Казахский для жизни»: работа без интернета.
   Страница — сначала из сети (чтобы обновления приходили сразу), без сети — из кэша.
   Озвучка, шрифты, иконки, Firebase SDK — из кэша, в фоне обновляются.
   При изменении списка SHELL поменяйте VERSION. */
const VERSION = 'kfl-v1';
const SHELL = ['./', './index.html', './config.js', './manifest.webmanifest', './unomad-logo.png',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon-32.png'];
const CACHEABLE_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// страница может попросить скачать всю озвучку для офлайна
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'cache-audio') {
    const urls = e.data.urls || [];
    e.waitUntil(caches.open(VERSION).then(async c => {
      let done = 0;
      for (const u of urls) {
        try { if (!(await c.match(u))) { const r = await fetch(u); if (r.ok) await c.put(u, r); } } catch (_) {}
        done++;
        if (e.source) e.source.postMessage({ type: 'cache-audio-progress', done, total: urls.length });
      }
    }));
  }
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (!same && !(CACHEABLE_HOSTS.includes(url.hostname) && (url.hostname !== 'www.gstatic.com' || url.pathname.startsWith('/firebasejs/')))) return;

  // HTML: network first
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => {
      const copy = r.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); return r;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  // остальное: cache first + фоновое обновление
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
