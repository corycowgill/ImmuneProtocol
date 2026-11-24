// Local-only: runs a mission's simulation with the game's own per-frame code (events, HUD,
// markers, hints) against the real page, without the 3D world, and reports any error with its
// stack. Usage: /__play?area=intestines&seconds=120
import { session } from './session.mjs';
import { input } from './controls.mjs';
import { Simulation } from './simulation.mjs';
import { GameAudio } from './audio.mjs';
import { applyEvents } from './field-events.mjs';
import { drawHud } from './hud.mjs';
import { updateAbilityHints } from './ability-hints.mjs';

const params = new URL(location.href).searchParams;
const area = params.get('area') ?? 'intestines';
const seconds = Number(params.get('seconds') ?? 120);
session.audio = new GameAudio();
session.options = {};
session.sim = new Simulation(area, { ai: { seed: 5 } });
session.sim.start();
session.sim.tutorial = null;
session.running = true;
session.paused = false;
document.getElementById('menu').hidden = true;
document.getElementById('game').hidden = false;
const errors = [];
let frames = 0;
const dt = 1 / 30;
let r = 77;
const random = () => (r = (r * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < seconds / dt; i++) {
  if (i % 45 === 0) Object.assign(input, { moveX: random() * 2 - 1, moveZ: random() < .8 ? 1 : -1, lookX: (random() - .5) * 300, fire: random() < .6, jump: random() < .2, dash: random() < .1, melee: random() < .15, grenade: random() < .05, stun: random() < .03 });
  else Object.assign(input, { lookX: 0, jump: false, dash: false, melee: false, grenade: false, stun: false });
  try {
    session.sim.step(dt, input);
    applyEvents();
    updateAbilityHints(dt);
    drawHud();
    // Markers and attacker arrows project through the 3D camera, which this check does not build.
  } catch (error) {
    errors.push(`t=${session.sim.clock.toFixed(1)} organ=${session.sim.organ?.phase} ${error.message}\n${(error.stack || '').split('\n').slice(0, 6).join('\n')}`);
    if (errors.length > 3) break;
  }
  if (session.sim.player.health < 30) session.sim.player.health = 100;
  if (session.sim.phase === 'lost') { session.sim.phase = 'combat'; }
  frames++;
}
window.__result = { area, frames, clock: session.sim.clock.toFixed(1), wave: session.sim.wave, errors };
document.documentElement.dataset.ready = '1';
