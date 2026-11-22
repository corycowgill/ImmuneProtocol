// Local-only fixture, served at /__hud by the performance server. Uses the real
// game DOM, renderer and HUD; freezes combat so screenshots are reproducible.
import { World } from './world.mjs';
import { gameUi } from './ui-browser.mjs';
import { Simulation } from './simulation.mjs';
import { session } from './session.mjs';
import { drawHud, drawMarkers, drawAttackers, drawBranches } from './hud.mjs';
import { spawnLevelBoss } from './level-bosses.mjs';
import { createBrainBoss } from './brain-boss.mjs';
import { startGastric } from './gastric.mjs';
const $ = id => document.getElementById(id), query = new URLSearchParams(location.search);
gameUi.start();
const scenario = query.get('scenario') ?? 'encounter';
const area = ({ boss: 'colon', brain: 'brain', airway: 'lungs', gastric: 'stomach', junction: 'junction', hazard: 'colon' })[scenario] ?? 'artery';
const panel = document.createElement('details'); panel.style.cssText = 'position:fixed;bottom:5px;left:40%;z-index:99;background:#111d;color:white;font:11px monospace;padding:5px';
panel.innerHTML = '<summary>HUD check</summary><select aria-label="HUD scenario">' + ['encounter', 'active', 'quiet', 'laser', 'hazard', 'boss', 'brain', 'airway', 'gastric', 'junction', 'training'].map(s => `<option ${s === scenario ? 'selected' : ''}>${s}</option>`).join('') + '</select> <button>Hide check controls</button><p id="hud-check-status">Preparing…</p>';
document.body.append(panel);
panel.style.zIndex = '2147483004'; panel.hidden = query.has('clean');
panel.querySelector('select').onchange = e => { location.search = '?scenario=' + e.target.value; };
panel.querySelector('button').onclick = () => { panel.hidden = true; };
try {
  const sim = new Simulation(area, { tutorial: scenario === 'training', ai: { seed: 31 }, encounterSeed: 31 });
  const world = new World($('world')); world.setQuality('low');
  await world.prepareAll([area]); await world.prepareMission(sim);
  sim.start();
  Object.assign(session, { sim, world, running: true, ready: true, audio: { play() {} } });
  Object.assign(sim.player, { x: 0, z: 32, yaw: 0, pitch: 0, health: 100 });
  if (scenario !== 'training') {
    sim.enemies = ['virus', 'bacillus', 'spore', 'rogue-bot'].map((type, i) => sim.createEnemy(type, (i - 1.5) * 4, 17 + i));
    if (['encounter', 'active'].includes(scenario)) sim.encounter = {
      id: 'qa', name: 'Swarm Pincer', pattern: 'pincer', stage: scenario === 'active' ? 'active' : 'warning',
      nodeName: sim.nodes[1].name, nodeId: sim.nodes[1].id, alive: 4, spawned: 4, remaining: 4,
      cue: 'Two approaches converge. Cover the marked node from both sides.', approaches: [{ x: -14, z: 0, label: 'Left approach' }, { x: 14, z: 0, label: 'Right approach' }],
    }; else sim.encounter = null;
    if (scenario === 'laser') {
      const bot = sim.enemies.at(-1);
      bot.laser = { stage: 'warning', remaining: .8, from: { x: bot.x, y: bot.y, z: bot.z }, to: { ...sim.player } };
      bot.action = 'laser-windup'; bot.actionTarget = 'player'; bot.actionProgress = .5;
      sim.nodes[1].health = 28; sim.nodes[1].underAttack = true; sim.player.ammo = 2; sim.player.health = 29;
    }
    if (scenario === 'boss') spawnLevelBoss(sim);
    if (scenario === 'brain') createBrainBoss(sim);
    if (scenario === 'airway') sim.startAirwayObjective();
    if (scenario === 'gastric') startGastric(sim);
    if (scenario === 'hazard') { sim.organ = sim.createOrganPhase('warning'); }
  }
  $('app').inert = false;
  $('menu').hidden = true; $('startup-load').hidden = true; $('game').hidden = false;
  $('game').dataset.area = area; $('touch-controls').hidden = query.get('touch') === '0';
  if (query.has('coop')) {
    $('coop-hud').hidden = false;
    $('coop-ally').textContent = 'Ally 100%';
    $('coop-match-status').textContent = '2 operators connected';
  }
  $('hud-check-status').textContent = 'Ready · ' + scenario;
  let previous = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - previous) / 1000); previous = now; sim.clock += dt;
    try { world.render(sim, 0, {}, true); drawHud(); drawMarkers(); drawAttackers(); drawBranches(); }
    catch (error) { $('hud-check-status').textContent = 'FAIL: ' + error.message; panel.open = true; console.error(error); return; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch (error) { $('hud-check-status').textContent = 'FAIL: ' + error.message; panel.open = true; console.error(error); }
