import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, RULES, SPECIES, Simulation, TISSUE_NODES, arenaObstacles } from '../dist/simulation.mjs';
import { HEART_VALVES, VALVE_OPEN_TIME, VALVE_PERIOD, insideSleeve, valveFrame } from '../dist/heart-chamber.mjs';

const DT = 1 / 30;
const heart = () => { const sim = new Simulation('heart'); sim.start(); return sim; };
// Opens valve `index` fully at the start of its open window.
const openValve = (sim, index) => { sim.clock = HEART_VALVES[index].offset + .8; sim.updateValves(); };
const aimAt = (player, target) => {
  const dx = target.x - player.x, dy = target.y - player.y, dz = target.z - player.z;
  const flat = Math.hypot(dx, dz);
  return { x: dx / Math.hypot(flat, dy), y: dy / Math.hypot(flat, dy), z: dz / Math.hypot(flat, dy) };
};

test('the heart is a full-size chamber with four valves, a wound in front of each and room to run', () => {
  const sim = heart();
  assert.equal(HEART_VALVES.length, 4);
  assert.equal(sim.nodes.length, 4);
  assert.deepEqual(TISSUE_NODES.heart.map(node => node.valveIndex), [0, 1, 2, 3]);
  for (const [index, valve] of HEART_VALVES.entries()) {
    const node = sim.nodes[index];
    const { u } = valveFrame(valve, node.x, node.z);
    assert.ok(u < -8 && u > -11, valve.id + ' wound sits in front of its mouth');
    assert.ok(Math.hypot(valve.x / ARENA.x, valve.z / ARENA.z) < 1, valve.id + ' inside the arena');
  }
  // Wounds are a long sprint apart.
  for (let a = 0; a < 4; a++) {
    const b = (a + 1) % 4;
    assert.ok(Math.hypot(sim.nodes[a].x - sim.nodes[b].x, sim.nodes[a].z - sim.nodes[b].z) > 35);
  }
  // A suit cannot walk into a sleeve.
  const valve = HEART_VALVES[0];
  Object.assign(sim.player, { x: valve.x, z: valve.z - valve.oz * 6, yaw: 0 });
  for (let i = 0; i < 90; i++) sim.movePlayer(DT, { moveZ: 1 });
  assert.ok(!insideSleeve(valve, sim.player), 'stopped at the mouth');
  assert.ok(arenaObstacles('heart').length >= 16);
});

test('the valves beat in turn, so their open windows roll around the chamber', () => {
  const sim = heart();
  const opened = [];
  sim.updateValves();
  assert.equal(sim.valve.open, 0, 'every valve starts shut');
  for (let t = 0; t < VALVE_PERIOD * 2; t += DT) {
    sim.clock = t;
    sim.events = [];
    sim.updateValves();
    for (const event of sim.events) if (event.stage === 'open') opened.push(event.valveId);
  }
  assert.deepEqual(opened.slice(0, 4), HEART_VALVES.map(valve => valve.id));
  assert.ok(opened.length >= 7);
});

test('colonies are rooted on the floor behind every valve and can only be shot through an open aperture', () => {
  const sim = heart();
  const colonies = sim.enemies.filter(enemy => enemy.type === 'colony');
  assert.equal(colonies.length, 12);
  assert.equal(sim.valve.colonyTotal, 12);
  for (const colony of colonies) {
    assert.ok(insideSleeve(HEART_VALVES[colony.valveIndex], colony), 'behind its valve');
    // Its hit sphere rests on the floor rather than floating in the valve's bore.
    assert.ok(Math.abs(colony.y - SPECIES.colony.radius) < .2);
  }
  const valve = HEART_VALVES[0];
  const colony = colonies.find(item => item.valveIndex === 0 && Math.abs(valveFrame(valve, item.x, item.z).v) < .1);
  Object.assign(sim.player, { x: valve.x - valve.ox * 13, z: valve.z - valve.oz * 13 });
  const ray = aimAt(sim.player, colony);
  sim.clock = 0; sim.updateValves();
  const closed = sim.traceRay(sim.player, ray, true, sim.weapon);
  assert.equal(closed.target, undefined);
  assert.ok(closed.blocked, 'the closed leaflets stop the shot');
  openValve(sim, 0);
  // The valve spews a spore as it opens; clear it out of the line of fire.
  sim.enemies = sim.enemies.filter(enemy => enemy.type === 'colony');
  assert.equal(sim.traceRay(sim.player, ray, true, sim.weapon).target, colony);
  // Through the side of the sleeve: muscle, never the colony.
  Object.assign(sim.player, { x: colony.x + valve.lx * 15, z: colony.z + valve.lz * 15 });
  assert.equal(sim.traceRay(sim.player, aimAt(sim.player, colony), true, sim.weapon).target, undefined);
});

test('open valves spit at their wound and spew spores; destroying every colony and sealing every wound wins', () => {
  const sim = heart();
  sim.patrolIndex = Infinity;
  Object.assign(sim.player, { x: 0, z: 0 });
  const before = sim.nodes.map(node => node.health);
  let spew = 0;
  let spit = 0;
  for (let t = 0; t < VALVE_PERIOD * 1.5; t += DT) {
    sim.step(DT, {});
    for (const event of sim.events) {
      if (event.type === 'valve' && event.stage === 'spew') spew++;
      if (event.type === 'enemyAttack' && event.enemyType === 'colony' && event.stage === 'release') spit++;
    }
  }
  assert.ok(spit >= 8, 'colonies spat through the open valves');
  assert.ok(spew >= 3, 'valves spewed spores');
  assert.ok(sim.nodes.every((node, index) => node.health < before[index]), 'every wound took fire');

  // A rocket bursting outside a sleeve does not reach the colonies inside it.
  const colony = sim.enemies.find(enemy => enemy.type === 'colony');
  const layout = HEART_VALVES[colony.valveIndex];
  assert.ok(sim.shielded(colony, { x: layout.x - layout.ox, y: 1.5, z: layout.z - layout.oz }));
  assert.ok(!sim.shielded(colony, colony));

  for (const enemy of [...sim.enemies]) sim.hitEnemy(enemy, 1e5, false, enemy, 'player', sim);
  assert.ok(sim.valve.colonyDefeated);
  sim.projectiles.length = 0;
  for (const node of sim.nodes) node.health = RULES.tissue;
  for (let t = 0; t < 6 && sim.phase === 'combat'; t += DT) sim.step(DT, {});
  assert.equal(sim.phase, 'won');
});

test('a wound can only be sealed while its own valve is shut, and flank patrols bring nano drones', () => {
  const sim = heart();
  const node = sim.nodes[1];
  Object.assign(sim.player, { x: node.x, z: node.z + 2 });
  openValve(sim, 1);
  sim.updateRepair(DT, true);
  assert.equal(sim.canRepair, false);
  sim.clock = HEART_VALVES[1].offset + VALVE_OPEN_TIME + 1; sim.updateValves();
  sim.updateRepair(DT, true);
  assert.equal(sim.canRepair, true);

  const patrol = heart();
  const types = new Set();
  const targets = new Set();
  for (let t = 0; t < 60; t += DT) {
    patrol.clock += DT;
    patrol.spawnHeartPatrol();
  }
  for (const enemy of patrol.enemies) if (enemy.type !== 'colony') { types.add(enemy.type); targets.add(enemy.nodeId); }
  assert.ok(types.has('rogue-bot') && types.has('crawler'));
  assert.equal(targets.size, 4, 'patrols rotate round all four wounds');
});
