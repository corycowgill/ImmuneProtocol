import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation, SPECIES } from '../dist/simulation.mjs';
import { CoopSimulation } from '../dist/coop-simulation.mjs';
import { AIWorld, EnemyMemory } from '../dist/tactical-ai.mjs';
import { NavigationSystem, clearSegment } from '../dist/ai-navigation.mjs';
import { SPECIES_AI } from '../dist/ai-profiles.mjs';
import { CAMPAIGN_AREAS } from '../dist/coop-protocol.mjs';

const DT = 1 / 60;
function fixture(type = 'virus', obstacles = [], ai = {}) {
  const sim = new Simulation('artery', { ai: { seed: 17, ...ai } });
  sim.start(); sim.ai.dispose(); sim.obstacles = obstacles;
  sim.ai = new AIWorld(sim, { seed: 17, ...ai });
  Object.assign(sim.player, { x: 0, z: 8, yaw: Math.PI / 2, health: 100 });
  Object.assign(sim.nodes[0], { x: 0, z: -18 });
  const enemy = sim.createEnemy(type, 0, 0);
  enemy.heading = 0; sim.enemies = [enemy];
  sim.ai.begin(DT); sim.ai.end();
  return { sim, enemy, c: sim.ai.controllers.get(enemy.id) };
}
function advance(sim, seconds) {
  for (let i = 0; i < Math.ceil(seconds / DT); i++) {
    sim.clock += DT; sim.events = []; sim.advanceEnemies(DT); sim.advanceProjectiles(DT);
  }
}
function sense(sim, c, seconds = .5) {
  for (let i = 0; i < seconds / .1; i++) { sim.clock += .1; sim.ai.rayBudget = 100; c.perceive(); }
}

test('all ordinary species have biological profiles and preserve their attack family/stats', () => {
  for (const type of Object.keys(SPECIES).filter(t => t !== 'colony')) {
    assert.ok(SPECIES_AI[type]);
    const { sim, enemy } = fixture(type);
    advance(sim, .7);
    assert.ok(enemy.tactical, type);
    assert.equal(enemy.maxHealth, SPECIES[type].health);
    assert.equal(enemy.behavior, SPECIES[type].behavior ?? type);
  }
});

test('vision acquires a visible suit after reaction time, with FOV and range limits', () => {
  const { sim, c } = fixture();
  c.perceive(); assert.equal(c.memory.targets.get('player:solo').visible, false);
  sense(sim, c); assert.equal(c.memory.targets.get('player:solo').visible, true);
  c.memory.clear(); sim.player.z = -12;
  sense(sim, c); assert.equal(c.memory.targets.has('player:solo'), false);
  sim.player.z = 50; sense(sim, c); assert.equal(c.memory.targets.has('player:solo'), false);
});

test('solid cover prevents acquisition and attacking through it', () => {
  const { sim, c, enemy } = fixture('spore', [[0, 4, 2]]);
  sense(sim, c); assert.equal(c.memory.targets.has('player:solo'), false);
  const health = sim.player.health;
  sim.startEnemyAttack(enemy, sim.player, 'player');
  advance(sim, .7);
  assert.equal(sim.player.health, health);
  assert.equal(sim.projectiles.length, 0);
  assert.ok(c.memory.failures.some(f => f.reason.includes('obstructed')));
});

test('hidden suits stop updating memory, are investigated, and eventually forgotten', () => {
  const { sim, c } = fixture('virus', [[5, 7, 2]]);
  sense(sim, c);
  const last = { x: c.memory.targets.get('player:solo').x, z: c.memory.targets.get('player:solo').z };
  Object.assign(sim.player, { x: 10, z: 14 }); // behind the obstacle from the enemy
  sense(sim, c, .8); c.decide();
  const remembered = c.memory.targets.get('player:solo');
  assert.equal(remembered.visible, false);
  assert.deepEqual({ x: remembered.x, z: remembered.z }, last);
  assert.equal(c.action, 'investigate');
  assert.deepEqual({ x: c.target.x, z: c.target.z }, last);
  assert.equal(c.attackTarget(), null);
  sim.clock += 7; c.memory.decay(sim.clock); c.decide();
  assert.equal(c.memory.targets.has('player:solo'), false);
  assert.equal(c.action, 'objective');
});

test('hearing and damage give stale positions, never visibility or hidden tracking', () => {
  const { sim, c } = fixture('virus', [[0, 4, 2]]);
  sim.ai.emit('gunfire', sim.player, { key: 'player:solo' });
  sense(sim, c, .8); c.decide();
  const heard = c.memory.targets.get('player:solo');
  assert.equal(heard.source, 'sound'); assert.equal(heard.visible, false);
  assert.ok(Math.hypot(heard.x - sim.player.x, heard.z - sim.player.z) > 2);
  assert.equal(c.action, 'investigate');
  sim.ai.damage(c.enemy, sim.player); sim.player.x += 20;
  assert.equal(c.memory.targets.get('player:solo').source, 'damage');
  assert.equal(c.memory.targets.get('player:solo').x, 0);
});

test('tissue breakers choose tissue and a wounded harasser seeks survival', () => {
  const heavy = fixture('guard'); sense(heavy.sim, heavy.c); heavy.c.decide();
  assert.equal(heavy.c.action, 'objective');
  assert.ok(heavy.c.targetKey.startsWith('node:'));
  const { sim, c, enemy } = fixture('spore'); sense(sim, c); c.decide();
  enemy.health = enemy.maxHealth * .15; sim.ai.damage(enemy, sim.player); c.decide();
  assert.ok(['retreat', 'cover', 'evade'].includes(c.action), c.action);
});

test('navigation routes around solids and every segment preserves clearance', () => {
  const nav = new NavigationSystem([[0, 0, 4]], 'artery');
  const start = { x: -12, z: 0 }, goal = { x: 12, z: 0 };
  const path = nav.path(start, goal);
  assert.ok(path.length > 1);
  let previous = start;
  for (const p of path) { assert.ok(nav.clear(previous, p)); previous = p; }
  assert.ok(path.some(p => Math.abs(p.z) > 4));
});

test('integrated navigation gets a latcher around an obstacle and reaches tissue', () => {
  const { sim, c, enemy } = fixture('bacillus', [[0, -8, 3]]);
  sim.player.z = 60;
  const seen = [];
  for (let i = 0; i < 35 / DT; i++) {
    const before = { x: enemy.x, z: enemy.z };
    advance(sim, DT); seen.push(enemy.x);
    assert.ok(clearSegment(sim.obstacles, before, enemy, enemy.radius * .5 - .01));
  }
  assert.ok(seen.some(x => Math.abs(x) > 3));
  assert.ok(enemy.latched, JSON.stringify({ x: enemy.x, z: enemy.z, failures: c.memory.failures }));
  assert.ok(sim.nodes[0].health < 100);
});

test('unreachable routes fail with bounded retries, then recover after a new destination', () => {
  const { sim, c } = fixture('virus', [[0, 0, 100]]);
  c.destination = { x: 10, z: 0 };
  c.move(DT, 3);
  assert.ok(c.memory.failures.some(f => f.reason.includes('unreachable')));
  assert.equal(c.path.length, 0);
  const searches = sim.ai.navigation.searches;
  for (let i = 0; i < 60; i++) c.move(DT, 3);
  assert.equal(sim.ai.navigation.searches, searches);
  sim.ai.navigation = new NavigationSystem([], 'artery');
  sim.clock += 2; c.destination = { x: 10, z: 0 }; sim.ai.pathBudget = 2;
  c.move(.1, 3);
  assert.ok(c.enemy.x > 0); assert.ok(c.path.length);
});

test('local squads split roles, reserve different approaches and redistribute after death', () => {
  const { sim, enemy } = fixture();
  for (let i = 0; i < 5; i++) sim.enemies.push(sim.createEnemy('virus', i * 1.5, 0));
  sim.ai.begin(DT);
  const roles = [...sim.ai.controllers.values()].map(c => c.role);
  assert.ok(new Set(roles).size >= 3);
  const controllers = [...sim.ai.controllers.values()];
  const destinations = controllers.map(c => sim.ai.squads.reserve(c, { x: 10, z: 10 }));
  for (let a = 0; a < destinations.length; a++) for (let b = a + 1; b < destinations.length; b++) {
    assert.ok(Math.hypot(destinations[a].x - destinations[b].x, destinations[a].z - destinations[b].z) >= 2);
  }
  const second = controllers[1], before = second.role;
  sim.hitEnemy(enemy, 1e4, false, enemy, 'player', sim);
  sim.ai.begin(DT);
  assert.notEqual(second.role, before);
  assert.equal(second.memory.allies.includes(enemy.id), false);
});

test('nearby allies share observations with uncertainty; distant enemies receive nothing', () => {
  const { sim, c } = fixture(); sense(sim, c);
  const nearby = sim.createEnemy('virus', 4, 0), far = sim.createEnemy('virus', 40, 0);
  sim.enemies.push(nearby, far); sim.ai.squads.next = 0; sim.ai.begin(DT);
  const copied = sim.ai.controllers.get(nearby.id).memory.targets.get('player:solo');
  assert.equal(copied.source, 'ally'); assert.equal(copied.visible, false);
  assert.equal(copied.confidence, .5);
  assert.equal(sim.ai.controllers.get(far.id).memory.targets.has('player:solo'), false);
});

test('attack windups, cooldowns and director pressure caps are enforced', () => {
  const { sim, enemy, c } = fixture();
  Object.assign(sim.player, { x: 0, z: 2.5 });
  sense(sim, c); enemy.attackCooldown = 1;
  advance(sim, .4); assert.equal(enemy.action, 'idle');
  advance(sim, .8); assert.ok(enemy.action.startsWith('virus-'));
  const d = sim.ai.director;
  d.pressure.clear(); d.nextAttack = 0; d.limit = 2; d.tissueLimit = 1;
  assert.equal(d.acquire(enemy, 'tissue'), true);
  sim.clock += .2;
  assert.equal(d.acquire({ id: 777 }, 'tissue'), false);
  assert.equal(d.acquire({ id: 778 }, 'player'), true);
  sim.clock += .2;
  assert.equal(d.acquire({ id: 779 }, 'player'), false);
});

test('destroyed objectives cancel windups and cannot receive damage', () => {
  const { sim, enemy } = fixture();
  sim.startEnemyAttack(enemy, enemy.node, 'tissue'); enemy.node.health = 0;
  const events = sim.events.length;
  sim.damageTarget(enemy, 'tissue', 50);
  assert.equal(sim.events.length, events);
  advance(sim, .6); assert.equal(enemy.action, 'idle');
  assert.equal(sim.projectiles.length, 0);
});

test('cleanup releases controllers, paths, reservations, pressure and reset references', () => {
  const { sim, c, enemy } = fixture();
  sim.ai.squads.reserve(c, enemy); sim.ai.director.acquire(enemy, 'player');
  sim.hitEnemy(enemy, 1e4, false, enemy, 'player', sim);
  assert.equal(sim.ai.controllers.size, 0); assert.equal(c.disposed, true);
  assert.equal(c.enemy, null); assert.equal(c.world, null); assert.equal(c.path.length, 0);
  assert.equal(c.memory.targets.size, 0); assert.equal(sim.ai.squads.reservations.size, 0);
  assert.equal(sim.ai.director.pressure.size, 0); assert.equal(sim.ai.entities.size, 0);
  const old = sim.ai; sim.reset(); assert.equal(old.sim, null);
});

test('work budgets and event memory remain bounded under a crowded wave', () => {
  const { sim } = fixture('spore', [], { sightBudget: 3, pathsPerStep: 1, maxEvents: 5 });
  for (let i = 0; i < 39; i++) sim.enemies.push(sim.createEnemy('spore', i % 8 * 3 - 12, -Math.floor(i / 8) * 4));
  for (let i = 0; i < 30; i++) sim.ai.emit('gunfire', sim.player);
  assert.equal(sim.ai.noises.length, 5);
  advance(sim, 2);
  assert.ok(sim.ai.telemetry.rays <= 3); assert.ok(sim.ai.telemetry.paths <= 1);
  assert.equal(sim.ai.controllers.size, 40);
});

test('fixed seed and fixed timestep reproduce decisions and trajectories', () => {
  const run = () => {
    const { sim } = fixture('spore');
    sim.ai.emit('gunfire', sim.player, { key: 'player:solo' });
    advance(sim, 7);
    return JSON.stringify({ enemies: sim.enemies, projectiles: sim.projectiles, seed: sim.ai.seed });
  };
  assert.equal(run(), run());
});

test('co-op uses visible living suits and serializes compact tactical decisions', () => {
  const sim = new CoopSimulation([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  sim.start(); sim.ai.dispose(); sim.obstacles = []; sim.ai = new AIWorld(sim);
  Object.assign(sim.players[0], { x: 0, z: 4, health: 0 });
  Object.assign(sim.players[1], { x: 1, z: 6 });
  Object.assign(sim.nodes[0], { x: 0, z: 18 });
  const enemy = sim.createEnemy('virus', 0, 0); enemy.heading = 0; sim.enemies = [enemy];
  advance(sim, 1);
  const c = sim.ai.controllers.get(enemy.id);
  assert.equal(c.memory.targets.has('player:a'), false);
  assert.equal(c.memory.targets.get('player:b').visible, true);
  assert.ok(c.targetKey === 'player:b');
  const snapshot = sim.snapshotFor('b');
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  assert.equal(snapshot.enemies[0].tactical.target, 'player:b');
  assert.equal(snapshot.enemies[0].ai, undefined);
});

test('memory decays stale threats and bounds failure history', () => {
  const memory = new EnemyMemory(2);
  memory.observe('player:solo', { x: 3, z: 7 }, 0);
  for (let i = 0; i < 30; i++) memory.fail('blocked', 0);
  assert.equal(memory.failures.length, 8);
  memory.decay(3); assert.equal(memory.targets.size, 0);
  memory.decay(9); assert.equal(memory.failures.length, 0);
});

test('wounded spitters choose cover that actually blocks their remembered threat', () => {
  const { sim, c, enemy } = fixture('spore', [[4, 4, 2]]);
  sense(sim, c); enemy.health = enemy.maxHealth * .15;
  sim.ai.damage(enemy, sim.player); c.decide();
  assert.equal(c.action, 'cover'); assert.ok(c.coverCandidates.length);
  assert.equal(clearSegment(sim.obstacles, sim.player, c.destination), false);
});

test('armoured pathogens interpose themselves to protect wounded colony members', () => {
  const { sim, c } = fixture('guard');
  const ally = sim.createEnemy('bacillus', 3, 0); ally.health *= .2;
  sim.enemies.push(ally); sim.ai.begin(DT);
  sense(sim, c, .8); c.decide();
  assert.equal(c.action, 'protect');
  assert.ok(Math.hypot(c.destination.x - ally.x, c.destination.z - ally.z) < 3);
  assert.ok(c.destination.z > ally.z, 'stands on the threat side of its ally');
});

test('difficulty changes reaction, coordination and pressure without changing live stats', () => {
  const { sim, enemy } = fixture(); const health = enemy.health;
  sim.difficulty = 'easy'; sim.ai.director.next = 0; sim.ai.director.update(DT);
  const easy = sim.ai.difficulty; assert.equal(sim.ai.director.limit, 4);
  sim.difficulty = 'hard'; sim.ai.director.next = 0; sim.ai.director.update(DT);
  assert.equal(sim.ai.director.limit, 7);
  assert.ok(sim.ai.difficulty.reaction < easy.reaction);
  assert.ok(sim.ai.difficulty.teamwork > easy.teamwork);
  assert.equal(enemy.health, health);
});

test('every arena has reachable tissue routes and a finite 40-enemy combat simulation', () => {
  for (const area of CAMPAIGN_AREAS) {
    const sim = new Simulation(area); sim.start(); sim.enemies = [];
    const nav = sim.ai.navigation;
    for (const node of sim.nodes) {
      const start = nav.project(sim.player), path = nav.path(start, node);
      assert.ok(path?.length, `${area}: route to ${node.id}`);
      let previous = start;
      for (const next of path) { assert.ok(nav.clear(previous, next), area); previous = next; }
    }
    const types = Object.keys(SPECIES_AI);
    for (let i = 0; i < 40; i++) {
      const p = nav.project({ x: Math.sin(i * 2.4) * 20, z: Math.cos(i * 2.4) * 20 });
      sim.enemies.push(sim.createEnemy(types[i % types.length], p.x, p.z, sim.nodes[i % sim.nodes.length]));
    }
    advance(sim, 5);
    for (const e of sim.enemies) assert.ok(Number.isFinite(e.x + e.y + e.z + e.health + e.heading), area);
    assert.equal(sim.ai.controllers.size, 40);
    sim.ai.dispose();
  }
});

test('crosshair evasion requires direct sight and has a recovery period', () => {
  const open = fixture('virus'); open.sim.player.yaw = Math.PI;
  sense(open.sim, open.c, .8);
  assert.ok(open.enemy.dodge > 0); assert.ok(open.enemy.dodgeRest > 0);
  for (let i = 0; i < 30; i++) open.c.tick(DT);
  assert.equal(open.enemy.dodge, 0); assert.ok(open.enemy.dodgeRest > 0);
  const hidden = fixture('virus', [[0, 4, 2]]); hidden.sim.player.yaw = Math.PI;
  sense(hidden.sim, hidden.c, .8);
  assert.equal(hidden.enemy.dodge, undefined);
});

test('a launched tissue projectile keeps its original objective when its owner retargets', () => {
  const { sim, enemy } = fixture('spore');
  const original = enemy.node, other = sim.nodes[1];
  Object.assign(original, { x: 0, z: -4, y: enemy.y });
  enemy.actionTarget = 'tissue'; enemy.attackPoint = { x: original.x, y: original.y, z: original.z };
  sim.launchSpore(enemy);
  enemy.node = other; enemy.nodeId = other.id;
  for (let i = 0; i < 60; i++) sim.advanceProjectiles(DT);
  assert.ok(original.health < 100); assert.equal(other.health, 100);
});
