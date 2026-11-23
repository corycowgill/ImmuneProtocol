// Local-only: the real keyboard handlers (controls.mjs) against a running simulation, without
// the 3D world, so key bindings can be checked quickly in a headless browser.
import { session } from './session.mjs';
import { controls } from './controls.mjs';
import { Simulation } from './simulation.mjs';
session.sim = new Simulation('artery');
session.sim.start();
session.running = true;
session.paused = false;
window.__keys = { controls, session };
document.documentElement.dataset.ready = '1';
