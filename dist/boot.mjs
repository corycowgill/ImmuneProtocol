import { loadingScreen, paintLoading } from './loading-screen.mjs';

// This small entry point paints before downloading/evaluating the game's module graph.
loadingScreen.begin();
await paintLoading();
try {
  await import('./game.mjs');
} catch (error) {
  console.error('Could not load Immune Protocol', error);
  loadingScreen.fail('The lab lost its connection. Check your connection and retry loading.');
}
