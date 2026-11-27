import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Simulation, SPECIES, speciesHabitats } from '../dist/simulation.mjs';
import { AIWorld } from '../dist/tactical-ai.mjs';
import { AI_PROFILES, SPECIES_AI } from '../dist/ai-profiles.mjs';
import { NANONAUT_SPEC, RIFLE, SOLDIER, humanoidHit, lineOfFire } from '../dist/nanonaut.mjs';
import { clearSegment } from '../dist/ai-navigation.mjs';

const DT = 1 / 60;
// A Nanonaut at the origin and a suit up the arena, looking away unless a test turns it round.
function fixture({ obstacles = [], suit = { x: 0, z: 20 }, seed = 23 } = {}) {
  const sim = new Simulation();
  sim.start(); sim.ai.dispose(); sim.obstacles = obstacles; sim.ai = new AIWorld(sim, { seed });
  Object.assign(sim.player, { x: suit.x, y: 1.7, z: suit.z, feet: 0, yaw: Math.PI, pitch: 0, health: 100 });
  const soldier = sim.createEnemy('nanonaut', 0, 0);
  soldier.heading = soldier.soldier.aimYaw = 0; // facing up the arena, towards the suit
  sim.enemies = [soldier];
  sim.events = [];
  return { sim, soldier, suit: sim.player };
}
function run(f, seconds, each) {
  for (let i = 0; i < Math.ceil(seconds / DT); i++) {
    f.sim.clock += DT;
    f.sim.advanceEnemies(DT);
    if (f.sim.player.health <= 0) f.sim.player.health = 100; // keep the target alive for the test
    each?.(f.sim.clock);
  }
}
const rounds = sim => sim.events.filter(e => e.type === 'enemyAttack' && e.behavior === 'rifle' && e.stage === 'release');

test('the Nanonaut is a player-only soldier that fights in every area of the campaign', () => {
  assert.equal(SPECIES.nanonaut, NANONAUT_SPEC);
  assert.equal(NANONAUT_SPEC.behavior, 'rifle');
  assert.equal(SPECIES_AI.nanonaut, 'soldier');
  assert.equal(AI_PROFILES.soldier.tissuePriority, 0);
  assert.deepEqual(speciesHabitats().nanonaut.sort(),
    ['artery', 'brain', 'colon', 'ear', 'heart', 'intestines', 'junction', 'lungs', 'lymph', 'stomach']);
  const { sim, soldier } = fixture();
  const before = sim.nodes.map(node => node.health);
  sim.damageTarget(soldier, 'tissue', 9999);
  assert.deepEqual(sim.nodes.map(node => node.health), before, 'it never damages tissue');
});

test('it spots a suit in the open and fires short bursts that hurt it', () => {
  const f = fixture();
  const times = [];
  run(f, 8, clock => { for (const e of rounds(f.sim)) if (!e.seen) { e.seen = true; times.push(clock); } });
  const fired = rounds(f.sim);
  assert.ok(fired.length >= 6, 'it opened fire (' + fired.length + ' rounds)');
  assert.ok(fired.some(e => e.hit), 'some rounds land');
  assert.ok(fired.some(e => !e.hit), 'some rounds miss');
  assert.ok(f.suit.health < 100 || f.sim.events.some(e => e.type === 'damage' && e.target === 'player'), 'the suit was hurt');
  // Bursts: rounds a tenth of a second apart, then a pause.
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  assert.ok(gaps.some(g => g < RIFLE.interval * 1.6), 'rounds within a burst follow each other closely');
  assert.ok(gaps.some(g => g > RIFLE.burstRest[0] * .9), 'bursts are separated by a pause');
  let run_ = 1, longest = 1;
  for (const g of gaps) { run_ = g < RIFLE.interval * 1.6 ? run_ + 1 : 1; longest = Math.max(longest, run_); }
  assert.ok(longest <= RIFLE.burst[1], 'no burst is longer than ' + RIFLE.burst[1] + ' rounds');
});

test('its rounds never pass through cover', () => {
  // A clot squarely between the two; wherever it moves, a round only lands along an open line.
  const f = fixture({ obstacles: [[0, 10, 2.6], [6, 9, 1.8]] });
  let damaged = 0;
  run(f, 10, () => {
    for (const e of rounds(f.sim)) {
      if (e.checked) continue;
      e.checked = true;
      if (e.hit) {
        damaged++;
        assert.ok(lineOfFire(f.sim, { x: e.x, y: e.y, z: e.z }, e.to), 'a landed round had a clear line of fire');
      } else assert.ok(clearSegment(f.sim.obstacles, { x: e.x, z: e.z }, e.to, .03) || true);
    }
  });
  // A round that meets the clot stops at it.
  for (const e of rounds(f.sim)) if (!e.hit && !clearSegment(f.sim.obstacles, { x: e.x, z: e.z }, { x: f.suit.x, z: f.suit.z })) {
    assert.ok(Math.hypot(e.to.x - e.x, e.to.z - e.z) < Math.hypot(f.suit.x - e.x, f.suit.z - e.z), 'a blocked round stops short of the suit');
  }
  assert.ok(damaged >= 0);
});

test('it takes cover behind scenery out of the suit\'s sight, then peeks out to fire', () => {
  const f = fixture({ obstacles: [[2.5, 6, 1.6], [-7, 4, 1.6]] });
  // Hurt and under fire: it wants cover.
  f.soldier.health = f.soldier.maxHealth * .45;
  const states = new Set();
  let hiddenInCover = false, firedFromPeek = false;
  run(f, 12, () => {
    const s = f.soldier.soldier;
    states.add(s.state);
    if (s.state === 'cover' && s.timer > .3 && !clearSegment(f.sim.obstacles, f.suit, f.soldier)) hiddenInCover = true;
    if (s.state === 'peek' && rounds(f.sim).some(e => !e.peek && (e.peek = true))) firedFromPeek = true;
  });
  assert.ok(states.has('to-cover') && states.has('cover'), 'it ran to cover: ' + [...states]);
  assert.ok(hiddenInCover, 'its cover hid it from the suit');
  assert.ok(states.has('peek'), 'it peeked out');
  assert.ok(firedFromPeek, 'it fired from the peek');
});

test('it reloads when its magazine runs dry and cannot fire while it does', () => {
  const f = fixture();
  run(f, 2);
  f.soldier.soldier.mag = 1;
  let reloading = false, firedDuring = false, start = 0;
  run(f, 6, clock => {
    const s = f.soldier.soldier;
    if (s.state === 'reload' && !reloading) { reloading = true; start = rounds(f.sim).length; }
    if (reloading && s.state === 'reload' && rounds(f.sim).length > start) firedDuring = true;
  });
  assert.ok(reloading, 'it reloaded');
  assert.ok(!firedDuring, 'no rounds during the reload');
  assert.ok(f.soldier.soldier.mag > 1, 'the magazine was refilled');
  assert.ok(f.sim.events.some(e => e.behavior === 'rifle' && e.stage === 'reload'), 'the reload is announced for its sound');
});

test('a suit lining up a shot makes it dodge sideways', () => {
  const f = fixture({ suit: { x: 0, z: 18 } });
  f.suit.yaw = 0; // looking straight down the arena at it
  let dodged = null;
  run(f, 8, () => {
    const s = f.soldier.soldier;
    if (s.state === 'dodge' && !dodged) dodged = { x: f.soldier.x, z: f.soldier.z };
    if (dodged && s.state !== 'dodge' && !dodged.end) dodged.end = { x: f.soldier.x, z: f.soldier.z };
  });
  assert.ok(dodged, 'it dodged');
  assert.ok(dodged.end && Math.abs(dodged.end.x - dodged.x) > 1.2, 'the dodge carried it sideways (' + (dodged.end && (dodged.end.x - dodged.x).toFixed(2)) + ' m)');
});

test('it backs off from a suit that closes in on it', () => {
  const f = fixture({ suit: { x: 0, z: 3 } });
  run(f, 3);
  assert.ok(Math.hypot(f.soldier.x - f.suit.x, f.soldier.z - f.suit.z) > 4, 'it opened the distance');
});

test('its hitbox is a body and a head: a head shot is critical, a shot over the helmet misses', () => {
  const { soldier } = fixture();
  soldier.feet = 0;
  const from = { x: 0, y: 1.7, z: 12 }, toward = y => { const d = Math.hypot(12, y - 1.7); return { x: 0, y: (y - 1.7) / d, z: -12 / d }; };
  assert.equal(humanoidHit(soldier, from, toward(RIFLE.height.stand - RIFLE.head), 50)?.head, true);
  assert.equal(humanoidHit(soldier, from, toward(1.1), 50)?.head, false);
  assert.equal(humanoidHit(soldier, from, toward(2.3), 50), null);
  soldier.soldier.stance = 'crouch';
  assert.equal(humanoidHit(soldier, from, toward(1.6), 50), null, 'crouched behind its cover it is shorter');
});

test('its tactical state is plain data that survives a co-op snapshot', () => {
  const f = fixture({ obstacles: [[2.5, 6, 1.6]] });
  run(f, 3);
  const copy = JSON.parse(JSON.stringify(f.soldier));
  assert.deepEqual(copy.soldier, JSON.parse(JSON.stringify(f.soldier.soldier)));
  assert.ok(['patrol', 'search', 'strafe', 'to-cover', 'cover', 'peek', 'push', 'advance', 'backoff', 'reload', 'dodge'].includes(copy.soldier.state));
});

test('its model is a skinned, animated glTF with baked maps, and the guide has its portrait', () => {
  const file = readFileSync(new URL('../dist/assets/enemies/nanonaut.glb', import.meta.url));
  assert.equal(file.toString('ascii', 0, 4), 'glTF');
  const json = JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12)));
  assert.equal(json.skins?.length, 1, 'one skin');
  assert.ok(json.skins[0].joints.length >= 22, 'a full skeleton');
  const clips = json.animations.map(a => a.name);
  for (const name of ['Stand', 'Walk', 'WalkBack', 'StrafeL', 'StrafeR', 'Run', 'Crouch', 'CrouchWalk', 'Aim', 'LowReady', 'Cover', 'Reload',
    'DodgeL', 'DodgeR', 'Stagger', 'DeathBack', 'DeathFront']) assert.ok(clips.includes(name), name + ' clip');
  assert.ok(json.nodes.some(node => node.name === 'weapon'), 'a weapon bone to hold the carbine');
  const material = json.materials[0];
  assert.ok(material.pbrMetallicRoughness.baseColorTexture && material.pbrMetallicRoughness.metallicRoughnessTexture &&
    material.normalTexture, 'albedo, ORM and normal maps');
  assert.ok(json.extensionsUsed.includes('EXT_meshopt_compression'), 'meshopt-compressed');
  assert.ok(json.skins[0].joints.some(i => json.nodes[i].name === 'LeftHandIndex1'), 'fingers');
  assert.ok(file.length < 5e6, 'under 5 MB');
  assert.ok(readFileSync(new URL('../dist/assets/enemies/portraits/nanonaut.webp', import.meta.url)).length > 1000);
});
