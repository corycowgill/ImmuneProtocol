import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from '../dist/simulation.mjs';
import { applyDifficulty } from '../dist/difficulty.mjs';
import { ELITES, eliteChance, makeElite, maybeElite } from '../dist/elites.mjs';
import { radarSnapshot } from '../dist/radar.mjs';

const at = (area, wave, setup = () => {}) => {
  const sim = new Simulation(area, { encounterSeed: 5 });
  setup(sim);
  sim.start(); sim.tutorial = null; sim.wave = wave;
  return sim;
};

test('elites first appear late in the opening mission and grow more common through the campaign', () => {
  assert.equal(eliteChance(at('artery', 3)), 0, 'none in the opening mission before its fourth wave');
  assert.ok(eliteChance(at('artery', 4)) > 0);
  assert.equal(eliteChance(at('lungs', 1)), 0, 'none in a first wave');
  assert.ok(eliteChance(at('brain', 2)) > eliteChance(at('lungs', 2)), 'later missions field more');
  assert.ok(eliteChance(at('lungs', 3)) > eliteChance(at('lungs', 2)), 'later waves field more');
  assert.equal(eliteChance(at('junction', 3)), 0, 'not in the scripted Capillary Junction');
  assert.ok(eliteChance(at('brain', 9)) <= .22);
  const easy = at('lungs', 3, sim => applyDifficulty(sim, 'easy'));
  const hard = at('lungs', 3, sim => applyDifficulty(sim, 'hard'));
  assert.ok(Math.abs(eliteChance(easy) - eliteChance(at('lungs', 3)) / 2) < 1e-9);
  assert.ok(eliteChance(hard) > eliteChance(at('lungs', 3)));
});

test('the choice is deterministic, never touches bosses, nests or fragments, and drones only armour', () => {
  const roll = seed => {
    const sim = at('colon', 4); sim.encounterSeed = seed;
    return Array.from({ length: 300 }, (_, i) => maybeElite(sim, sim.createEnemy('virus', 0, 0), i));
  };
  assert.deepEqual(roll(11), roll(11));
  const picks = roll(11).filter(Boolean);
  assert.ok(picks.length > 15 && picks.length < 120, `${picks.length} elites in 300 spawns`);
  for (const kind of Object.keys(ELITES)) assert.ok(picks.includes(kind), kind + ' appears');
  const sim = at('colon', 4);
  for (let i = 0; i < 200; i++) {
    const bot = sim.createEnemy('rogue-bot', 0, 0);
    const kind = maybeElite(sim, bot, i);
    if (kind) assert.equal(kind, 'armoured');
  }
  for (const flag of ['boss', 'nest', 'fragment']) {
    const enemy = Object.assign(sim.createEnemy('virus', 0, 0), { [flag]: true });
    for (let i = 0; i < 200; i++) assert.equal(maybeElite(sim, enemy, i), null);
  }
});

test('each mutation changes how the pathogen fights, scores more, and shows on the tracker', () => {
  const sim = at('lungs', 3);
  sim.phase = 'combat'; sim.enemies = []; sim.spawnCountdown = 1e9;
  const plain = sim.createEnemy('virus', 0, 0);
  const armoured = sim.createEnemy('virus', 0, 0); makeElite(armoured, 'armoured');
  assert.ok(armoured.maxHealth > plain.maxHealth * 1.8);
  // Its coat turns part of every hit.
  sim.enemies.push(armoured);
  sim.hitEnemy(armoured, 10, false, armoured, 'carbine');
  assert.ok(Math.abs(armoured.maxHealth - armoured.health - 10 * ELITES.armoured.damageScale) < 1e-9);

  const swift = sim.createEnemy('virus', 0, 0); makeElite(swift, 'swift');
  assert.equal(swift.speedScale, ELITES.swift.speed);

  const splitting = sim.createEnemy('bacillus', 0, 0); makeElite(splitting, 'splitting');
  sim.enemies.push(splitting);
  const score = sim.score;
  sim.events = [];
  sim.hitEnemy(splitting, 1e4, false, splitting, 'carbine');
  assert.equal(sim.enemies.filter(enemy => enemy.fragment).length, 2, 'it bursts into two fragments');
  assert.equal(sim.events.find(event => event.type === 'kill').elite, 'splitting');
  assert.equal(sim.score - score, Math.round(180 * ELITES.splitting.score), 'worth more score');

  sim.player.x = 0; sim.player.z = 5;
  const contact = radarSnapshot({ ...sim, enemies: [armoured] }).contacts.find(c => c.kind === 'enemy');
  assert.equal(contact.elite, 'armoured');
});

test('spawned waves field elites at about the planned rate', () => {
  let elites = 0, total = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const sim = new Simulation('intestines', { encounterSeed: seed });
    sim.start(); sim.tutorial = null; sim.wave = 3; sim.enemies = []; sim.spawnIndex = 0;
    for (let i = 0; i < 40; i++) sim.spawn('virus');
    elites += sim.enemies.filter(enemy => enemy.elite).length; total += sim.enemies.length;
  }
  const rate = elites / total, expected = eliteChance(Object.assign(new Simulation('intestines'), { wave: 3 }));
  assert.ok(Math.abs(rate - expected) < .04, `rate ${rate.toFixed(3)} vs planned ${expected.toFixed(3)}`);
});
