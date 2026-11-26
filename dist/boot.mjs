import { loadingScreen, paintLoading } from './loading-screen.mjs';
import { gameUi } from './ui-browser.mjs';

// This small entry point paints before downloading/evaluating the game's module graph.
loadingScreen.begin();
registerOfflineCache();
try {
  gameUi.start();
  await import('./intro/start.js');
  await paintLoading();
  await import('./game.mjs');
} catch (error) {
  console.error('Could not load Immune Protocol', error);
  loadingScreen.fail('The lab lost its connection. Check your connection and retry loading.');
}

// The installed app's offline cache (sw.js). Not on a local development server, where a cached
// module would hide the edit just made; add ?sw=1 there to try it.
function registerOfflineCache() {
  if (!('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (local && new URLSearchParams(location.search).get('sw') !== '1') return;
  // After the page has loaded, so the cache's own downloads never compete with the game's.
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Offline cache unavailable', error)), { once: true });
}
