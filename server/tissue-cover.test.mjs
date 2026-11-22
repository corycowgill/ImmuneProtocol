import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation, TISSUE_BLOCK_RADIUS } from '../dist/simulation.mjs';

// Aims the suit straight at a point and traces one perfectly accurate ray.
function shoot(sim, at) {
  const player = sim.player;
  const dx = at.x - player.x, dy = at.y - player.y, dz = at.z - player.z;
  const length = Math.hypot(dx, dy, dz);
  return sim.traceRay(player, { x: dx / length, y: dy / length, z: dz / length }, true, sim.weapon);
}

function field() {
  const sim = new Simulation('artery', { ai: { seed: 3 } });
  sim.start();
  sim.tutorial = null;
  sim.enemies = [];
  return sim;
}

test('a pathogen hiding behind a tissue node cannot be shot through it', () => {
  const sim = field();
  const node = sim.nodes[0];
  Object.assign(sim.player, { x: node.x, y: node.y, z: node.z + 12 });
  const enemy = sim.createEnemy('virus', node.x, node.z - 4, node);
  enemy.y = node.y;
  sim.enemies.push(enemy);
  const shot = shoot(sim, enemy);
  assert.equal(shot.target, undefined);
  assert.ok(Math.abs(shot.distance - (12 - TISSUE_BLOCK_RADIUS)) < 1e-6);
});

test('a clear line past the node still hits, and so does a pathogen in front of it', () => {
  const sim = field();
  const node = sim.nodes[0];
  Object.assign(sim.player, { x: node.x, y: node.y, z: node.z + 12 });
  const flanking = sim.createEnemy('virus', node.x + 4, node.z - 4, node);
  flanking.y = node.y;
  const front = sim.createEnemy('bacillus', node.x, node.z + 2.2, node);
  front.y = node.y;
  sim.enemies.push(flanking, front);
  assert.equal(shoot(sim, flanking).target, flanking);
  assert.equal(shoot(sim, front).target, front);
});

test('a suit repairing from inside a node can still shoot out of it', () => {
  const sim = field();
  const node = sim.nodes[0];
  Object.assign(sim.player, { x: node.x, y: node.y, z: node.z + .5 });
  const enemy = sim.createEnemy('virus', node.x, node.z - 6, node);
  enemy.y = node.y;
  sim.enemies.push(enemy);
  assert.equal(shoot(sim, enemy).target, enemy);
});
