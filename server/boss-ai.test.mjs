import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from '../dist/simulation.mjs';
import { CoopSimulation } from '../dist/coop-simulation.mjs';
import { AIWorld } from '../dist/tactical-ai.mjs';
import { BOSS_TUNING, bossSuit, bossDamageThreat, moveBoss, segmentCircle, telegraph } from '../dist/boss-tactics.mjs';
import { clearSegment } from '../dist/ai-navigation.mjs';
import { LEVEL_BOSSES, BOSS_FLOATS, spawnLevelBoss, stepLevelBoss, levelBossStatus } from '../dist/level-bosses.mjs';
import { createBrainBoss, hitBrainBoss, stepBrainBoss } from '../dist/brain-boss.mjs';
import { telegraphOutline } from '../dist/boss-telegraphs.mjs';

const DT = 1 / 60;
function fixture(area = 'artery', obstacles = [], sim = new Simulation(area)) {
  sim.start(); sim.enemies = []; sim.ai.dispose(); sim.obstacles = obstacles; sim.ai = new AIWorld(sim);
  Object.assign(sim.nodes[0], { x: 0, z: -25 });
  Object.assign(sim.player, { x: 0, z: 15, health: 100 });
  const boss = spawnLevelBoss(sim);
  Object.assign(boss, { x: 0, z: 0 });
  return { sim, boss };
}
function step(sim, boss, seconds, each = () => {}) {
  for (let i = 0; i < Math.ceil(seconds / DT); i++) {
    sim.clock += DT; sim.events = []; stepLevelBoss(sim, boss, DT); each();
  }
}

test('boss vision respects solid cover and keeps only a stale last sighting', () => {
  const { sim, boss } = fixture('lymph', [[5, 5, 2]]);
  assert.ok(bossSuit(sim, boss));
  const last = { ...boss.lastSeen };
  Object.assign(sim.player, { x: 10, z: 10 });
  assert.equal(bossSuit(sim, boss), null);
  assert.deepEqual(boss.lastSeen, last);
});

test('co-op boss focus is stable and recent attackers can earn threat after commitment', () => {
  const coop = new CoopSimulation([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  const { sim, boss } = fixture('artery', [], coop);
  Object.assign(sim.players[0], { x: 0, z: 15 }); Object.assign(sim.players[1], { x: 1, z: 15 });
  assert.equal(bossSuit(sim, boss).player.id, 'a');
  bossDamageThreat(boss, sim.players[1], 600, sim.clock);
  assert.equal(bossSuit(sim, boss).player.id, 'a');
  sim.clock += 3;
  assert.equal(bossSuit(sim, boss).player.id, 'b');
  sim.players[1].health = 0;
  assert.equal(bossSuit(sim, boss).player.id, 'a');
});

test('large ground bosses route around solids using their full collision footprint', () => {
  const { sim, boss } = fixture('colon', [[0, 0, 4]]);
  Object.assign(boss, { x: -14, z: 0 });
  let side = 0;
  for (let i = 0; i < 700; i++) {
    const before = { x: boss.x, z: boss.z }; sim.clock += DT;
    moveBoss(sim, boss, 14, 0, 5, DT, .3);
    assert.ok(clearSegment(sim.obstacles, before, boss, boss.radius - .01));
    side = Math.max(side, Math.abs(boss.z));
  }
  assert.ok(side > 6.5); assert.ok(Math.hypot(boss.x - 14, boss.z) < .4);
});

test('Titan charge uses swept collision, stops at cover and opens its armour', () => {
  const { sim, boss } = fixture('artery', [[0, 7, 2]]);
  Object.assign(boss, { state: 'charge', timer: 4, chargeX: 0, chargeZ: 1, damageScale: .4 });
  const health = sim.player.health;
  step(sim, boss, 1);
  assert.equal(boss.state, 'stunned'); assert.equal(boss.damageScale, 1.7);
  assert.ok(boss.z <= 7 - 2 - boss.radius + .1);
  assert.equal(sim.player.health, health, 'cover protects the suit behind it');
  assert.equal(segmentCircle({ x: -10, z: 0 }, { x: 10, z: 0 }, 0, 0, 1), .45);
});

test('Titan locks the announced co-op victim and commits the final windup direction', () => {
  const coop = new CoopSimulation([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  const { sim, boss } = fixture('artery', [], coop);
  Object.assign(sim.players[0], { x: 0, z: 15 }); Object.assign(sim.players[1], { x: 20, z: 15 });
  boss.cooldown = 0; step(sim, boss, DT);
  assert.equal(boss.state, 'aim'); assert.equal(boss.chargeTargetId, 'a');
  Object.assign(sim.players[1], { x: 1, z: 1 }); step(sim, boss, .5);
  assert.equal(boss.chargeTargetId, 'a');
  boss.timer = .3; const x = boss.chargeX, z = boss.chargeZ;
  sim.players[0].x = 20; step(sim, boss, .1);
  assert.equal(boss.chargeX, x); assert.equal(boss.chargeZ, z);
});

test('Leech interruption prevents the final drain tick and healing', () => {
  const { sim, boss } = fixture('junction');
  Object.assign(boss, { state: 'drain', timer: 8, strikeAt: 0, health: 1000, damageTaken: boss.maxHealth * .14 });
  const node = boss.node, health = boss.health, tissue = node.health;
  step(sim, boss, DT);
  assert.equal(boss.state, 'reel'); assert.equal(node.health, tissue); assert.equal(boss.health, health);
});

test('Mold Crown commits its volley point and cannot accumulate unlimited summons', () => {
  const { sim, boss } = fixture('lungs');
  boss.cooldown = 0; step(sim, boss, DT);
  const point = { ...boss.volleyPoint };
  Object.assign(sim.player, { x: 20, z: 25 });
  step(sim, boss, 2.7);
  assert.deepEqual(boss.volleyPoint, point); assert.ok(boss.shots >= 6);
  for (let i = 0; i < 20; i++) {
    boss.state = 'orbit'; boss.cooldown = 99; boss.seedAt = 0;
    step(sim, boss, DT);
  }
  assert.equal(sim.enemies.filter(e => e.summonedBy === boss.id).length, BOSS_TUNING.minions);
});

test('Drill locks an eruption footprint, stays hidden through warning, and exposes after it', () => {
  const { sim, boss } = fixture('stomach');
  Object.assign(boss, { state: 'burrowed', timer: DT / 2, goalX: 8, goalZ: 8, hidden: true, tremorAt: 0 });
  step(sim, boss, DT);
  assert.equal(boss.state, 'erupting'); assert.equal(boss.hidden, true);
  const footprint = { x: boss.x, z: boss.z };
  sim.hitEnemy(boss, 1000, false, boss, 'player', sim);
  assert.equal(boss.health, boss.maxHealth, 'hidden bosses ignore all damage entry points');
  step(sim, boss, .5);
  assert.deepEqual({ x: boss.x, z: boss.z }, footprint);
  step(sim, boss, .6);
  assert.equal(boss.state, 'surfaced'); assert.equal(boss.damageScale, 1.25);
});

test('Colossus slam can be dodged or blocked by cover and grants a recovery opening', () => {
  const { sim, boss } = fixture('colon', [[0, 4, 1.5]]);
  Object.assign(sim.player, { x: 0, z: 7 }); Object.assign(boss, { state: 'slam', timer: DT / 2, splits: 0, lastHurt: 0, seenDamage: 0 });
  const health = sim.player.health;
  step(sim, boss, DT);
  assert.equal(sim.player.health, health); assert.equal(boss.state, 'recover'); assert.equal(boss.damageScale, 1.2);
  step(sim, boss, 1.3); assert.equal(boss.damageScale, 1);
});

test('Colossus threshold summons are staggered instead of dumping all phases at once', () => {
  const { sim, boss } = fixture('colon'); step(sim, boss, DT);
  boss.health = boss.maxHealth * .1;
  step(sim, boss, .2); assert.equal(boss.splits, 1);
  step(sim, boss, 3.1); assert.equal(boss.splits, 2);
});

test('Macrophage pull is warned, breaks on cover, and never drags through it', () => {
  const { sim, boss } = fixture('lymph'); boss.cooldown = 0;
  step(sim, boss, DT); assert.equal(boss.state, 'pull-windup');
  const z = sim.player.z; step(sim, boss, .5); assert.equal(sim.player.z, z);
  sim.obstacles.push([0, 7, 2]); step(sim, boss, DT);
  assert.equal(boss.state, 'hunt'); assert.equal(sim.player.z, z);
});

test('Screamer cannot move its committed pulse origin, and has a post-pulse opening', () => {
  const { sim, boss } = fixture('ear');
  Object.assign(boss, { state: 'charge', timer: 1, spot: 0, moved: false, health: boss.maxHealth * .4 });
  const at = { x: boss.x, z: boss.z }; step(sim, boss, .5);
  assert.deepEqual({ x: boss.x, z: boss.z }, at);
  step(sim, boss, .6); assert.equal(boss.state, 'recover'); assert.equal(boss.damageScale, 1.2);
});

test('boss phase changes are monotonic across healing and telegraphs serialize for co-op', () => {
  const { sim, boss } = fixture(); boss.health *= .4; step(sim, boss, DT);
  assert.equal(boss.phase, 2); boss.health = boss.maxHealth; step(sim, boss, DT); assert.equal(boss.phase, 2);
  telegraph(boss, 'slam', 1, 9); const outline = telegraphOutline(boss.telegraph);
  assert.equal(outline.length, 32);
  assert.ok(outline.every(p => Math.abs(Math.hypot(p.x - boss.x, p.z - boss.z) - 9) < .001));
  assert.doesNotThrow(() => JSON.stringify(boss)); assert.equal(levelBossStatus(sim).remaining, 1);
});

test('Heart colonies wind up before spitting and a closing valve smothers a pending spit', () => {
  const sim = new Simulation('heart'); sim.start();
  const colony = sim.enemies.find(enemy => enemy.type === 'colony' && enemy.valveIndex === 0);
  colony.attackCooldown = .5;
  sim.clock = 4.5 + .8; sim.updateValves(); sim.advanceColonies(.1);
  assert.ok(sim.valve.valves[0].exposed); assert.ok(colony.charging); assert.equal(sim.projectiles.length, 0);
  sim.clock = 4.5 + 3.65; sim.updateValves(); sim.advanceColonies(.1);
  assert.equal(sim.valve.valves[0].phase, 'closed'); assert.equal(colony.charging, false);
  assert.equal(sim.projectiles.filter(shot => shot.owner === colony).length, 0);
});

test('Mega Virus rejects stale core/phase/cycle hits, sealed hits and repeated kill credit', () => {
  const sim = new Simulation('brain'); sim.start(); createBrainBoss(sim);
  const boss = sim.boss, before = boss.health;
  hitBrainBoss(sim, { vulnerable: true }, boss.weakPoint); assert.equal(boss.health, before);
  boss.state = 'exposed'; boss.openness = 1;
  const hit = { vulnerable: true, weakPointId: boss.weakPoint.id, phase: 1, cycle: boss.cycle };
  hitBrainBoss(sim, hit, boss.weakPoint, 1e4); assert.equal(boss.phase, 2);
  const second = boss.health; boss.state = 'exposed'; boss.openness = 1;
  hitBrainBoss(sim, hit, boss.weakPoint, 1e4); assert.equal(boss.health, second);
  sim.events = [];
  sim.detonate({ owner: sim, bossHit: hit, impact: boss.weakPoint, weapon: { splashRadius: 5, bodyDamage: 90, splashDamage: 100 } });
  assert.equal(boss.health, second); assert.equal(sim.events.some(e => e.type === 'shot' && e.hit), false, 'stale rockets do not show a false hit marker');
  hitBrainBoss(sim, { vulnerable: true }, boss.weakPoint, 1e4); assert.equal(boss.phase, 3);
  boss.state = 'exposed'; boss.openness = 1;
  hitBrainBoss(sim, { vulnerable: true }, boss.weakPoint, 1e4, sim);
  const score = sim.player.score;
  hitBrainBoss(sim, { vulnerable: true }, boss.weakPoint, 1e4, sim);
  assert.equal(score, 3000); assert.equal(sim.player.score, score); assert.equal(sim.player.kills, 1);
});

test('Mega Virus brood respects its exact cap at the boundary', () => {
  const sim = new Simulation('brain'); sim.start(); createBrainBoss(sim);
  for (let i = 0; i < 5; i++) sim.enemies.push(sim.createEnemy('virus', i * 2, 0));
  sim.boss.remaining = .01; stepBrainBoss(sim, .02);
  assert.equal(sim.enemies.length, 6);
});

test('every ground boss can reach tissue through its authored arena at full body clearance', () => {
  for (const [area, design] of Object.entries(LEVEL_BOSSES)) {
    if (BOSS_FLOATS.includes(design.id)) continue;
    const sim = new Simulation(area); sim.start(); sim.enemies = [];
    const boss = spawnLevelBoss(sim), node = boss.node;
    for (let i = 0; i < 3600 && Math.hypot(boss.x - node.x, boss.z - node.z) > 3.1; i++) {
      sim.clock += DT; moveBoss(sim, boss, node.x, node.z, 10, DT, 3);
    }
    assert.ok(Math.hypot(boss.x - node.x, boss.z - node.z) <= 3.1, area + ' boss reaches its objective');
    sim.ai.dispose();
  }
});

test('Tapeworm enters with separated segments instead of an overlapping damage stack', () => {
  const sim = new Simulation('intestines'); sim.start(); sim.enemies = [];
  const boss = spawnLevelBoss(sim); step(sim, boss, DT);
  const chain = [boss, ...sim.enemies.filter(e => e.segmentOf).sort((a, b) => a.order - b.order)];
  for (let i = 1; i < chain.length; i++) assert.ok(Math.hypot(chain[i].x - chain[i - 1].x, chain[i].z - chain[i - 1].z) > 2.5);
});

test('burrowing bosses are immune to environmental digestion as well as weapon damage', () => {
  const { sim, boss } = fixture('stomach'); boss.hidden = true;
  const before = boss.health;
  sim.engulfPathogens(.1, { x: boss.x, z: boss.z, radius: 10 }, 1e5);
  assert.equal(boss.health, before);
});

test('major boss windups reserve additional pressure so minions leave room for counterplay', () => {
  const { sim, boss } = fixture('colon');
  telegraph(boss, 'slam', 1.15, 9);
  const director = sim.ai.director; director.limit = 4;
  assert.equal(director.acquire({ id: 101 }, 'player'), true);
  sim.clock += .2; assert.equal(director.acquire({ id: 102 }, 'player'), true);
  sim.clock += .2; assert.equal(director.acquire({ id: 103 }, 'player'), false);
});
