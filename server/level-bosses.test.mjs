import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CoopSimulation } from '../dist/coop-simulation.mjs';
import { ENEMY_MODELS } from '../dist/enemy-models.mjs';
import { LEVEL_BOSSES, clearLine, levelBossStatus } from '../dist/level-bosses.mjs';
import { Simulation } from '../dist/simulation.mjs';

const STEP = 1 / 30;

// Starts the mission's last wave with its roster already spent, so the boss walks straight in.
function summon(area, sim = new Simulation(area)) {
  sim.start();
  sim.wave = sim.waves - 1;
  sim.enemies = [];
  sim.beginWave();
  sim.field = null;
  const mission = sim.missions[sim.wave - 1];
  sim.spawnIndex = (mission.arrivals ?? mission.species).length;
  sim.step(STEP, {});
  return { sim, boss: sim.enemies.find(enemy => enemy.boss) };
}

// Runs the fight with the squad and tissue kept alive, collecting boss events.
function fight(sim, seconds, { each = () => {}, input = {} } = {}) {
  const seen = [];
  for (let clock = 0; clock < seconds; clock += STEP) {
    sim.step(STEP, input);
    seen.push(...sim.events.filter(event => event.type === 'levelBoss'));
    for (const node of sim.nodes) node.health = 100;
    if (each(seen) === false) break;
  }
  return seen;
}

const abilities = seen => seen.filter(event => event.stage === 'ability').map(event => event.ability);

test('every mission without a scripted boss gets its own, with a model, and the wave waits for it', () => {
  assert.deepEqual(Object.keys(LEVEL_BOSSES).sort(), ['artery', 'colon', 'ear', 'intestines', 'junction', 'lungs', 'lymph', 'stomach']);
  assert.equal(new Set(Object.values(LEVEL_BOSSES).map(boss => boss.model)).size, 8);
  for (const [area, design] of Object.entries(LEVEL_BOSSES)) {
    assert.ok(ENEMY_MODELS[design.model], area + ' boss has a model');
    const { sim, boss } = summon(area);
    assert.equal(boss.name, design.name);
    assert.equal(boss.health, design.health);
    assert.ok(sim.events.some(event => event.type === 'levelBoss' && event.stage === 'arrive' && event.hint === design.hint));
    const status = levelBossStatus(sim);
    assert.equal(status.name, design.name);
    // Nothing else is alive, yet the wave stays open.
    sim.enemies = sim.enemies.filter(enemy => enemy.boss || enemy.segmentOf);
    fight(sim, 12, { each: () => { sim.player.health = 100; } });
    assert.equal(sim.phase, 'combat', area);
    assert.ok(sim.remaining >= 1);
    // Killing it pays the suit that did it and lets the wave end.
    for (const part of sim.enemies.filter(enemy => enemy.segmentOf)) sim.hitEnemy(part, 1e6, false, part, 'player', sim);
    const live = sim.enemies.find(enemy => enemy.boss);
    live.hidden = false;
    live.damageScale = 1;
    const before = sim.player.score;
    sim.hitEnemy(live, 1e6, false, live, 'player', sim);
    assert.equal(sim.player.score - before, design.score);
    assert.ok(sim.events.some(event => event.type === 'levelBoss' && event.stage === 'defeated'));
    assert.equal(sim.enemies.some(enemy => enemy.boss || enemy.segmentOf), false);
    assert.equal(levelBossStatus(sim), null);
  }
  // Earlier waves, training and the scripted finales have none.
  const early = new Simulation('artery');
  early.start();
  early.spawnIndex = early.missions[0].species.length;
  early.step(STEP, {});
  assert.equal(early.enemies.some(enemy => enemy.boss), false);
  for (const area of ['heart', 'brain']) assert.equal(LEVEL_BOSSES[area], undefined);
  // A bigger squad faces a tougher boss.
  const duo = summon('artery', new CoopSimulation([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]));
  assert.equal(duo.boss.health, Math.round(LEVEL_BOSSES.artery.health * 1.7));
  assert.doesNotThrow(() => JSON.stringify(duo.sim.snapshotFor('a')));
});

test('Thrombus Titan: armoured until its charge hits the wall', () => {
  const { sim, boss } = summon('artery');
  Object.assign(sim.player, { x: boss.x, z: boss.z + 30 });
  const start = boss.health;
  sim.hitEnemy(boss, 100, false, boss, 'player', sim);
  assert.ok(Math.abs(start - boss.health - 40) < 1e-6, 'armour soaks most of a hit');
  let charged = false;
  const seen = fight(sim, 40, { each: events => {
    sim.player.health = 100;
    charged ||= boss.state === 'charge';
    return !abilities(events).includes('stunned');
  } });
  assert.ok(charged && abilities(seen).includes('charge'));
  assert.equal(boss.state, 'stunned');
  assert.ok(boss.damageScale > 1);
  assert.equal(levelBossStatus(sim).state, 'exposed');
  fight(sim, 6, { each: () => { sim.player.health = 100; } });
  assert.equal(boss.damageScale, .4);
});

test('Capillary Leech: drains a node into itself until shot off', () => {
  const { sim, boss } = summon('junction');
  boss.health = boss.maxHealth * .5;
  const seen = fight(sim, 30, { each: events => !abilities(events).includes('latch') });
  assert.ok(abilities(seen).includes('latch'));
  const node = boss.node;
  const drained = boss.health;
  for (let i = 0; i < 60; i++) sim.step(STEP, {});
  assert.ok(node.health < 100, 'the latched node loses tissue');
  assert.ok(boss.health > drained, 'and the leech heals');
  assert.ok(boss.latched);
  sim.hitEnemy(boss, boss.maxHealth * .14, false, boss, 'player', sim);
  sim.step(STEP, {});
  assert.equal(boss.state, 'reel');
  assert.equal(boss.latched, false);
  fight(sim, 4);
  assert.notEqual(boss.node, node, 'it moves on to the other node');
});

test('Mold Crown and Pylori Drill: volleys from the air, eruptions from below', () => {
  const lungs = summon('lungs');
  const volleys = fight(lungs.sim, 14, { each: () => { lungs.sim.player.health = 100; } });
  assert.ok(abilities(volleys).includes('volley'));
  assert.ok(lungs.boss.y > 5, 'it stays overhead');
  assert.ok(lungs.boss.shots >= 6);

  const { sim, boss } = summon('stomach');
  const seen = fight(sim, 9, { each: events => { sim.player.health = 100; return !abilities(events).includes('burrow'); } });
  assert.ok(abilities(seen).includes('burrow'));
  assert.equal(boss.hidden, true);
  // Burrowed, nothing can hit it.
  Object.assign(sim.player, { x: boss.x, z: boss.z + 8, yaw: 0, pitch: 0 });
  const ray = sim.traceRay(sim.player, { x: 0, y: (boss.y - sim.player.y) / 8, z: -1 }, true, sim.weapon);
  assert.notEqual(ray.target, boss);
  const erupted = fight(sim, 9, { each: events => { sim.player.health = 100; return !abilities(events).includes('erupt'); } });
  assert.ok(abilities(erupted).includes('erupt'));
  assert.ok(erupted.some(event => event.stage === 'tremor'));
  assert.equal(boss.hidden, false);
});

test('Tapeworm: the head is shielded until every segment is destroyed', () => {
  const { sim, boss } = summon('intestines');
  const segments = sim.enemies.filter(enemy => enemy.segmentOf === boss.id);
  assert.equal(segments.length, 7);
  fight(sim, 6, { each: () => { sim.player.health = 100; } });
  // The chain trails the head in order.
  const gaps = segments.map((segment, index) => Math.hypot(segment.x - (index ? segments[index - 1].x : boss.x), segment.z - (index ? segments[index - 1].z : boss.z)));
  assert.ok(gaps.every(gap => gap > 1 && gap < 5), 'segments follow at their spacing: ' + gaps.map(gap => gap.toFixed(1)));
  const health = boss.health;
  sim.hitEnemy(boss, 100, false, boss, 'player', sim);
  assert.ok(health - boss.health < 10, 'shots barely scratch the shielded head');
  assert.equal(levelBossStatus(sim).detail, '7 segments left');
  for (const segment of segments) sim.hitEnemy(segment, 1e5, false, segment, 'player', sim);
  const seen = fight(sim, 1);
  assert.ok(abilities(seen).includes('exposed'));
  assert.ok(boss.damageScale > 1);
});

test('Biofilm Colossus and Rogue Macrophage: regrowth, splits, the pull and its break', () => {
  const colon = summon('colon');
  Object.assign(colon.sim.player, { x: colon.boss.x + 40, z: colon.boss.z });
  colon.sim.hitEnemy(colon.boss, colon.boss.maxHealth * .3, false, colon.boss, 'player', colon.sim);
  const split = fight(colon.sim, 1);
  assert.ok(abilities(split).includes('split'));
  assert.ok(colon.sim.enemies.some(enemy => enemy.type === 'amoeba'));
  const wounded = colon.boss.health;
  colon.sim.enemies = [colon.boss];
  fight(colon.sim, 9, { each: () => { colon.sim.player.health = 100; colon.sim.enemies = [colon.boss]; } });
  assert.ok(colon.boss.health > wounded, 'left alone, it regrows');

  const { sim, boss } = summon('lymph');
  Object.assign(sim.player, { x: boss.x + 18, z: boss.z });
  const seen = fight(sim, 14, { each: events => { sim.player.health = 100; return !abilities(events).includes('pull'); } });
  assert.ok(abilities(seen).includes('pull'));
  const gap = Math.hypot(sim.player.x - boss.x, sim.player.z - boss.z);
  for (let i = 0; i < 15; i++) sim.step(STEP, {});
  assert.ok(Math.hypot(sim.player.x - boss.x, sim.player.z - boss.z) < gap - 1, 'the suit is dragged in');
  sim.hitEnemy(boss, boss.maxHealth * .06, false, boss, 'player', sim);
  const broken = fight(sim, 1);
  assert.ok(abilities(broken).includes('broken'));
  assert.ok(boss.damageScale > 1);
  // Pathogens that touch it are eaten.
  const prey = sim.createEnemy('virus', boss.x + 1, boss.z, sim.nodes[0]);
  sim.enemies.push(prey);
  boss.health = boss.maxHealth * .5;
  const eaten = fight(sim, .2);
  assert.ok(abilities(eaten).includes('devour'));
  assert.equal(sim.enemies.includes(prey), false);
});

test('Otolith Screamer: the pulse only reaches suits it can see', () => {
  const { sim, boss } = summon('ear');
  const [ox, oz, size] = sim.obstacles[0];
  fight(sim, 5, { each: () => { sim.player.health = 100; } });
  // Directly behind an obstacle from the boss, then out in the open.
  const away = Math.hypot(ox - boss.x, oz - boss.z);
  const behind = { x: ox + (ox - boss.x) / away * (size + 1.5), z: oz + (oz - boss.z) / away * (size + 1.5) };
  assert.equal(clearLine(sim, boss, behind), false);
  const open = { x: boss.x + 14, z: boss.z - 30 };
  const pulse = place => {
    boss.state = 'charge';
    boss.timer = STEP / 2;
    Object.assign(sim.player, place, { health: 100 });
    sim.projectiles = [];
    sim.step(STEP, {});
    return 100 - sim.player.health;
  };
  assert.equal(pulse(behind), 0, 'cover blocks the pulse');
  if (clearLine(sim, boss, open)) assert.ok(pulse(open) > 20, 'the open does not');
});
