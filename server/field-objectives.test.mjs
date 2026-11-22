import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CoopSimulation } from '../dist/coop-simulation.mjs';
import { CACHE, NEST } from '../dist/field-objectives.mjs';
import { ARENA, Simulation } from '../dist/simulation.mjs';

const STEP = 1 / 30;
const idle = {};

// Plays a mission with an invulnerable squad, clearing ordinary pathogens as they arrive.
function playUntil(sim, done, input = idle, limit = 400) {
  const seen = [];
  for (let clock = 0; clock < limit && !done(sim, seen); clock += STEP) {
    sim.step(STEP, input);
    seen.push(...sim.events.filter(event => event.type === 'nest' || event.type === 'cache' || event.type === 'wave'));
    for (const node of sim.nodes) node.health = 100;
    for (const { player } of sim.activeSuits()) player.health = Math.max(player.health, 60);
    for (const enemy of [...sim.enemies]) {
      if (!enemy.nest && enemy.type !== 'colony') sim.hitEnemy(enemy, 1e5, false, enemy, 'turret');
    }
  }
  return seen;
}

test('brood nests appear far from the nodes, hatch larvae and hold the wave open', () => {
  const sim = new Simulation('artery');
  sim.start();
  const seen = playUntil(sim, state => state.wave === 2 && state.enemies.some(enemy => enemy.nest));
  assert.equal(seen.filter(event => event.type === 'nest').length, 1, 'wave 1 of a long mission has no nest');
  const nest = sim.enemies.find(enemy => enemy.nest);
  assert.ok(Math.hypot(nest.x / ARENA.x, nest.z / ARENA.z) <= 1);
  for (const node of sim.nodes) assert.ok(Math.hypot(node.x - nest.x, node.z - nest.z) >= 22);
  const at = { x: nest.x, z: nest.z };

  // The rest of the wave dies, the nest keeps hatching up to its limit and never moves.
  const hatched = playUntil(sim, (_, events) => events.filter(event => event.stage === 'hatch').length >= NEST.hatchLimit, idle, 200);
  assert.equal(hatched.filter(event => event.stage === 'hatch').length, NEST.hatchLimit);
  assert.deepEqual({ x: nest.x, z: nest.z }, at);
  playUntil(sim, () => false, idle, 30);
  assert.equal(sim.wave, 2);
  assert.equal(sim.phase, 'combat');
  assert.equal(sim.remaining, 1);

  // Whoever destroys it is credited, and only then can the wave end.
  const before = sim.score;
  sim.hitEnemy(nest, 1e5, false, nest, 'player', sim);
  assert.equal(sim.score - before, NEST.score);
  assert.equal(sim.player.score, NEST.score);
  assert.ok(sim.events.some(event => event.type === 'nest' && event.stage === 'destroyed'));
  const cleared = playUntil(sim, (_, events) => events.some(event => event.type === 'wave' && event.stage === 'clear'), idle, 20);
  assert.ok(cleared.some(event => event.type === 'wave' && event.stage === 'clear'));
  assert.deepEqual(sim.pickups, []);
});

test('the last wave roots two nests and scripted encounters have none', () => {
  const stomach = new Simulation('stomach');
  stomach.start();
  playUntil(stomach, state => state.enemies.some(enemy => enemy.nest));
  assert.equal(stomach.wave, 1, 'a two-wave mission starts nests in wave 1');
  for (const area of ['heart', 'junction']) {
    const sim = new Simulation(area);
    sim.start();
    const seen = playUntil(sim, state => state.phase !== 'combat' && state.phase !== 'intermission', idle, 120);
    assert.equal(seen.filter(event => event.type !== 'wave').length, 0, area);
  }
  const training = new Simulation('artery', { tutorial: true });
  training.start();
  for (let clock = 0; clock < 30; clock += STEP) training.step(STEP, idle);
  assert.equal(training.enemies.some(enemy => enemy.nest), false);
  assert.deepEqual(training.pickups, []);
});

test('an antibody cache patches up and credits the suit that reaches it, then expires', () => {
  const sim = new CoopSimulation([{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Bravo' }]);
  sim.start();
  playUntil(sim, state => state.pickups.length > 0);
  const [cache] = sim.pickups;
  assert.ok(cache.remaining > CACHE.lifetime - 1);
  assert.deepEqual(sim.snapshotFor('a').pickups, [cache]);
  const [alpha, bravo] = sim.suits;
  alpha.player.health = 30;
  alpha.player.ammo = 1;
  Object.assign(bravo.player, { x: cache.x + .5, z: cache.z, health: 30, ammo: 1 });
  sim.step(STEP, {});
  assert.equal(bravo.player.health, 30 + CACHE.heal);
  assert.equal(bravo.player.ammo, bravo.magazineSize);
  assert.equal(bravo.player.score, CACHE.score);
  assert.equal(alpha.player.health, 30);
  assert.equal(sim.events.find(event => event.type === 'cache' && event.stage === 'collect').playerId, 'b');
  assert.deepEqual(sim.pickups, []);

  const solo = new Simulation('lungs');
  solo.start();
  playUntil(solo, state => state.pickups.length > 0);
  solo.pickups[0].remaining = STEP / 2;
  solo.step(STEP, {});
  assert.ok(solo.events.some(event => event.type === 'cache' && event.stage === 'expire'));
  assert.deepEqual(solo.pickups, []);
});

test('pathogens spread out and only reconsider tissue they have sensed', () => {
  const sim = new Simulation('artery');
  sim.start();
  Object.assign(sim.player, { x: -30, z: 40 });
  const pair = [sim.createEnemy('virus', 20, -45), sim.createEnemy('virus', 20.2, -45)];
  sim.enemies = pair;
  for (let i = 0; i < 90; i++) { sim.clock += STEP; sim.advanceEnemies(STEP); }
  assert.ok(Math.hypot(pair[0].x - pair[1].x, pair[0].z - pair[1].z) > 1.2);

  // Remote tissue damage is no longer omniscient information. A remembered local
  // tissue signal can still make an objective attacker change its route.
  const hunter = pair[0], [core, , venous] = sim.nodes;
  venous.health = 35;
  const controller = sim.ai.controllers.get(hunter.id);
  controller.decide();
  assert.equal(hunter.node, core);
  controller.memory.observe('node:' + venous.id, venous, sim.clock, { kind: 'node', source: 'tissue-signal', health: 35 });
  controller.decide();
  assert.equal(hunter.node, venous);
  assert.equal(hunter.nodeId, venous.id);
});

test('arenas are a third larger and every obstacle leaves the objectives reachable', async () => {
  const { CAMPAIGN_AREAS } = await import('../dist/coop-protocol.mjs');
  const { ENTRANCES, arenaObstacles } = await import('../dist/simulation.mjs');
  assert.deepEqual({ ...ARENA }, { x: 55, z: 77 });
  assert.ok(arenaObstacles('artery').length >= 8, 'the artery has cover');
  assert.deepEqual(arenaObstacles('heart'), []);
  for (const area of CAMPAIGN_AREAS) {
    const sim = new Simulation(area);
    sim.start();
    for (const node of sim.nodes) assert.ok(Math.hypot(node.x / ARENA.x, node.z / ARENA.z) < .8, area + ' node inside the arena');
    const inlets = (sim.organMission?.inlets ?? (area === 'artery' ? ENTRANCES : [])).flat();
    for (const [x, z] of inlets) assert.ok(Math.hypot(x / ARENA.x, z / ARENA.z) <= 1, area + ' inlet inside the arena');
    for (const [x, z, size] of sim.obstacles) {
      for (const node of sim.nodes) assert.ok(Math.hypot(node.x - x, node.z - z) >= size + 7, area + ' obstacle crowds ' + node.name);
      assert.ok(Math.hypot(sim.player.x - x, sim.player.z - z) >= size + 4, area + ' obstacle on the insertion point');
      for (const [ix, iz] of inlets) assert.ok(Math.hypot(ix - x, iz - z) >= size + 3, area + ' obstacle plugs an inlet');
    }
  }
  // A pathogen dead behind a clot still reaches its node, and a suit cannot walk through one.
  const sim = new Simulation('artery');
  sim.start();
  const [ox, oz, size] = sim.obstacles[2];
  const node = sim.nodes[0];
  const away = Math.hypot(ox - node.x, oz - node.z);
  const enemy = sim.createEnemy('bacillus', ox + (ox - node.x) / away * (size + 5), oz + (oz - node.z) / away * (size + 5), node);
  sim.enemies = [enemy];
  Object.assign(sim.player, { x: 50, z: 0 });
  let closest = Infinity;
  for (let clock = 0; clock < 40 && !enemy.latched; clock += STEP) {
    sim.advanceEnemies(STEP);
    closest = Math.min(closest, Math.hypot(enemy.x - ox, enemy.z - oz));
  }
  assert.ok(enemy.latched, 'the bacillus got around the clot');
  assert.ok(closest >= size, 'and never passed through it');
  Object.assign(sim.player, { x: ox, z: oz + size + 2, yaw: 0 });
  for (let clock = 0; clock < 3; clock += STEP) sim.movePlayer(STEP, { moveZ: 1 });
  assert.ok(Math.hypot(sim.player.x - ox, sim.player.z - oz) >= size - 1e-6);
});
