import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from '../dist/simulation.mjs';
import { abilityState } from '../dist/abilities.mjs';
import { clearSegment } from '../dist/ai-navigation.mjs';
import { solidSpan, suitSolids } from '../dist/solids.mjs';
import { arenaObstacles } from '../dist/simulation.mjs';

const DT = 1 / 30;
function field(area) {
  const sim = new Simulation(area);
  sim.start();
  sim.tutorial = null;
  sim.enemies = [];
  sim.spawnIndex = 1e9;
  return sim;
}
const go = (sim, seconds, input) => {
  const events = [];
  for (let t = 0; t < seconds; t += DT) {
    sim.events = [];
    sim.movePlayer(DT, input);
    events.push(...sim.events);
  }
  return events;
};
// Stands the suit `gap` metres off a solid's edge, facing its centre.
function faceSolid(sim, solid, gap = 2) {
  const p = sim.player;
  Object.assign(abilityState(sim), { feet: 0, airborne: false, vy: 0, mantle: null });
  p.x = solid.x;
  p.z = solid.z + solid.r + gap;
  p.yaw = 0;
}

test('a clot is a wall to walk into, but a jump at it grabs the edge and climbs on top', () => {
  const sim = field('artery');
  const clot = sim.solids[2];
  faceSolid(sim, clot, 3);
  go(sim, 1.2, { moveZ: 1 });
  assert.equal(sim.player.feet, 0, 'walking alone does not climb it');
  assert.ok(Math.hypot(sim.player.x - clot.x, sim.player.z - clot.z) > clot.r * .9, 'it stops at the side');
  const events = [...go(sim, DT, { moveZ: 1, jump: true }), ...go(sim, .5, { moveZ: 1 })];
  assert.ok(events.some(event => event.type === 'mantle'), 'it grabs the ledge');
  go(sim, .4, { moveZ: 1 });
  assert.ok(sim.player.feet > 1.4, 'standing up on the clot');
  // And walks over the top and down the far side.
  go(sim, 2.5, { moveZ: 1 });
  assert.ok(sim.player.z < clot.z - clot.r, 'over the far side');
});

test('no firing while the hands are on the ledge', () => {
  const sim = field('artery');
  faceSolid(sim, sim.solids[2], .3);
  sim.player.ammo = 30;
  let climbed = false, shotsWhileClimbing = 0;
  for (let t = 0; t < 1; t += DT) {
    sim.events = [];
    sim.movePlayer(DT, { moveZ: 1, jump: t < DT });
    const before = sim.player.ammo;
    if (sim.player.mantling) { climbed = true; sim.fireCooldown = 0; sim.updateRifle(DT, { fire: true }, false); if (sim.player.ammo < before) shotsWhileClimbing++; }
  }
  assert.ok(climbed);
  assert.equal(shotsWhileClimbing, 0);
});

test('pillars stay walls: no standing on them and no climbing them', () => {
  const sim = field('lungs');
  const column = sim.solids[0];
  assert.equal(column.kind, 'pillar');
  faceSolid(sim, column, 1);
  const events = [...go(sim, .6, { moveZ: 1 }), ...go(sim, DT, { moveZ: 1, jump: true }), ...go(sim, 1, { moveZ: 1 })];
  assert.ok(!events.some(event => event.type === 'mantle'));
  assert.ok(Math.hypot(sim.player.x - column.x, sim.player.z - column.z) >= column.r - 1e-6);
  assert.equal(sim.player.feet, 0);
});

test('the artery vessels: climb onto a low run, walk under a high one', () => {
  const sim = field('artery');
  const tubes = sim.solids.filter(solid => solid.kind === 'tube');
  const low = tubes.find(tube => tube.c + tube.half > .9 && tube.c + tube.half < 1.3 && tube.r > 2);
  faceSolid(sim, low, 1);
  const events = [...go(sim, DT, { moveZ: 1, jump: true }), ...go(sim, 1.2, { moveZ: 1 })];
  assert.ok(events.some(event => event.type === 'mantle'), 'it climbs onto the low vessel');
  // A stretch whose underside clears the suit's head is walked straight under.
  const high = tubes.find(tube => tube.c - tube.half > 2.2 && tube.r > 1);
  assert.ok(solidSpan(high, high.x, high.z), 'it is over that spot');
  faceSolid(sim, high, 1);
  go(sim, 1, { moveZ: 1 });
  assert.equal(sim.player.feet, 0);
  assert.ok(sim.player.z < high.z, 'under and past its centre line');
});

test('clot, mound and biofilm solids match what each arena draws; other arenas only have pillars', () => {
  for (const area of ['artery', 'stomach', 'colon']) {
    const solids = suitSolids(area, arenaObstacles(area)).filter(solid => solid.kind === 'dome');
    assert.equal(solids.length, arenaObstacles(area).length, area);
    for (const solid of solids) {
      const top = solid.c + solid.half;
      assert.ok(top > 1.4 && top < 3.2, `${area} dome top ${top.toFixed(2)} is a climbable height`);
    }
  }
  for (const area of ['lungs', 'intestines', 'lymph', 'ear', 'brain', 'heart']) {
    assert.ok(suitSolids(area, arenaObstacles(area)).every(solid => solid.kind === 'pillar'), area);
  }
});

test('a suit up on a clot can be seen and hit; spit passes over a clot below it', () => {
  const sim = field('artery');
  const clot = sim.solids[2];
  const perched = { x: clot.x, z: clot.z, feet: clot.c + clot.half };
  const enemy = { x: clot.x, z: clot.z + clot.r + 6 };
  assert.equal(clearSegment(sim.obstacles, enemy, perched), true, 'in plain view up there');
  assert.equal(clearSegment(sim.obstacles, enemy, { x: clot.x, z: clot.z - clot.r - 3, feet: 0 }), false, 'but the clot hides a suit behind it');
});

test('floating pathogens fly up and over to attack a suit standing on a clot', () => {
  for (const type of ['virus', 'spore']) {
    const sim = new Simulation('artery', { ai: { seed: 4 } });
    sim.start();
    sim.tutorial = null;
    sim.spawnIndex = 1e9;
    const clot = sim.solids[2], player = sim.player;
    const state = abilityState(sim);
    Object.assign(state, { feet: clot.c + clot.half, airborne: false, vy: 0, mantle: null });
    Object.assign(player, { x: clot.x, z: clot.z, y: state.eye + state.feet, feet: state.feet });
    sim.enemies = [sim.createEnemy(type, clot.x + 7, clot.z + 2, sim.nodes[0])];
    const health = player.health;
    let highest = 0;
    for (let t = 0; t < 14 && sim.enemies.length; t += DT) {
      sim.step(DT, {});
      highest = Math.max(highest, sim.enemies[0]?.y ?? 0);
    }
    assert.ok(player.health < health, `${type}: the suit on the clot is hit`);
    assert.ok(highest > clot.c + clot.half, `${type}: it rises above the clot`);
  }
});

test('crawlers climb a clot after a suit on it, and rogue bots shoot down onto it', () => {
  for (const [type, dx] of [['crawler', 7], ['rogue-bot', 9]]) {
    const sim = new Simulation('artery', { ai: { seed: 4 } });
    sim.start();
    sim.tutorial = null;
    sim.spawnIndex = 1e9;
    const clot = sim.solids[2], player = sim.player;
    const state = abilityState(sim);
    Object.assign(state, { feet: clot.c + clot.half, airborne: false, vy: 0, mantle: null });
    Object.assign(player, { x: clot.x, z: clot.z, y: state.eye + state.feet, feet: state.feet });
    sim.enemies = [sim.createEnemy(type, clot.x + dx, clot.z + 2, sim.nodes[0])];
    const health = player.health;
    let highest = 0;
    for (let t = 0; t < 10 && sim.enemies.length; t += DT) {
      sim.step(DT, {});
      highest = Math.max(highest, sim.enemies[0]?.y ?? 0);
    }
    assert.ok(player.health < health, `${type}: the suit on the clot is hit`);
    if (type === 'crawler') assert.ok(highest > 1.5, 'the crawler walked up onto the clot');
  }
});
