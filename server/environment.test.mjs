import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from '../dist/simulation.mjs';
import { abilityState, updateThrowables } from '../dist/abilities.mjs';

const DT = 1 / 30;
function field(area = 'artery') {
  const sim = new Simulation(area);
  sim.start();
  sim.tutorial = null;
  sim.enemies = [];
  sim.spawnIndex = 1e9;
  return sim;
}
const clotOf = sim => sim.solids[2];
const stand = (sim, x, z, feet = 0) => {
  const state = abilityState(sim);
  Object.assign(state, { feet, airborne: false, vy: 0, mantle: null });
  Object.assign(sim.player, { x, z, y: state.eye + feet, feet });
};
const aimAt = (from, to) => {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, length = Math.hypot(dx, dy, dz);
  return { x: dx / length, y: dy / length, z: dz / length };
};

test('a clot stops a shot at a pathogen behind it; from on top of it the shot gets through', () => {
  const sim = field();
  const clot = clotOf(sim);
  const enemy = sim.createEnemy('bacillus', clot.x, clot.z - clot.r - 3, sim.nodes[0]);
  sim.enemies = [enemy];
  stand(sim, clot.x, clot.z + clot.r + 4);
  const blocked = sim.traceRay(sim.player, aimAt(sim.player, enemy), false, sim.weapon);
  assert.equal(blocked.target, undefined, 'hidden behind the clot');
  assert.ok(blocked.distance < clot.r * 2 + 4, 'the shot stops at the clot');
  stand(sim, clot.x, clot.z, clot.c + clot.half);
  const clear = sim.traceRay(sim.player, aimAt(sim.player, enemy), false, sim.weapon);
  assert.equal(clear.target, enemy, 'from the top it has a clear shot');
});

test('a grenade lobbed onto a clot comes to rest on top of it', () => {
  const sim = field();
  const clot = clotOf(sim);
  sim.throwables = [{ id: 1, kind: 'stun', owner: sim, fuse: 99, age: 0, rest: false, x: clot.x, y: clot.c + clot.half + 3, z: clot.z, vx: 0, vy: 0, vz: 0, spin: 0 }];
  for (let t = 0; t < 3; t += DT) { sim.events = []; updateThrowables(sim, DT); }
  const item = sim.throwables[0];
  assert.ok(item.rest, 'it settled');
  assert.ok(Math.abs(item.y - (clot.c + clot.half)) < .4, `resting on the clot's top (y ${item.y.toFixed(2)})`);
});

test('a grenade thrown along the floor into a clot bounces off its side', () => {
  const sim = field();
  const clot = clotOf(sim);
  sim.throwables = [{ id: 1, kind: 'stun', owner: sim, fuse: 99, age: 0, rest: false, x: clot.x, y: .4, z: clot.z + clot.r + 2, vx: 0, vy: 0, vz: -9, spin: 0 }];
  for (let t = 0; t < 2; t += DT) { sim.events = []; updateThrowables(sim, DT); }
  assert.ok(sim.throwables[0].z > clot.z + clot.r * .8, 'it did not pass into the clot');
});
