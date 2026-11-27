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

const run = (sim, seconds, input) => { for (let t = 0; t < seconds; t += DT) { sim.events = []; sim.movePlayer(DT, input); } };

test('crouching lowers the eye and slows the suit; crouch again to stand', () => {
  const sim = field();
  stand(sim, 0, 30);
  run(sim, .2, {});
  const eye = sim.player.y;
  run(sim, DT, { crouch: true });
  run(sim, .6, {});
  assert.ok(sim.player.crouched);
  assert.ok(sim.player.y < eye - .5, 'eye lower');
  const z = sim.player.z;
  run(sim, 1, { moveZ: 1 });
  const crouched = Math.abs(sim.player.z - z);
  run(sim, DT, { crouch: true });
  run(sim, .3, {});
  assert.equal(sim.player.crouched, false);
  const z2 = sim.player.z;
  run(sim, 1, { moveZ: 1 });
  assert.ok(crouched < Math.abs(sim.player.z - z2) * .7, 'slower crouched');
});

test('a crouched suit fits under a vessel run too low to walk under, and cannot stand up beneath it', async () => {
  const { solidGround } = await import('../dist/solids.mjs');
  const sim = field();
  // A run whose underside is 1.4 m up: under a standing suit's head, over a crouched one's.
  const spot = { x: 0, z: 40 };
  assert.equal(solidGround(sim.solids, spot.x, spot.z, 0), 0, 'open floor');
  sim.solids = [...sim.solids, Object.freeze({ x: spot.x, z: spot.z, r: 2, c: 2.4, half: 1, kind: 'tube' })];
  const approach = () => { stand(sim, spot.x, spot.z + 4.5); sim.player.yaw = 0; };
  const gap = () => Math.abs(sim.player.z - spot.z);
  approach();
  run(sim, 1, { moveZ: 1 });
  assert.ok(gap() > 1.5, `standing, it is blocked (${gap().toFixed(2)} m short)`);
  approach();
  run(sim, DT, { crouch: true });
  run(sim, .3, {});
  for (let t = 0; t < 3 && gap() > .2; t += DT) run(sim, DT, { moveZ: 1 });
  assert.ok(gap() <= .2, 'crouched, it gets under');
  run(sim, DT, { crouch: true });
  assert.equal(sim.player.crouched, true, 'no room to stand');
});

test('a slide from a sprint carries the suit further than a sprint, and ends crouched', () => {
  const sim = field();
  stand(sim, 0, 40);
  sim.player.yaw = 0;
  run(sim, .3, { moveZ: 1, sprint: true });
  const z = sim.player.z;
  run(sim, DT, { moveZ: 1, sprint: true, crouch: true });
  assert.ok(sim.player.sliding, 'sliding');
  run(sim, .4, { moveZ: 1, sprint: true });
  const slid = z - sim.player.z;
  assert.ok(slid > 10.8 * .43 * 1.05, `the slide outpaces a sprint (${slid.toFixed(2)} m)`);
  run(sim, .6, { moveZ: 1 });
  assert.equal(sim.player.sliding, false);
  assert.equal(sim.player.crouched, true, 'it ends crouched');
});
