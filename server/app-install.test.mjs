import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const dist = new URL('../dist/', import.meta.url);
const read = path => readFile(new URL(path, dist));

// Width and height from a PNG's IHDR chunk.
function pngSize(buffer) {
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG');
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

test('the game installs as a full-screen landscape app with its icons', async () => {
  const manifest = JSON.parse(await read('manifest.webmanifest'));
  assert.equal(manifest.name, 'Immune Protocol');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './', 'relative, so it works under the GitHub Pages project path');
  assert.equal(manifest.display, 'fullscreen');
  assert.equal(manifest.orientation, 'landscape');
  const sizes = new Map();
  for (const icon of manifest.icons) {
    const [width, height] = pngSize(await read(icon.src));
    assert.equal(`${width}x${height}`, icon.sizes, icon.src);
    sizes.set(icon.purpose + icon.sizes, true);
  }
  assert.ok(sizes.has('any192x192') && sizes.has('any512x512') && sizes.has('maskable512x512'));
  assert.deepEqual(pngSize(await read('assets/app/apple-touch-icon.png')), [180, 180]);

  const html = (await read('index.html')).toString();
  for (const tag of ['rel="manifest" href="manifest.webmanifest"', 'rel="apple-touch-icon" href="assets/app/apple-touch-icon.png"',
    'name="apple-mobile-web-app-capable" content="yes"', 'name="apple-mobile-web-app-status-bar-style" content="black-translucent"']) {
    assert.ok(html.includes(tag), tag);
  }
  const boot = (await read('boot.mjs')).toString();
  assert.match(boot, /register\('\.\/sw\.js'\)/);
  assert.match(boot, /'localhost', '127\.0\.0\.1'/, 'no offline cache on a local development server');
});

// Runs sw.js against a fake worker scope and reports how it would answer each request.
async function worker() {
  const listeners = {};
  const scope = {
    location: new URL('https://example.test/ImmuneProtocol/sw.js'),
    addEventListener: (type, listener) => { listeners[type] = listener; },
    skipWaiting() {}, clients: { claim() {} },
  };
  scope.self = scope;
  Object.assign(scope, { URL, Headers, Response, Date, Promise, String, Number, setTimeout, caches: { open: async () => ({}) } });
  vm.runInNewContext((await read('sw.js')).toString(), scope);
  return (url, { method = 'GET', mode = 'cors', headers = {} } = {}) => {
    let handled = false;
    listeners.fetch({
      request: { url, method, mode, headers: new Headers(headers) },
      respondWith: answer => { handled = true; answer.catch?.(() => {}); },
    });
    return handled;
  };
}

test('the offline cache serves the game\'s code and assets, and leaves videos, ranges and other sites alone', async () => {
  const handles = await worker();
  const base = 'https://example.test/ImmuneProtocol/';
  assert.ok(handles(base, { mode: 'navigate' }), 'the page');
  for (const path of ['game.mjs', 'styles.css', 'locales/de.json', 'manifest.webmanifest', 'intro/start.js']) assert.ok(handles(base + path), path);
  for (const path of ['assets/enemies/virus.glb', 'assets/tissue.webp', 'assets/music/levels/lungs.mp3', 'vendor/inter-variable.woff2']) assert.ok(handles(base + path), path);
  assert.equal(handles(base + 'assets/story/campaign-intro.mp4'), false, 'videos stream from the network');
  assert.equal(handles(base + 'assets/music/levels/lungs.mp3', { headers: { range: 'bytes=0-' } }), false, 'range requests pass through');
  assert.equal(handles('https://fonts.example/font.woff2'), false, 'other sites pass through');
  assert.equal(handles(base + 'game.mjs', { method: 'POST' }), false);
});
