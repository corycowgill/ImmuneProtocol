import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation, SPECIES } from '../dist/simulation.mjs';
import { CoopSimulation } from '../dist/coop-simulation.mjs';
import { CAMPAIGN_AREAS } from '../dist/coop-protocol.mjs';
import { applyDifficulty } from '../dist/difficulty.mjs';
import { ENCOUNTER_PATTERNS, ENCOUNTER_RULES, stepEncounters } from '../dist/encounters.mjs';
import { AIWorld } from '../dist/tactical-ai.mjs';

const DT = 1 / 30;
const counts = list => [...list.reduce((m, type) => m.set(type, (m.get(type) ?? 0) + 1), new Map())].sort();
function fixture(area = 'artery', wave = 1, seed = 17, difficulty = 'medium') {
  const sim = applyDifficulty(new Simulation(area, { encounterSeed: seed }), difficulty);
  sim.start();
  if (wave !== 1) { sim.wave = wave - 1; sim.beginWave(); }
  sim.field = null;
  return sim;
}
function trace(sim, seconds = 180, { kill = true, each = () => {} } = {}) {
  const events = [], spawns = [], seen = new Set();
  const wave = sim.wave;
  for (let i = 0; i < seconds / DT && sim.wave === wave && sim.phase === 'combat'; i++) {
    sim.step(DT);
    events.push(...sim.events.filter(e => e.type === 'encounter').map(e => ({ ...e, time: sim.clock })));
    for (const node of sim.nodes) node.health = 100;
    for (const suit of sim.activeSuits()) suit.player.health = 100;
    for (const enemy of [...sim.enemies]) {
      if (!seen.has(enemy.id)) { seen.add(enemy.id); spawns.push({ type: enemy.type, x: enemy.x, z: enemy.z, health: enemy.maxHealth,
        order: enemy.encounterOrder ? structuredClone(enemy.encounterOrder) : null, nodeId: enemy.nodeId, time: sim.clock }); }
      if (kill && !enemy.boss && !enemy.nest) sim.hitEnemy(enemy, 1e5, false, enemy, 'turret');
    }
    each(events, spawns);
  }
  return { events, spawns };
}

test('every supported mission/difficulty keeps the exact authored roster and valid arrival spacing', () => {
  for (const area of CAMPAIGN_AREAS) for (const difficulty of ['easy', 'medium', 'hard']) {
    const sim = fixture(area, 1, 31, difficulty);
    for (let wave = 1; wave <= sim.waves; wave++) {
      if (wave !== 1) { sim.wave = wave - 1; sim.beginWave(); }
      const mission = sim.missions[wave - 1], plan = sim.encounterPlan;
      if (!plan) continue;
      assert.deepEqual(counts(plan.slots.map(s => s.type)), counts(mission.species), area + difficulty);
      assert.equal(new Set(plan.slots.map(s => s.source)).size, mission.species.length);
      for (let i = 1; i < plan.slots.length; i++) assert.ok(plan.slots[i].at - plan.slots[i - 1].at >= ENCOUNTER_RULES.minimumGap - 1e-6);
      assert.equal(new Set(plan.packs.map(p => p.pattern)).size, plan.packs.length);
      for (const p of plan.packs) assert.equal(plan.slots.filter(s => plan.packs[s.pack] === p).length, p.size);
    }
    sim.ai.dispose();
  }
});

test('all six encounter patterns appear using existing species, with meaningful ordered compositions', () => {
  const observed = new Set();
  for (let seed = 0; seed < 18; seed++) {
    const sim = fixture('colon', 3, seed), { packs, slots } = sim.encounterPlan;
    for (const p of packs) {
      const design = ENCOUNTER_PATTERNS.find(d => d.id === p.pattern);
      const group = slots.filter(s => packs[s.pack] === p);
      observed.add(p.pattern);
      group.forEach((s, i) => assert.ok(design.needs[i].includes(s.type)));
      if (p.pattern === 'convoy') assert.equal(group[0].type, 'guard');
    }
    sim.ai.dispose();
  }
  assert.deepEqual([...observed].sort(), ENCOUNTER_PATTERNS.map(p => p.id).sort());
});

test('a fixed seed is repeatable and different deployment seeds vary the encounters', () => {
  const signature = seed => {
    const sim = fixture('colon', 2, seed), data = JSON.stringify(sim.encounterPlan);
    sim.ai.dispose(); return data;
  };
  assert.equal(signature(17), signature(17)); assert.notEqual(signature(17), signature(18));
});

test('checkpoint retries restore the encounter seed and the same composition/timing', () => {
  const sim = fixture('colon', 2, 197, 'hard');
  const retry = applyDifficulty(new Simulation('colon', { encounterSeed: 1 }), 'hard');
  retry.start(structuredClone(sim.checkpoint));
  assert.equal(retry.encounterSeed, 197);
  assert.deepEqual(retry.encounterPlan, sim.encounterPlan);
  assert.equal(retry.wave, 2);
});

test('training, scripted junction/heart, airway and Mega Virus keep their authored arrivals', () => {
  for (const area of ['heart', 'junction']) assert.equal(fixture(area).encounterPlan, null);
  const training = new Simulation('artery', { tutorial: true, encounterSeed: 1 }); training.start();
  assert.equal(training.encounterPlan, null);
  const brain = fixture('brain', 3); assert.equal(brain.encounterPlan, null);
  const lungs = fixture('lungs'); lungs.startAirwayObjective();
  lungs.encounter = { stage: 'active' }; stepEncounters(lungs, DT); assert.equal(lungs.encounter, null);
});

test('integrated waves warn at least four seconds before a group arrives, without extra enemies or stats', () => {
  const sim = fixture(), expected = [...sim.missions[0].species];
  const { events, spawns } = trace(sim);
  assert.deepEqual(counts(spawns.map(e => e.type)), counts(expected));
  assert.ok(events.some(e => e.stage === 'warning')); assert.ok(events.some(e => e.stage === 'engage'));
  for (const spawn of spawns.filter(s => s.order)) {
    const warning = events.filter(e => e.id === spawn.order.id && e.stage === 'warning' && e.time <= spawn.time).at(-1);
    assert.ok(spawn.time - warning.time >= ENCOUNTER_RULES.warning - DT * 1.1);
    assert.equal(spawn.health, SPECIES[spawn.type].health);
  }
});

test('a suit occupying a warned inlet forces a fresh safe warning instead of a nearby pop-in', () => {
  const sim = fixture(); let occupied = false, rerouted = false;
  trace(sim, 45, { each(events, spawns) {
    if (!occupied && sim.encounter?.stage === 'warning') {
      Object.assign(sim.player, sim.encounter.approaches[0]); occupied = true;
    }
    rerouted ||= events.some(e => e.reroute);
    for (const spawn of spawns.filter(s => s.order)) assert.ok(Math.hypot(spawn.x - sim.player.x, spawn.z - sim.player.z) >= ENCOUNTER_RULES.safeSuit - .2);
  } });
  assert.ok(occupied); assert.ok(rerouted);
});

test('crossfire/pincer groups advertise physically separated fronts', () => {
  const sim = fixture();
  trace(sim, 25, { each() {
    if (sim.encounter?.approaches.length === 2) {
      const [a, b] = sim.encounter.approaches;
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 28);
    }
  } });
});

test('Decoy Rush splits fast distractors and tissue attackers between announced nodes', () => {
  let sim, pack;
  for (let seed = 0; seed < 30; seed++) {
    const candidate = fixture('colon', 2, seed), found = candidate.encounterPlan.packs.find(p => p.pattern === 'feint');
    if (found) { sim = candidate; pack = found; break; }
    candidate.ai.dispose();
  }
  assert.ok(sim); const { spawns, events } = trace(sim);
  const members = spawns.filter(s => s.order?.id === pack.id);
  assert.equal(members.length, 4);
  assert.equal(members[0].order.role, 'aggressor'); assert.equal(members[2].order.role, 'objective');
  assert.notEqual(members[0].nodeId, members[2].nodeId);
  assert.ok(events.some(e => e.id === pack.id && e.stage === 'turn'));
});

test('high active pressure holds a group until there is room, then resumes with bounded spacing', () => {
  const sim = fixture(), pack = sim.encounterPlan.packs[0];
  sim.spawnIndex = pack.start; sim.clock = pack.at;
  for (let i = 0; i < ENCOUNTER_RULES.maxActive; i++) sim.enemies.push(sim.createEnemy('virus', i, 0));
  for (let i = 0; i < 10 / DT; i++) { sim.clock += DT; stepEncounters(sim, DT); }
  assert.equal(sim.spawnIndex, pack.start); assert.equal(pack.stage, 'holding');
  sim.enemies = [];
  for (let i = 0; i < 2 / DT; i++) { sim.clock += DT; stepEncounters(sim, DT); }
  assert.ok(sim.spawnIndex > pack.start); assert.ok(sim.spawnIndex <= pack.start + 4);
});

test('critical-health relief is bounded, allowing a warned group to finish instead of stalling', () => {
  const sim = fixture(), pack = sim.encounterPlan.packs[0];
  sim.spawnIndex = pack.start; sim.clock = pack.at; sim.player.health = 15;
  for (let i = 0; i < 16 / DT; i++) { sim.clock += DT; stepEncounters(sim, DT); }
  assert.equal(pack.spawned, pack.size);
});

test('group orders reach the ordinary AI but do not reveal hidden suit positions', () => {
  const sim = fixture(); let found;
  for (let i = 0; i < 20 / DT && !found; i++) {
    sim.step(DT); found = sim.enemies.find(e => e.encounterOrder);
  }
  assert.ok(found);
  const c = sim.ai.controllers.get(found.id);
  assert.equal(c.role, found.encounterOrder.role);
  assert.ok(c.memory.targets.size >= 1);
  assert.equal(c.memory.targets.has('player:solo'), false);
  assert.ok(c.destination);
});

test('approach orders allow waypoint movement without overriding combat stopping distance', () => {
  const sim = fixture(); sim.ai.dispose(); sim.obstacles = []; sim.ai = new AIWorld(sim, { seed: 17 });
  const enemy = sim.createEnemy('spore', 0, 0);
  enemy.encounterOrder = { id: 'test', role: 'suppressor', until: 24, approach: { x: 5, z: 0 }, reached: false };
  sim.enemies = [enemy]; sim.ai.begin(DT);
  const c = sim.ai.controllers.get(enemy.id);
  c.destination = { x: 5, z: 0 }; c.action = 'pursue'; c.targetKey = 'player:solo';
  c.move(.1, 4, 10); assert.equal(enemy.x, 0);
  c.action = 'objective'; c.targetKey = 'node:' + enemy.nodeId;
  c.move(.1, 4, 10); assert.ok(enemy.x > 0);
  const arrived = enemy.x; enemy.encounterOrder.reached = true;
  c.move(.1, 4, 10); assert.equal(enemy.x, arrived);
  sim.ai.dispose();
});

test('group clear events are emitted once and cleanup drops encounter state', () => {
  const sim = fixture(); const { events } = trace(sim);
  const cleared = events.filter(e => e.stage === 'clear');
  assert.ok(cleared.length); assert.equal(new Set(cleared.map(e => e.id)).size, cleared.length);
  assert.equal(sim.encounter, null); assert.equal(sim.encounterPlan, null);
  sim.reset(); assert.equal(sim.encounter, null); assert.equal(sim.encounterPlan, null);
});

test('co-op reconnect snapshots include current warnings, not private future wave plans', () => {
  const sim = new CoopSimulation([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 'artery', { encounterSeed: 17 });
  sim.start();
  for (let i = 0; i < 20 / DT && !sim.encounter; i++) sim.step(DT);
  const snapshot = sim.snapshotFor('b');
  assert.equal(snapshot.encounter.id, sim.encounter.id); assert.equal(snapshot.encounterPlan, undefined);
  assert.notEqual(snapshot.encounter.approaches, sim.encounter.approaches);
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test('splitter descendants keep their group identity and delay the clear announcement', () => {
  const sim = fixture(), pack = sim.encounterPlan.packs[0];
  pack.node = 0; pack.otherNode = 1; pack.stage = 'active'; pack.spawned = pack.size;
  const parent = sim.createEnemy('splitter', 0, 0);
  parent.encounterOrder = { id: pack.id, role: 'flanker', until: 24, approach: { x: 1, z: 1 } };
  sim.enemies = [parent]; sim.hitEnemy(parent, 1e5, false, parent, 'turret');
  assert.equal(sim.enemies.length, 2);
  assert.ok(sim.enemies.every(e => e.encounterOrder?.id === pack.id));
  sim.clock += DT; stepEncounters(sim, DT); assert.notEqual(pack.stage, 'clear');
  for (const child of [...sim.enemies]) sim.hitEnemy(child, 1e5, false, child, 'turret');
  sim.clock += DT; stepEncounters(sim, DT); assert.equal(pack.stage, 'clear');
});
