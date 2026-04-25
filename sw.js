/* ネジマッチパズル サービスワーカー
 * cache-first 戦略 — オフラインで動作 / 初回ロード後は瞬時起動
 * バージョン更新時は CACHE_NAME を上げる
 */
const CACHE_NAME = 'screw-match-v1';
const ASSETS = [
  './',
  'screw.html',
  'screw.css',
  'screw.js',
  'icon.svg',
  'manifest.json',
  'tapu.ogg',
  'match.ogg',
  'clear.ogg',
  'gameover.ogg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // 個別 add で 1ファイル失敗しても全体を巻き込まない
      Promise.all(ASSETS.map((url) => cache.add(url).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        // 同一オリジンの正常応答のみキャッシュ
        if (resp && resp.ok && new URL(req.url).origin === self.location.origin) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return resp;
      }).catch(() => caches.match('screw.html'));
    })
  );
});
