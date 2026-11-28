import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CoopSimulation } from '../dist/coop-simulation.mjs';
import { DEFAULT_COOP_SETTINGS } from '../dist/coop-protocol.mjs';
import { CoopRooms } from './rooms.mjs';
import { Simulation } from '../dist/simulation.mjs';

const STEP = 1 / 30;

// Ends the current wave at once: its roster is spent and the field is empty.
function finishWave(sim) {
  const mission = sim.missions[sim.wave - 1];
  sim.spawnIndex = (mission.arrivals ?? mission.species).length;
  sim.enemies = [];
  sim.projectiles = [];
  sim.field = null;
  sim.bossArrived = true;
  sim.outro = { remaining: 0, duration: 0 };
  if (sim.gastric?.stage === 'drained') sim.gastric.nextFlank = 99;
  sim.step(STEP, {});
}

// Plays through to the start of `wave`, letting `between` change things during each break.
function reachWave(sim, wave, between = () => {}) {
  for (let guard = 0; sim.wave < wave && guard < 20000; guard++) {
    if (sim.phase === 'combat' && !sim.gastric?.stage?.match(/intake|drain$|draining/)) finishWave(sim);
    if (sim.gastric?.stage === 'intake') sim.gastric.intake.points = sim.gastric.sealPoints - 1, sim.repairTarget = null;
    if (sim.phase === 'intermission') between(sim);
    sim.step(STEP, {});
    for (const node of sim.nodes) node.health = Math.max(node.health, 1);
  }
  assert.equal(sim.wave, wave);
}

function lose(sim) {
  sim.damageNode(sim.nodes[0], 1e6);
  sim.step(STEP, {});
  assert.equal(sim.phase, 'lost');
}

test('a lost wave resumes from its start, with the state the wave began with', () => {
  const sim = new Simulation('artery');
  sim.start();
  sim.step(STEP, { deploy: true });
  assert.ok(sim.turret, 'turret placed in wave 1');
  reachWave(sim, 3, between => {
    between.nodes[1].health = 70;
    between.player.health = 80;
  });
  const checkpoint = sim.checkpoint;
  assert.equal(checkpoint.stage, 'wave');
  assert.equal(checkpoint.wave, 3);
  assert.equal(checkpoint.nodes['artery-flank'], 70);
  assert.ok(checkpoint.score > 0);
  // The wave goes badly: damage, kills, then the core fails.
  sim.nodes[2].health = 12;
  sim.score += 5000;
  lose(sim);

  const retry = new Simulation('artery');
  retry.start(sim.checkpoint);
  assert.equal(retry.wave, 3);
  assert.equal(retry.phase, 'combat');
  assert.equal(retry.score, checkpoint.score, 'score as the wave began');
  assert.equal(retry.nodes[1].health, 70);
  assert.equal(retry.nodes[2].health, 100, 'damage taken during the lost wave is undone');
  assert.equal(retry.player.health, 80);
  assert.deepEqual([retry.turret.x, retry.turret.z], [checkpoint.turret.x, checkpoint.turret.z]);
  assert.equal(retry.turretCharges, checkpoint.turretCharges);
  assert.equal(retry.clock, checkpoint.clock);
  assert.ok(retry.events.some(event => event.type === 'checkpoint' && event.wave === 3));
  // It plays on normally and keeps the same checkpoint.
  for (let i = 0; i < 60; i++) retry.step(STEP, {});
  assert.ok(retry.enemies.length > 0, 'the wave spawns again');
  assert.equal(retry.checkpoint.wave, 3);
  assert.equal(retry.checkpoint.score, checkpoint.score);
});

test('a suit brought back at a checkpoint has at least half its integrity', () => {
  const sim = new Simulation('artery');
  sim.start();
  reachWave(sim, 2, between => { between.player.health = 9; });
  const retry = new Simulation('artery');
  retry.start(sim.checkpoint);
  assert.equal(retry.player.health, 50);
});

test('the lungs airway, the drained stomach and junction overtime resume where they were', () => {
  const lungs = new Simulation('lungs');
  lungs.start();
  reachWave(lungs, lungs.waves);
  finishWave(lungs);
  assert.ok(lungs.airway, 'the airway objective started');
  assert.equal(lungs.checkpoint.stage, 'airway');
  const airway = new Simulation('lungs');
  airway.start(lungs.checkpoint);
  assert.ok(airway.airway);
  assert.equal(airway.wave, airway.waves);
  assert.equal(airway.airway.state, 'reopen');

  const stomach = new Simulation('stomach');
  stomach.start();
  finishWave(stomach);
  stomach.gastric.intake.points = stomach.gastric.sealPoints;
  stomach.gastric.stage = 'drain';
  stomach.gastric.drain.points = stomach.gastric.sealPoints;
  stomach.gastric.stage = 'draining';
  stomach.gastric.remaining = 0;
  stomach.step(STEP, {});
  assert.equal(stomach.wave, 2);
  assert.equal(stomach.checkpoint.gastric.stage, 'drained');
  assert.equal(stomach.checkpoint.hazard, false);
  const drained = new Simulation('stomach');
  drained.start(stomach.checkpoint);
  assert.equal(drained.wave, 2);
  assert.equal(drained.gastric.stage, 'drained');
  assert.equal(drained.organ, null, 'no acid in the drained basin');
  assert.notEqual(drained.gastric, stomach.checkpoint.gastric, 'the retry has its own copy');

  const junction = new Simulation('junction');
  junction.start();
  junction.wave = junction.waves;
  junction.extractionPending = true;
  junction.chooseExtraction('stay');
  assert.equal(junction.checkpoint.overtime, true);
  const overtime = new Simulation('junction');
  overtime.start(junction.checkpoint);
  assert.equal(overtime.overtime, true);
  assert.equal(overtime.wave, overtime.waves);
  assert.equal(overtime.missions.at(-1).name, 'Overtime');
});

test('a co-op squad retries from its checkpoint with every suit restored', () => {
  const profiles = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Bravo' }];
  const sim = new CoopSimulation(profiles);
  sim.start();
  reachWave(sim, 2, between => {
    between.suits[0].player.health = 64;
    between.suits[1].player.score = 1234;
  });
  lose(sim);
  assert.deepEqual(sim.snapshotFor('a').checkpoint, { stage: 'wave', wave: 2 });

  // The server's ready-up after a loss starts the next match from that checkpoint.
  const rooms = new CoopRooms({ simulation: (players, area) => new CoopSimulation(players, area) });
  try {
    const room = { phase: 'finished', simulation: sim, missionIndex: 0, results: [], events: [], settings: { ...DEFAULT_COOP_SETTINGS }, players: profiles.map(p => ({ ...p, weaponLoadout: undefined, suit: undefined, ready: true })) };
    rooms.publishRoom = rooms.publishStates = () => {};
    rooms.startMatch(room);
    const retry = room.simulation;
    assert.notEqual(retry, sim);
    assert.equal(retry.wave, 2);
    assert.equal(retry.suits[0].player.health, 64);
    assert.equal(retry.suits[1].player.score, 1234);
    assert.equal(retry.checkpoint.suits[1].score, 1234);
    assert.equal(room.phase, 'playing');
    // A loss whose checkpoint is the first wave is simply a fresh start.
    retry.checkpoint = { ...retry.checkpoint, wave: 1 };
    lose(retry);
    room.phase = 'finished';
    rooms.startMatch(room);
    assert.equal(room.simulation.wave, 1);
  } finally {
    rooms.close();
  }
});
