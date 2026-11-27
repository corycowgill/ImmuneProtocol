import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from '../dist/simulation.mjs';
import { HAZARD_CLEARANCE, RESONANCE_CLEARANCE, STEP_HEIGHT, TERRAIN, groundHeight, pieceTop, terrainFootprints } from '../dist/terrain.mjs';
import { ARENA, ENTRANCES, TISSUE_NODES, arenaObstacles } from '../dist/simulation.mjs';
import { updateThrowables } from '../dist/abilities.mjs';

const DT = 1 / 60;
const shelf = TERRAIN.artery.find(piece => piece.kind === 'shelf');
const mound = TERRAIN.artery.find(piece => piece.kind === 'mound');
function field(area = 'artery') {
  const sim = new Simulation(area, { ai: { seed: 3 } });
  sim.start();
  Object.assign(sim, { tutorial: null, phase: 'combat', enemies: [], spawnCountdown: 1e9 });
  return sim;
}
// Walks toward a point (yaw faces it) for some seconds with optional extra input.
function walk(sim, to, seconds, extra = {}) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    sim.events = [];
    sim.player.yaw = Math.atan2(-(to.x - sim.player.x), -(to.z - sim.player.z));
    sim.movePlayer(DT, { moveX: 0, moveZ: 1, ...(i === 0 ? extra : {}) });
  }
}

test('raised ground stays clear of the nodes and clots, and steps are taller than a stride', () => {
  for (const [x, z, r] of terrainFootprints(TERRAIN.artery)) {
    for (const node of TISSUE_NODES.artery) assert.ok(Math.hypot(x - node.x, z - node.z) > r + 3, 'clear of ' + node.id);
    for (const [ox, oz, or] of arenaObstacles('artery')) assert.ok(Math.hypot(x - ox, z - oz) > r + or, 'clear of a clot');
  }
  assert.ok(shelf.top > STEP_HEIGHT, 'the shelf needs a jump');
  assert.equal(groundHeight(TERRAIN.artery, shelf.x, shelf.z), shelf.top);
});

test('the suit walks up a mound ramp and stands on its top', () => {
  const sim = field();
  Object.assign(sim.player, { x: mound.x + mound.radius + mound.slope + 2, z: mound.z });
  const eye = sim.player.y;
  walk(sim, mound, 2.5);
  assert.ok(Math.hypot(sim.player.x - mound.x, sim.player.z - mound.z) < mound.radius, 'reached the top');
  assert.ok(Math.abs(sim.player.y - eye - mound.top) < .02, `eye at ${(sim.player.y - eye).toFixed(2)} above the floor`);
});

test('a plaque shelf stops a walk but a jump lands on top, and stepping off falls back down', () => {
  const sim = field();
  Object.assign(sim.player, { x: shelf.x, z: shelf.z + shelf.radius + 1.6 });
  const eye = sim.player.y;
  walk(sim, shelf, 1.2);
  assert.ok(Math.hypot(sim.player.x - shelf.x, sim.player.z - shelf.z) > shelf.radius, 'walking alone cannot climb it');
  assert.ok(sim.player.y < eye + STEP_HEIGHT, 'no higher than its rounded foot');
  walk(sim, shelf, 1.2, { jump: true });
  assert.ok(Math.hypot(sim.player.x - shelf.x, sim.player.z - shelf.z) < shelf.radius, 'the jump carried the suit onto it');
  assert.ok(Math.abs(sim.player.y - eye - shelf.top) < .02);
  walk(sim, { x: shelf.x, z: shelf.z - 20 }, 1.5);
  assert.equal(sim.player.y, eye, 'walked off the far edge and dropped to the floor');
});

test('crawlers path around raised ground; grenades rest on it; a turret up there sees further', () => {
  const sim = field();
  const footprint = terrainFootprints(sim.terrain).length;
  assert.ok(sim.ai.groundNavigation.obstacles.length >= arenaObstacles('artery').length + footprint);
  assert.equal(sim.ai.navigation.obstacles.length, arenaObstacles('artery').length, 'floating pathogens ignore it');
  sim.throwables = [{ id: 1, kind: 'grenade', x: shelf.x, y: 3, z: shelf.z, vx: 0, vy: 0, vz: 0, fuse: 9, age: 0, spin: 0, owner: sim }];
  for (let i = 0; i < 120; i++) updateThrowables(sim, DT);
  assert.ok(Math.abs(sim.throwables[0].y - shelf.top - .14) < .02, 'came to rest on the shelf');
  Object.assign(sim.player, { x: shelf.x, z: shelf.z + 2.2, yaw: 0 });
  sim.turretCharges = 1;
  const point = sim.turretPlacementFor(sim.player);
  assert.ok(point && Math.abs(point.y - shelf.top) < 1e-9, 'placed on the shelf');
});

test('every arena has raised ground clear of nodes, clots, spawns and walls', () => {
  for (const area of ['artery', 'junction', 'heart', 'lungs', 'stomach', 'intestines', 'colon', 'lymph', 'ear', 'brain']) {
    const pieces = TERRAIN[area];
    assert.ok(pieces?.length >= 3, area + ' has terrain');
    const sim = new Simulation(area);
    sim.start();
    for (const [x, z, r] of terrainFootprints(pieces)) {
      for (const node of TISSUE_NODES[area]) assert.ok(Math.hypot(x - node.x, z - node.z) > r + 3, area + ' clear of ' + node.id);
      for (const [ox, oz, or] of arenaObstacles(area)) assert.ok(Math.hypot(x - ox, z - oz) > r + or, area + ' clear of a clot');
      assert.ok(Math.hypot(x - sim.player.x, z - sim.player.z) > r + 2.5, area + ' clear of the insertion point');
      if (area === 'heart') continue;
      for (const [ex, ez] of ENTRANCES.flat()) assert.ok(Math.hypot(x - ex, z - ez) > r + 3, area + ' clear of a spawn');
      assert.ok(Math.hypot(x / ARENA.x, z / ARENA.z) < .9, area + ' inside the chamber');
    }
  }
});

test('stairs (terraces and the cochlea) are walkable step by step, without a jump', () => {
  for (const [area, center, top] of [['intestines', { x: 0, z: -20 }, 2.28], ['lymph', { x: 0, z: -28 }, 1.14]]) {
    const sim = field.call(null, area);
    Object.assign(sim.player, { x: center.x, z: center.z + 7 });
    const eye = sim.player.y;
    walk(sim, center, 3);
    assert.ok(Math.abs(sim.player.y - eye - top) < .02, area + ' walked to the top tier');
  }
  // The intestinal terrace's top tiers stand above the contraction; a colon fold's crest above the squeeze.
  assert.ok(2.28 >= HAZARD_CLEARANCE.intestines && 1.05 >= HAZARD_CLEARANCE.colon);
  const ear = field('ear');
  const spiral = TERRAIN.ear.filter(piece => piece.kind === 'shelf' && !piece.ledge);
  Object.assign(ear.player, { x: spiral[0].x + 2, z: spiral[0].z - 1.5 });
  const eye = ear.player.y;
  for (const step of spiral) walk(ear, step, .9);
  assert.ok(ear.player.y - eye > 2.4, 'climbed the cochlea to its perch');
});

test('breathing platforms rise and fall, and carry a suit standing on them', () => {
  const sim = field('lungs');
  const platform = TERRAIN.lungs.find(piece => piece.breathe);
  Object.assign(sim.player, { x: platform.x, z: platform.z });
  const eye = sim.player.y;
  const heights = [];
  for (let i = 0; i < 6 * 60; i++) {
    sim.clock += DT;
    sim.movePlayer(DT, {});
    heights.push(sim.player.y - eye);
  }
  const low = Math.min(...heights), high = Math.max(...heights);
  assert.ok(high - low > platform.breathe.amp * 1.8, `rode ${low.toFixed(2)}..${high.toFixed(2)}`);
  assert.ok(high <= pieceTop(platform, platform.breathe.period / 4 - platform.breathe.phase * platform.breathe.period / (2 * Math.PI)) + .02);
  sim.turretCharges = 1;
  Object.assign(sim.player, { x: platform.x, z: platform.z + 2.2, yaw: 0 });
  assert.equal(sim.turretPlacementFor(sim.player), null, 'no turret on moving ground');
});

test('raised ground clears the acid, the contraction and the squeeze; the cochlea perch clears the resonance', () => {
  for (const area of ['stomach', 'intestines', 'colon']) {
    const sim = field(area);
    sim.organ = { ...sim.organ, phase: 'active', x: sim.player.x, z: sim.player.z, radius: 50, width: 200, depth: 200 };
    const health = sim.player.health;
    sim.player.feet = HAZARD_CLEARANCE[area];
    sim.applyOrganHazard(DT);
    assert.equal(sim.player.health, health, area + ' hazard passes beneath');
    sim.player.feet = 0;
    sim.clock += 1;
    sim.applyOrganHazard(DT);
    assert.ok(sim.player.health < health, area + ' hazard still hurts on the floor');
  }
  const ear = field('ear');
  ear.organ = { ...ear.organ, phase: 'active', x: 10, z: -22, radius: 9 };
  ear.turret = { x: 10, y: RESONANCE_CLEARANCE + .1, z: -22, yaw: 0, pitch: 0, cooldown: 0, targetId: null };
  ear.updateTurret(DT);
  assert.equal(ear.turret.jammed, false, 'the perch is above the resonance');
  ear.turret.y = 0;
  ear.updateTurret(DT);
  assert.equal(ear.turret.jammed, true);
});

test('spores lob over raised ground at a perched suit, spit splashes against it, and floaters rise to perches', () => {
  const sim = field();
  // A suit standing on the artery's central shelf.
  Object.assign(sim.player, { x: shelf.x, z: shelf.z, health: 100 });
  sim.movePlayer(DT, {});
  assert.ok(sim.player.feet > .7, 'standing on the shelf');
  const spore = sim.createEnemy('spore', shelf.x + 9, shelf.z, sim.nodes[0]);
  sim.enemies.push(spore);
  Object.assign(spore, { actionTarget: 'player', actionPlayerId: sim.player.id, attackPoint: { x: sim.player.x, y: sim.player.y - .2, z: sim.player.z } });
  sim.ai.controllers.delete(spore.id);
  sim.events = [];
  sim.launchSpore(spore);
  const shot = sim.projectiles.at(-1);
  assert.ok(shot.lob, 'the spit is lobbed');
  const health = sim.player.health;
  for (let i = 0; i < 180 && sim.projectiles.length; i++) { sim.events = []; sim.clock += DT; sim.advanceProjectiles(DT); }
  assert.ok(sim.player.health < health, 'the lob lands on the perched suit');

  // A straight shot driven into the shelf's side splashes there.
  sim.projectiles = [{ id: 99, owner: spore, target: 'player', targetPlayerId: sim.player.id, x: shelf.x + shelf.radius + 1.5, y: .4, z: shelf.z,
    vx: -7, vy: 0, vz: 0, radius: .2, arming: 0, lifetime: 3 }];
  sim.player.x += 40;
  let splashed = false;
  for (let i = 0; i < 60 && sim.projectiles.length; i++) {
    sim.events = []; sim.clock += DT; sim.advanceProjectiles(DT);
    splashed ||= sim.events.some(event => event.type === 'enemyAttack' && event.stage === 'miss');
  }
  assert.ok(splashed && !sim.projectiles.length, 'stopped by the raised ground');

  // A floating virus near a perched suit drifts up toward it.
  sim.player.x -= 40;
  const virus = sim.createEnemy('virus', shelf.x + 6, shelf.z, sim.nodes[0]);
  for (let i = 0; i < 120; i++) sim.perchLift(virus, DT);
  assert.ok(virus.perchLift > .6, `rose ${virus.perchLift.toFixed(2)} m`);
});

test('pathogens still reach a suit up on raised ground: crawlers climb, drones and floaters rise', () => {
  const sim = field('intestines');
  const top = { x: 0, z: -20 };
  Object.assign(sim.player, top);
  for (let i = 0; i < 30; i++) sim.movePlayer(DT, {});
  assert.ok(sim.player.feet > 2, 'standing on the terrace top');
  // A crawler on a step rides the step, its legs on the ground.
  const crawler = sim.createEnemy('crawler', top.x + 3, top.z, sim.nodes[0]);
  sim.enemies.push(crawler);
  const bot = sim.createEnemy('rogue-bot', top.x + 7, top.z + 3, sim.nodes[0]);
  sim.enemies.push(bot);
  const virus = sim.createEnemy('virus', top.x - 2, top.z + 2, sim.nodes[0]);
  sim.enemies.push(virus);
  let hits = 0, lowestVirus = Infinity, crawlerAbove = Infinity;
  for (let i = 0; i < 60 * 12; i++) {
    sim.events = [];
    Object.assign(sim.player, top);
    sim.step(DT, {});
    hits += sim.events.filter(event => event.type === 'damage' && event.target === 'player').length;
    sim.player.health = 100;
    if (virus.action === 'idle') lowestVirus = Math.min(lowestVirus, virus.y - sim.groundUnder(virus));
    crawlerAbove = Math.min(crawlerAbove, crawler.y - sim.groundUnder(crawler));
  }
  assert.ok(hits > 3, `the perched suit was hit ${hits} times`);
  assert.ok(crawlerAbove > .5, 'the crawler stood on the steps, not inside them');
  assert.ok(lowestVirus > .8, 'the virus floated clear of the terrace');
  assert.ok(bot.y > 2.15 + 1, `the drone rose to the perch (${bot.y.toFixed(2)})`);
});
