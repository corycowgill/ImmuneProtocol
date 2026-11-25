import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Simulation } from '../dist/simulation.mjs';
import { applyDifficulty } from '../dist/difficulty.mjs';
import {
  ENDLESS_AREAS, ENDLESS_RULES, applyEndless, endlessScaling, endlessWave, endlessWavesCleared,
  parseEndlessRecords, recordEndlessRun,
} from '../dist/endless.mjs';

const STEP = 1 / 30;

function endless(area, difficulty = 'medium') {
  const sim = applyEndless(new Simulation(area));
  applyDifficulty(sim, difficulty);
  sim.start();
  return sim;
}

// Plays with an invincible squad that deletes every pathogen as it arrives, until wave `target`
// starts. Returns what it saw along the way.
function playTo(sim, target, limit = 60 * 60 * 30) {
  const seen = { bosses: [], waves: new Set(), outcomes: [] };
  for (let i = 0; i < limit && sim.wave < target; i++) {
    sim.step(STEP, {});
    for (const event of sim.events) {
      if (event.type === 'wave' && event.stage === 'start') seen.waves.add(event.wave);
      if (event.type === 'mission') seen.outcomes.push(event.outcome);
    }
    for (const enemy of [...sim.enemies]) {
      if (enemy.boss && !seen.bosses.some(entry => entry.id === enemy.id)) {
        seen.bosses.push({ id: enemy.id, wave: sim.wave, health: enemy.maxHealth, name: enemy.name });
      }
      enemy.hidden = false;
      enemy.damageScale = 1;
      if (sim.enemies.includes(enemy)) sim.hitEnemy(enemy, 1e7, false, enemy, 'player', sim);
    }
    sim.player.health = 100;
    for (const node of sim.nodes) node.health = 100;
    if (sim.phase !== 'combat' && sim.phase !== 'intermission') break;
  }
  return seen;
}

test('each wave is bigger, faster and tougher than the last, with a boss every fifth wave', () => {
  const base = new Simulation('artery').missions;
  let previous = null;
  for (let wave = 1; wave <= 30; wave++) {
    const scale = endlessScaling(wave);
    const mission = endlessWave(base, wave);
    assert.equal(mission.endlessBoss, wave % ENDLESS_RULES.bossEvery === 0, 'boss on wave ' + wave);
    assert.ok(mission.cadence > 0);
    if (previous) {
      assert.ok(scale.count > previous.count && scale.health > previous.health && scale.damage > previous.damage);
      assert.ok(scale.cadence <= previous.cadence);
    }
    previous = scale;
  }
  assert.equal(endlessScaling(1).count, 1);
  assert.equal(endlessScaling(1).health, 1);
  assert.equal(endlessScaling(200).cadence, ENDLESS_RULES.minCadence);
  // Every wave fields more pathogens than the one before, even when templates repeat.
  for (const area of ENDLESS_AREAS) {
    const rosters = new Simulation(area).missions;
    for (let wave = 2; wave <= 40; wave++) {
      assert.ok(endlessWave(rosters, wave).species.length > endlessWave(rosters, wave - 1).species.length, area + ' wave ' + wave);
    }
  }
  assert.ok(endlessWave(base, 15).species.length > endlessWave(base, 5).species.length);
  assert.ok(endlessWave(base, 15).species.length > 1.5 * base.at(-1).species.length);
});

test('generated organ waves keep one lane per pathogen', () => {
  for (const area of ENDLESS_AREAS) {
    const base = new Simulation(area).missions;
    for (const wave of [1, 4, 9, 17]) {
      const mission = endlessWave(base, wave);
      if (mission.lanes !== undefined) assert.equal(mission.lanes.length, mission.species.length, area + ' wave ' + wave);
    }
  }
});

test('only plain-roster arenas offer endless mode', () => {
  for (const area of ['junction', 'heart', 'stomach', 'brain']) {
    assert.throws(() => applyEndless(new Simulation(area)), /not available/);
  }
});

test('an endless run never wins, has no checkpoints, and brings the boss back stronger', () => {
  const sim = endless('artery');
  const seen = playTo(sim, 11);
  assert.ok(sim.wave >= 11, 'reached wave 11, at ' + sim.wave);
  assert.deepEqual(seen.outcomes, []);
  assert.ok(sim.waves > sim.wave);
  assert.equal(sim.checkpoint, null);
  // Wave 1 begins inside start(), before the first step.
  for (let wave = 2; wave <= 11; wave++) assert.ok(seen.waves.has(wave), 'wave ' + wave + ' started');
  assert.deepEqual(seen.bosses.map(boss => boss.wave), [5, 10]);
  assert.equal(seen.bosses[0].name, 'Thrombus Titan');
  assert.ok(seen.bosses[1].health > seen.bosses[0].health * 1.4, 'the second Titan is much tougher');
  assert.equal(endlessWavesCleared(sim), 10);
});

test('every endless arena runs through its first boss wave', () => {
  for (const area of ENDLESS_AREAS) {
    const sim = endless(area, area === 'artery' ? 'hard' : 'easy');
    const seen = playTo(sim, 6);
    assert.ok(sim.wave >= 6, area + ' reached wave 6, at ' + sim.wave);
    assert.deepEqual(seen.outcomes, [], area);
    assert.deepEqual(seen.bosses.map(boss => boss.wave), [5], area);
  }
});

test('later waves field tougher pathogens that hit harder', () => {
  const sim = endless('lymph');
  const early = sim.createEnemy('virus', 0, 0, sim.nodes[0]);
  sim.wave = 11;
  const late = sim.createEnemy('virus', 0, 0, sim.nodes[0]);
  assert.equal(late.maxHealth, Math.round(early.maxHealth * endlessScaling(11).health));
  const node = sim.nodes[0];
  node.health = 100;
  sim.damageNode(node, 10);
  assert.ok(Math.abs(100 - node.health - 10 * endlessScaling(11).damage) < 1e-9);
  // A pathogen hit on tissue is scaled once, not once per wrapper.
  const tissue = sim.nodes[1];
  tissue.health = 100;
  const plain = new Simulation('lymph');
  plain.start();
  plain.nodes[1].health = 100;
  plain.damageTarget(late, 'tissue', 5, late, undefined, plain.nodes[1]);
  sim.damageTarget(late, 'tissue', 5, late, undefined, tissue);
  assert.ok(Math.abs((100 - tissue.health) - (100 - plain.nodes[1].health) * endlessScaling(11).damage) < 1e-9);
});

test('pathogens over the field cap wait at the inlet and still count as threats', () => {
  const sim = endless('artery');
  sim.wave = 1;
  while (sim.enemies.length < ENDLESS_RULES.aliveCap) sim.enemies.push(sim.createEnemy('virus', 0, -30, sim.nodes[0]));
  const before = sim.spawnIndex;
  sim.spawn('virus');
  sim.spawn('spore');
  assert.equal(sim.enemies.length, ENDLESS_RULES.aliveCap);
  assert.equal(sim.endless.backlog.length, 2);
  assert.equal(sim.spawnIndex, before + 2);
  sim.enemies.splice(0, 5);
  sim.step(STEP, {});
  assert.equal(sim.endless.backlog.length, 0);
  assert.equal(sim.spawnIndex >= before + 2, true);
});

test('records keep the most waves, then the higher score', () => {
  let records = parseEndlessRecords('not json');
  assert.deepEqual(records, {});
  let result = recordEndlessRun(records, { area: 'ear', waves: 4, score: 9000, difficulty: 'hard' });
  assert.equal(result.best, true);
  records = result.records;
  assert.equal(recordEndlessRun(records, { area: 'ear', waves: 3, score: 99999, difficulty: 'easy' }).best, false);
  assert.equal(recordEndlessRun(records, { area: 'ear', waves: 4, score: 8000, difficulty: 'easy' }).best, false);
  result = recordEndlessRun(records, { area: 'ear', waves: 4, score: 9500, difficulty: 'easy' });
  assert.equal(result.best, true);
  assert.deepEqual(parseEndlessRecords(JSON.stringify(result.records)), { ear: { waves: 4, score: 9500, difficulty: 'easy' } });
  assert.deepEqual(parseEndlessRecords('{"ear":{"waves":-1,"score":3},"heart":{"waves":3,"score":1}}'), {});
});
