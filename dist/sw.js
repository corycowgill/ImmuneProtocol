// The installed app's offline cache. Installed from the home screen the game opens full screen
// and loads from here; anything it has fetched before keeps working without a connection.
//
//   Code and data (the page, modules, styles, translations): network first, so a new deploy is
//   picked up on the next launch, with the cached copy when offline or the network stalls.
//   Assets (models, textures, music, sounds, fonts): served from the cache at once, and checked
//   with the server in the background at most once a day.
//   Story videos are left to the browser: they stream in ranges and would fill the cache.
const CODE = 'immune-protocol-code-v1';
const ASSETS = 'immune-protocol-assets-v1';
const KEEP = [CODE, ASSETS];
const NETWORK_WAIT = 4000;
const RECHECK = 24 * 60 * 60 * 1000;
const FETCHED_AT = 'x-immune-cached-at';

const CODE_TYPES = /\.(?:html|mjs|js|css|json|webmanifest)$/;
const ASSET_TYPES = /\.(?:glb|webp|png|jpg|svg|woff2|mp3|wav)$/;

self.addEventListener('install', event => {
  // The shell, so a launch with no connection still reaches the loading screen.
  event.waitUntil(caches.open(CODE)
    .then(cache => cache.addAll(['./', 'index.html', 'boot.mjs', 'loading.css', 'styles.css']).catch(() => {}))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(names => Promise.all(names.filter(name => name.startsWith('immune-protocol-') && !KEEP.includes(name)).map(name => caches.delete(name))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/__')) return;
  if (request.mode === 'navigate' || CODE_TYPES.test(url.pathname)) event.respondWith(networkFirst(request));
  else if (ASSET_TYPES.test(url.pathname)) event.respondWith(cacheFirst(request, event));
});

async function networkFirst(request) {
  const cache = await caches.open(CODE);
  const network = fetch(request).then(response => {
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  });
  network.catch(() => {});
  // A stalled network falls back to the cached copy rather than leaving the launch hanging.
  const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_WAIT));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    return cached ?? await network;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;
    throw error;
  }
}

// Stores a response stamped with when it was fetched, so the daily recheck knows its age.
async function store(cache, request, response) {
  const headers = new Headers(response.headers);
  headers.set(FETCHED_AT, String(Date.now()));
  const body = await response.blob();
  await cache.put(request, new Response(body, { status: response.status, statusText: response.statusText, headers }));
}

async function cacheFirst(request, event) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  const refresh = () => fetch(request, { cache: 'no-cache' }).then(response => {
    if (response.ok && response.type === 'basic') return store(cache, request, response.clone()).then(() => response);
    return response;
  });
  if (!cached) return refresh();
  const age = Date.now() - Number(cached.headers.get(FETCHED_AT) || 0);
  if (age > RECHECK) event.waitUntil(refresh().catch(() => {}));
  return cached;
}
