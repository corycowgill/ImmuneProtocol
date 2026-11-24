import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from '../dist/simulation.mjs';
import { STEP_HEIGHT, TERRAIN, groundHeight, terrainFootprints } from '../dist/terrain.mjs';
import { TISSUE_NODES, arenaObstacles } from '../dist/simulation.mjs';
import { updateThrowables } from '../dist/abilities.mjs';

const DT = 1 / 60;
const shelf = TERRAIN.artery.find(piece => piece.kind === 'shelf');
const mound = TERRAIN.artery.find(piece => piece.kind === 'mound');
function field() {
  const sim = new Simulation('artery', { ai: { seed: 3 } });
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
