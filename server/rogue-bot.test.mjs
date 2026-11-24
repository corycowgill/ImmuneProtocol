import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import { Simulation, SPECIES, speciesHabitats } from '../dist/simulation.mjs';
import { CoopSimulation } from '../dist/coop-simulation.mjs';
import { AIWorld } from '../dist/tactical-ai.mjs';
import { LASER_RULES, clipLaser, startBotLaser, stepRogueBot } from '../dist/rogue-bot.mjs';
import { World } from '../dist/world.mjs';
import { missionIntel } from '../dist/deployment.mjs';
import { readFileSync } from 'node:fs';

const DT = 1 / 60;
function fixture(coop = false, obstacles = []) {
  const sim = coop ? new CoopSimulation([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]) : new Simulation();
  sim.start(); sim.ai.dispose(); sim.obstacles = obstacles; sim.ai = new AIWorld(sim, { seed: 17 });
  const players = sim.players ?? [sim.player];
  players.forEach((p, i) => Object.assign(p, { x: i ? 15 + i * 3 : 0, y: 1.7, z: 14, yaw: 0, health: 100 }));
  const bot = sim.createEnemy('rogue-bot', 0, 0); bot.heading = 0; bot.attackCooldown = 0; sim.enemies = [bot];
  sim.ai.begin(DT);
  const c = sim.ai.controllers.get(bot.id);
  for (let i = 0; i < 8; i++) { sim.clock += .1; sim.ai.rayBudget = 100; c.perceive(); }
  c.decide();
  return { sim, bot, c, players };
}
function charge(f) {
  const { sim, bot, players } = f;
  assert.equal(startBotLaser(sim, bot, players[0], 'player'), true);
  return structuredClone(bot.laser);
}
function advance(f, seconds) {
  const { sim, bot, c } = f;
  for (let i = 0; i < Math.ceil(seconds / DT); i++) {
    sim.clock += DT; stepRogueBot(sim, bot, DT, SPECIES['rogue-bot'], 1, c);
  }
}

test('Rogue Bot is distinct from Rogue Cell and mission intel/guide habitats include it in nine arenas', () => {
  assert.equal(SPECIES.rogue.behavior, 'bacillus'); assert.equal(SPECIES['rogue-bot'].behavior, 'laser');
  const habitats = speciesHabitats()['rogue-bot']; assert.equal(habitats.length, 9);
  for (const area of habitats) assert.ok(missionIntel(area).threats.some(t => t.type === 'rogue-bot'));
  // The heart's flank patrols bring both nano drones; only the junction's surges go without.
  assert.ok(habitats.includes('heart') && !habitats.includes('junction'));
  assert.ok(speciesHabitats().crawler.includes('heart'));
});

test('AI has no tissue objective or hidden-player knowledge and patrols without a suit observation', () => {
  const { sim, bot, c } = fixture();
  c.memory.clear(); c.decide();
  assert.equal(c.profile.tissuePriority, 0); assert.equal(c.action, 'patrol'); assert.equal(c.targetKey, null);
  assert.ok(![...c.memory.targets.values()].some(t => t.kind === 'node'));
  assert.equal(startBotLaser(sim, bot, sim.nodes[0], 'tissue'), false);
  const before = sim.nodes.map(n => n.health);
  sim.damageTarget(bot, 'tissue', 99999); assert.deepEqual(sim.nodes.map(n => n.health), before);
});

test('a hidden suit cannot trigger a laser through solid cover', () => {
  const f = fixture(false, [[0, 7, 2]]);
  assert.equal(f.c.attackTarget(), null);
  assert.equal(startBotLaser(f.sim, f.bot, f.players[0], 'player'), false);
  assert.equal(f.bot.laser, undefined);
});

test('cannon respects its range and does not fire through its own muzzle at a nearby suit', () => {
  const f = fixture(); f.players[0].z = 2;
  assert.equal(startBotLaser(f.sim, f.bot, f.players[0], 'player'), false);
  f.players[0].z = 40; assert.equal(startBotLaser(f.sim, f.bot, f.players[0], 'player'), false);
});

test('Blender export has baked PBR maps, bounded geometry and no external texture dependency', () => {
  const file = readFileSync(new URL('../dist/assets/enemies/rogue-bot.glb', import.meta.url));
  const json = JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12)));
  assert.ok(file.length < 3 * 1024 * 1024);
  const triangles = json.meshes.flatMap(m => m.primitives).reduce((sum, p) => sum + json.accessors[p.indices].count / 3, 0);
  assert.ok(triangles > 10000 && triangles <= 32000);
  const material = json.materials[0];
  assert.ok(material.pbrMetallicRoughness.baseColorTexture && material.pbrMetallicRoughness.metallicRoughnessTexture);
  assert.ok(material.normalTexture && material.emissiveTexture);
  assert.ok(json.images.every(image => image.bufferView !== undefined && !image.uri));
});

test('laser gives its full windup, fires once, and leaves tissue untouched', () => {
  const f = fixture(), nodes = f.sim.nodes.map(n => n.health); charge(f);
  advance(f, LASER_RULES.windup - .1); assert.equal(f.players[0].health, 100);
  advance(f, .12); assert.ok(f.players[0].health < 100);
  const damage = f.sim.events.filter(e => e.type === 'damage'); assert.equal(damage.length, 1);
  assert.ok(damage.every(e => e.target === 'player'));
  advance(f, .5); assert.equal(f.sim.events.filter(e => e.type === 'damage').length, 1);
  assert.deepEqual(f.sim.nodes.map(n => n.health), nodes);
});

test('sidestepping the committed aiming line makes the shot miss without tracking the suit', () => {
  const f = fixture(), warning = charge(f); f.players[0].x = 4;
  advance(f, 1); assert.equal(f.players[0].health, 100);
  assert.deepEqual(f.bot.laser.aim, warning.aim); assert.deepEqual(f.bot.laser.from, warning.from);
  assert.ok(f.sim.events.some(e => e.type === 'enemyAttack' && e.stage === 'miss'));
});

test('beam is clipped by terrain, including cover introduced during windup', () => {
  const f = fixture(); charge(f); f.sim.obstacles = [[0, 7, 1.5]];
  advance(f, 1); assert.equal(f.players[0].health, 100); assert.ok(f.bot.laser.to.z <= 5.501);
  assert.deepEqual(clipLaser([[0, 0, 2]], { x: 0, y: 2, z: 0 }, { x: 0, y: 2, z: 20 }), { x: 0, y: 2, z: 0 });
});

test('co-op lock holds its original victim and downing that victim cancels the warning', () => {
  const f = fixture(true); charge(f); f.players[1].z = 5;
  advance(f, .4); assert.equal(f.bot.actionPlayerId, 'a');
  f.players[0].health = 0; advance(f, .7);
  assert.equal(f.bot.laser, null); assert.equal(f.players[1].health, 100); assert.equal(f.players[2].health, 100);
});

test('a co-op suit intercepting the fixed beam is hit once, with correct player attribution', () => {
  const f = fixture(true); charge(f); Object.assign(f.players[1], { x: 0, z: 7 });
  advance(f, 1);
  assert.equal(f.players[0].health, 100); assert.ok(f.players[1].health < 100); assert.equal(f.players[2].health, 100);
  const damage = f.sim.events.filter(e => e.type === 'damage'); assert.equal(damage.length, 1); assert.equal(damage[0].playerId, 'b');
});

test('attack pressure prevents a drone from charging and cooldown prevents consecutive instant lasers', () => {
  const f = fixture(); f.sim.ai.director.limit = 0;
  assert.equal(startBotLaser(f.sim, f.bot, f.players[0], 'player'), false);
  f.sim.ai.director.limit = 4; charge(f); advance(f, 1.8);
  assert.ok(f.bot.attackCooldown > 1.8); assert.equal(f.bot.laser, null);
});

test('co-op snapshots carry serializable laser telegraphs for remote players and reconnects', () => {
  const f = fixture(true); charge(f);
  const snapshot = JSON.parse(JSON.stringify(f.sim.snapshotFor('b'))), bot = snapshot.enemies.find(e => e.type === 'rogue-bot');
  assert.equal(bot.laser.stage, 'warning'); assert.equal(bot.actionPlayerId, 'a'); assert.ok(bot.laser.remaining >= .9);
  assert.deepEqual(bot.laser.from, f.bot.laser.from);
});

test('pooled laser views stay bounded and disappear on death and reuse', () => {
  const source = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ emissive: 0xffffff }));
  mesh.name = 'attack-membrane'; source.add(mesh);
  const world = Object.assign(Object.create(World.prototype), { scene: new THREE.Scene(), enemyModels: new Map([['rogue-bot', source]]),
    enemyViews: new Map(), enemyPool: new Map(), shadowGeometry: new THREE.PlaneGeometry(2, 2), shadowMaterial: new THREE.MeshBasicMaterial(), random: () => .5, clock: 0 });
  const e = { id: 1, type: 'rogue-bot', x: 0, y: 2, z: 0, radius: 1,
    laser: { from: { x: 0, y: 2, z: 1 }, to: { x: 0, y: 1.7, z: 15 }, stage: 'warning' } };
  world.updateEnemies([e], 0, true); const view = world.enemyViews.get(1), children = world.scene.children.length;
  assert.equal(view.laser.visible, true);
  for (let i = 0; i < 30; i++) {
    world.updateEnemies([], 0, true); assert.equal(view.laser.visible, false);
    world.updateEnemies([{ ...e, id: i + 2, laser: null }], 0, true); assert.equal(view.laser.visible, false);
    assert.equal(world.scene.children.length, children);
  }
});
