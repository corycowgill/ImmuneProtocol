import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from '../dist/simulation.mjs';
import { ABILITIES, abilityState } from '../dist/abilities.mjs';

const DT = 1 / 60;
function field() {
  const sim = new Simulation('artery', { ai: { seed: 4 } });
  sim.start();
  sim.tutorial = null;
  sim.phase = 'combat';
  sim.enemies = [];
  sim.obstacles = [];
  sim.spawnCountdown = 1e9;
  Object.assign(sim.player, { x: 0, z: 0, yaw: 0, pitch: 0 });
  return sim;
}
const steps = (sim, seconds, input = {}) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) { sim.events = []; sim.clock += DT; sim.movePlayer(DT, input); sim.actSuits(DT, input); }
};

test('a dash covers about five metres in a fifth of a second and dodges a hit in its window', () => {
  const sim = field();
  sim.movePlayer(DT, { dash: true, moveX: 1 });
  steps(sim, .3);
  assert.ok(sim.player.x > 4.8 && sim.player.x < 6, `dashed to ${sim.player.x.toFixed(2)}`);
  const again = field();
  again.movePlayer(DT, { dash: true });
  assert.ok(again.player.z > 0, 'no direction held dashes backwards');
  const virus = again.createEnemy('virus', 0, 3, again.nodes[0]);
  const before = again.player.health;
  again.events = [];
  again.damageTarget(virus, 'player', 20, virus);
  assert.equal(again.player.health, before, 'the guard window turns the hit aside');
  assert.ok(again.events.some(event => event.type === 'dodge'));
  again.clock += ABILITIES.dash.guard + .01;
  again.damageTarget(virus, 'player', 20, virus);
  assert.ok(again.player.health < before, 'after the window, hits land');
  assert.equal(abilityState(again).dashCooldown > 0, true);
});

test('a jump rises about a metre and lands back at eye height', () => {
  const sim = field();
  const eye = sim.player.y;
  sim.movePlayer(DT, { jump: true });
  let peak = 0;
  let landed = false;
  for (let i = 0; i < 90; i++) {
    sim.events = [];
    sim.movePlayer(DT, {});
    peak = Math.max(peak, sim.player.y - eye);
    landed ||= sim.events.some(event => event.type === 'land');
  }
  assert.ok(peak > .85 && peak < 1.3, `peak ${peak.toFixed(2)}`);
  assert.ok(landed);
  assert.equal(sim.player.y, eye);
});

test('a bash tears a latched pathogen off tissue and throws it back', () => {
  const sim = field();
  const node = sim.nodes[0];
  Object.assign(sim.player, { x: node.x, z: node.z + 3 });
  const bacillus = sim.createEnemy('bacillus', node.x, node.z + 1, node);
  Object.assign(bacillus, { latched: true, attackingTissue: true });
  sim.setEnemyAction(bacillus, 'bacillus-windup');
  sim.enemies.push(bacillus);
  const health = bacillus.health;
  sim.events = [];
  sim.actSuits(DT, { melee: true });
  assert.equal(bacillus.latched, false);
  assert.equal(bacillus.action, 'idle');
  assert.ok(bacillus.health < health);
  const melee = sim.events.find(event => event.type === 'melee');
  assert.equal(melee.hits, 1);
  assert.equal(melee.freed, 1);
  const from = Math.hypot(bacillus.x - sim.player.x, bacillus.z - sim.player.z);
  for (let i = 0; i < 30; i++) sim.advanceEnemies(DT);
  assert.ok(Math.hypot(bacillus.x - sim.player.x, bacillus.z - sim.player.z) > from + 3, 'knocked back several metres');
  sim.actSuits(DT, { melee: true });
  assert.ok(abilityState(sim).meleeCooldown > 0);
});

test('an antibody grenade arcs out, bursts on a pathogen and restocks each wave', () => {
  const sim = field();
  const virus = sim.createEnemy('virus', 0, -9, sim.nodes[0]);
  sim.enemies.push(virus);
  sim.actSuits(DT, { grenade: true });
  assert.equal(abilityState(sim).grenades, ABILITIES.grenade.carry - 1);
  assert.equal(sim.throwables.length, 1);
  let burst = null;
  for (let i = 0; i < 180 && !burst; i++) {
    sim.events = [];
    await_step(sim);
    burst = sim.events.find(event => event.type === 'explosion' && event.kind === 'antibody');
  }
  assert.ok(burst, 'the grenade went off');
  assert.equal(sim.enemies.includes(virus), false, 'a virus in the blast dies');
  abilityState(sim).grenades = 0;
  sim.beginWave();
  assert.equal(abilityState(sim).grenades, ABILITIES.grenade.carry);
});

test('a stun charge freezes pathogens in place for seconds', () => {
  const sim = field();
  const virus = sim.createEnemy('virus', 0, -6, sim.nodes[0]);
  sim.enemies.push(virus);
  sim.player.pitch = -.2;
  sim.actSuits(DT, { stun: true });
  let stun = null;
  for (let i = 0; i < 180 && !stun; i++) {
    sim.events = [];
    await_step(sim);
    stun = sim.events.find(event => event.type === 'stun');
  }
  assert.ok(stun, 'the charge discharged');
  assert.ok(virus.stunRemaining > 2.5);
  const at = { x: virus.x, z: virus.z };
  for (let i = 0; i < 60; i++) sim.advanceEnemies(DT);
  assert.ok(Math.hypot(virus.x - at.x, virus.z - at.z) < .05, 'a stunned pathogen does not move');
});

import { updateThrowables } from '../dist/abilities.mjs';
function await_step(sim) {
  sim.clock += DT;
  updateThrowables(sim, DT);
}

test('co-op suits each have their own dash, bash and throwables, and snapshots carry them', async () => {
  const { CoopSimulation } = await import('../dist/coop-simulation.mjs');
  const sim = new CoopSimulation([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  sim.start();
  sim.tutorial = null;
  sim.phase = 'combat';
  sim.spawnCountdown = 1e9;
  sim.enemies = [];
  const before = sim.suits.map(suit => ({ x: suit.player.x, z: suit.player.z }));
  sim.step(DT, { a: { dash: true, moveX: 1 }, b: { grenade: true } });
  for (let i = 0; i < 20; i++) sim.step(DT, {});
  const [a, b] = sim.suits;
  assert.ok(Math.hypot(a.player.x - before[0].x, a.player.z - before[0].z) > 4, 'suit A dashed');
  assert.ok(Math.hypot(b.player.x - before[1].x, b.player.z - before[1].z) < .5, 'suit B stayed put');
  assert.equal(abilityState(b).grenades, ABILITIES.grenade.carry - 1);
  assert.equal(abilityState(a).grenades, ABILITIES.grenade.carry);
  const snapshot = JSON.parse(JSON.stringify(sim.snapshotFor('b')));
  assert.equal(snapshot.ability.grenades, ABILITIES.grenade.carry - 1);
  assert.ok(Array.isArray(snapshot.throwables));
});
