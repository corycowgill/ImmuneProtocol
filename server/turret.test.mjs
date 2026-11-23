import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation, SPECIES, TURRET_DAMAGE, TURRET_INTERVAL, TURRET_RANGE } from '../dist/simulation.mjs';
import { DEFAULT_WEAPON_STATS } from '../dist/weapon-mods.mjs';

const DT = 1 / 60;
function field(obstacles = []) {
  const sim = new Simulation('artery', { ai: { seed: 9 } });
  sim.start();
  sim.tutorial = null;
  sim.enemies = [];
  sim.obstacles = obstacles;
  sim.turret = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, cooldown: 0, targetId: null };
  return sim;
}
const run = (sim, seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) { sim.clock += DT; sim.updateTurret(DT); } };

test('the turret fires like a carbine', () => {
  const dps = TURRET_DAMAGE / TURRET_INTERVAL;
  const carbine = DEFAULT_WEAPON_STATS.bodyDamage / DEFAULT_WEAPON_STATS.interval;
  assert.ok(dps > carbine * .7 && dps < carbine * 1.2, `turret ${dps.toFixed(0)} dps vs carbine ${carbine.toFixed(0)} dps`);
  assert.ok(TURRET_RANGE >= 18);
});

test('it shreds a pathogen at range, and cannot shoot through a clot', () => {
  const sim = field();
  const virus = sim.createEnemy('virus', 0, -16, sim.nodes[0]);
  sim.enemies.push(virus);
  run(sim, 1);
  assert.equal(sim.enemies.includes(virus), false, 'a virus 16 m away dies within a second');
  const blocked = field([[0, -8, 2]]);
  const hidden = blocked.createEnemy('virus', 0, -16, blocked.nodes[0]);
  blocked.enemies.push(hidden);
  run(blocked, 1);
  assert.equal(hidden.health, SPECIES.virus.health, 'a clot between them stops every shot');
});

test('rapid fire slows a pathogen but interrupts its attack only every 1.6 seconds', () => {
  const sim = field();
  const bacillus = sim.createEnemy('bacillus', 0, -10, sim.nodes[0]);
  bacillus.health = bacillus.maxHealth = 1e6;
  sim.enemies.push(bacillus);
  let interrupts = 0;
  for (let i = 0; i < Math.round(3 / DT); i++) {
    sim.setEnemyAction(bacillus, 'bacillus-windup');
    sim.clock += DT;
    sim.updateTurret(DT);
    if (bacillus.action === 'idle') interrupts++;
  }
  assert.ok(bacillus.slowRemaining > 0);
  assert.equal(interrupts, 2, 'two interrupts in three seconds');
});
