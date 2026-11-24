// Local-only end-to-end states, using the real controllers and simulation.
// No production query parameter changes progression or exposes game state.
import './boot.mjs';
import { session } from './session.mjs';
import { loadingScreen } from './loading-screen.mjs';
import { gameUi } from './ui-browser.mjs';

const next = () => new Promise(resolve => requestAnimationFrame(resolve));
const $ = id => document.getElementById(id);
const scenario = new URL(location.href).searchParams.get('screen') ?? 'menu';
const settings = Object.entries(localStorage);
addEventListener('pagehide', () => { localStorage.clear(); for (const [key, value] of settings) localStorage.setItem(key, value); }, { once: true });
while (!session.ready || !$('startup-load').hidden) await next();
try {
  if (['result', 'loss', 'extraction', 'play', 'pause'].includes(scenario)) {
    if (scenario === 'extraction') {
      $('mission-select').click(); $('deploy-junction').click();
    } else $('deploy').click();
    $('deploy-practice').click();
    while (!session.running) await next();
    if (scenario === 'pause') { while (!$('startup-load').hidden) await next(); $('pause').click(); }
    else if (scenario === 'extraction') { session.sim.extractionPending = true; session.sim.phase = 'intermission'; }
    else if (scenario !== 'play') { session.sim.tutorial = null; session.sim.phase = scenario === 'loss' ? 'lost' : 'won'; }
  } else if (scenario === 'ui-failure') {
    gameUi.bindings.snapshot = () => { throw new Error('Verification-only UI failure'); }; gameUi.invalidate();
  } else if (scenario === 'loading') {
    loadingScreen.begin();
  } else if (scenario === 'failure') {
    loadingScreen.begin(); loadingScreen.fail('Verification: interrupted preparation. Retry is available.');
  } else if (scenario === 'intro') {
    if (!window.HallucinatedIntro) await import('./intro/hallucinated-intro.js');
    $('studio-intro').showModal();
    const canvas = $('studio-intro').querySelector('canvas'); canvas.width = 1280; canvas.height = 720;
    await window.HallucinatedIntro.ensureFonts(); window.HallucinatedIntro.renderFrame(canvas.getContext('2d'), 3.6, 1280, 720);
  } else {
    const target = { settings: 'menu-settings', manual: 'manual', guide: 'guide', achievements: 'achievements-open', profiles: 'profile-open', armory: 'armory-open', deployment: 'mission-select', confirm: 'new-campaign', coop: 'coop-open' }[scenario];
    if (scenario === 'settings') document.querySelector('#menu [data-settings]').click();
    else if (target) $(target).click();
  }
  document.documentElement.dataset.uiFixture = scenario;
  window.__session = session;
} catch (error) {
  document.documentElement.dataset.uiFixture = 'FAIL: ' + error.message;
  console.error('UI fixture failed', error);
}
