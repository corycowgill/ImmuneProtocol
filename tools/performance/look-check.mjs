// Local-only fixture, served at /__look by the performance server. Prepares one arena at High
// quality with the real renderer, HUD and effects, and renders frames only on request, so a
// browser driver (even a slow software rasterizer) can stage a moment and photograph it for
// visual review. Drive it with window.__look:
//   await __look.ready
//   __look.view({ x, z, yaw, pitch })   place the suit
//   __look.run(seconds, input)          step the simulation and the world (input like controls.mjs)
//   __look.spawn(['virus', ...])        put pathogens in front of the suit
//   __look.frame()                      render one finished frame and the HUD
// Query: ?area=artery&scenario=boss|brain|airway|gastric|hazard|none
import { World } from './world.mjs';
import { gameUi } from './ui-browser.mjs';
import { Simulation } from './simulation.mjs';
import { session } from './session.mjs';
import { drawHud, drawMarkers, drawAttackers, drawBranches, drawCombatFeedback } from './hud.mjs';
import { spawnLevelBoss } from './level-bosses.mjs';
import { createBrainBoss } from './brain-boss.mjs';
import { startGastric } from './gastric.mjs';

const $ = id => document.getElementById(id), query = new URLSearchParams(location.search);
const area = query.get('area') ?? 'artery', scenario = query.get('scenario') ?? 'none';
gameUi.start();
let resolveReady;
const look = window.__look = { ready: new Promise(resolve => { resolveReady = resolve; }), errors: [] };
addEventListener('error', event => look.errors.push(event.message));
try {
  const sim = new Simulation(area, { ai: { seed: 31 }, encounterSeed: 31 });
  const world = new World($('world')); world.setQuality(query.get('quality') ?? 'high');
  await world.prepareAll([area]); await world.prepareMission(sim);
  sim.start(); sim.tutorial = null;
  Object.assign(session, { sim, world, running: true, ready: true, paused: false, options: {}, audio: { play() {}, update() {} } });
  if (scenario === 'boss') spawnLevelBoss(sim);
  if (scenario === 'brain') createBrainBoss(sim);
  if (scenario === 'airway') sim.startAirwayObjective();
  if (scenario === 'gastric') startGastric(sim);
  if (scenario === 'hazard') sim.organ = sim.createOrganPhase('warning');
  $('app').inert = false;
  $('menu').hidden = true; $('startup-load').hidden = true; $('game').hidden = false;
  $('game').dataset.area = area; $('touch-controls').hidden = true;
  const blank = { moveX: 0, moveZ: 0, lookX: 0, lookY: 0 };
  let last = {};
  Object.assign(look, {
    sim, world,
    view({ x, z, yaw, pitch } = {}) {
      const p = sim.player;
      if (x != null) p.x = x; if (z != null) p.z = z; if (yaw != null) p.yaw = yaw; if (pitch != null) p.pitch = pitch;
    },
    spawn(types, distance = 9, spread = 3.2) {
      const p = sim.player, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      for (const [i, type] of types.entries()) {
        const side = (i - (types.length - 1) / 2) * spread, depth = distance + (i % 2) * 2.5;
        sim.enemies.push(sim.createEnemy(type, p.x + fx * depth + rx * side, p.z + fz * depth + rz * side));
      }
    },
    run(seconds, input = {}, freezeEnemies = false) {
      // Only the last few steps are drawn: effects spawned then are what the photograph shows.
      const dt = 1 / 30, steps = Math.max(1, Math.round(seconds / dt));
      for (let i = 0; i < steps; i++) {
        last = { ...blank, ...input };
        const saved = freezeEnemies ? sim.enemies.map(e => ({ e, x: e.x, z: e.z })) : [];
        sim.step(dt, last);
        for (const { e, x, z } of saved) { e.x = x; e.z = z; }
        sim.player.health = Math.max(sim.player.health, 60);
        if (i >= steps - 4) world.render(sim, dt, last, false);
        // Undrawn steps still advance the weapon pose (aim, recoil, reload) at full rate.
        else world.updateWeapon(sim, dt, last, !!last.aim, false);
      }
    },
    frame(dt = 1 / 60) {
      const aiming = world.render(sim, dt, last, false);
      drawHud(); drawCombatFeedback(aiming); drawMarkers(); drawAttackers(); drawBranches();
    },
  });
  resolveReady(true);
} catch (error) { look.errors.push(error.message); console.error(error); resolveReady(false); }
