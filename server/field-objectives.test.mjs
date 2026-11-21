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

test('pathogens sidestep a crosshair, spread out and hunt the weak, unguarded node', () => {
  const sim = new Simulation('artery');
  sim.start();
  const { player } = sim;
  Object.assign(player, { x: 0, z: 26, yaw: 0, pitch: 0 });

  // A lunger dead ahead darts sideways; one well off the crosshair keeps its line.
  const aimed = sim.createEnemy('virus', 0, 6, sim.nodes[0]);
  const ignored = sim.createEnemy('virus', 14, 8, sim.nodes[0]);
  sim.enemies.push(aimed, ignored);
  for (let i = 0; i < 6; i++) sim.advanceEnemies(STEP);
  assert.ok(aimed.dodge > 0 && Math.abs(aimed.x) > .3, 'aimed-at pathogen should dodge');
  assert.ok(!(ignored.dodge > 0));
  for (let i = 0; i < 30; i++) sim.advanceEnemies(STEP);
  assert.ok(aimed.dodgeRest > 0, 'a dodge is followed by a rest');
  // Bacilli never dodge.
  const slow = sim.createEnemy('bacillus', 0, 4, sim.nodes[0]);
  sim.enemies = [slow];
  for (let i = 0; i < 6; i++) sim.advanceEnemies(STEP);
  assert.equal(slow.dodge, undefined);

  // Two pathogens spawned on the same spot drift apart on the approach.
  sim.enemies = [];
  Object.assign(player, { x: -30, z: 40 });
  const pair = [sim.createEnemy('virus', 20, -45, sim.nodes[0]), sim.createEnemy('virus', 20.2, -45, sim.nodes[0])];
  pair.forEach((enemy, index) => { enemy.id = 100 + index; });
  sim.enemies.push(...pair);
  for (let i = 0; i < 45; i++) sim.advanceEnemies(STEP);
  assert.ok(Math.hypot(pair[0].x - pair[1].x, pair[0].z - pair[1].z) > 1.2);

  // A hunter (every third pathogen) far from its node switches to the battered, unguarded one.
  sim.enemies = [];
  const [core, flank, venous] = sim.nodes;
  Object.assign(player, { x: core.x, z: core.z + 3 });
  venous.health = 35;
  const hunter = sim.createEnemy('virus', -10, -40, core);
  hunter.id = 300;
  hunter.rethink = 0;
  const loyal = sim.createEnemy('virus', -10, -40, core);
  loyal.id = 301;
  loyal.rethink = 0;
  sim.enemies.push(hunter, loyal);
  sim.advanceEnemies(STEP);
  assert.equal(hunter.node, venous);
  assert.equal(hunter.nodeId, venous.id);
  assert.equal(loyal.node, core);
  assert.ok(flank.health === 100);
});
