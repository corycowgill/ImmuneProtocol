import { loadingScreen, paintLoading } from './loading-screen.mjs';
import { gameUi } from './ui-browser.mjs';

// This small entry point paints before downloading/evaluating the game's module graph.
loadingScreen.begin();
try {
  gameUi.start();
  await import('./intro/start.js');
  await paintLoading();
  await import('./game.mjs');
} catch (error) {
  console.error('Could not load Immune Protocol', error);
  loadingScreen.fail('The lab lost its connection. Check your connection and retry loading.');
}
