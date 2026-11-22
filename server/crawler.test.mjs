import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Simulation, SPECIES, speciesHabitats } from '../dist/simulation.mjs';
import { AIWorld } from '../dist/tactical-ai.mjs';
import { CRAWLER_LASER, LASER_RULES, laserRules, startBotLaser, stepRogueBot } from '../dist/rogue-bot.mjs';
import { SPECIES_AI } from '../dist/ai-profiles.mjs';
import { PATHOGENS } from '../dist/disease-guide.mjs';
import { deathRecipe } from '../dist/death-fx.mjs';

const DT = 1 / 60;
function fixture(distance) {
  const sim = new Simulation();
  sim.start(); sim.ai.dispose(); sim.obstacles = []; sim.ai = new AIWorld(sim, { seed: 5 });
  Object.assign(sim.player, { x: 0, y: 1.7, z: distance, yaw: 0, health: 100 });
  const crawler = sim.createEnemy('crawler', 0, 0); crawler.heading = 0; crawler.attackCooldown = 0; sim.enemies = [crawler];
  sim.ai.begin(DT);
  const c = sim.ai.controllers.get(crawler.id);
  for (let i = 0; i < 8; i++) { sim.clock += .1; sim.ai.rayBudget = 100; c.perceive(); }
  c.decide();
  return { sim, crawler, c };
}

test('the Crawler is a fast ground laser drone with a short, quick lock', () => {
  const spec = SPECIES.crawler;
  assert.equal(spec.behavior, 'laser');
  assert.ok(spec.speed > SPECIES['rogue-bot'].speed * 1.4, 'it outruns the Rogue Bot');
  assert.ok(spec.y < 1, 'it walks on the floor');
  assert.ok(CRAWLER_LASER.range < LASER_RULES.range / 2 && CRAWLER_LASER.windup < LASER_RULES.windup);
  assert.equal(SPECIES_AI.crawler, 'skitter');
  assert.ok(PATHOGENS.some(entry => entry.type === 'crawler'));
  assert.equal(deathRecipe({ type: 'crawler' }).style, 'crash');
  assert.ok(speciesHabitats().crawler.length >= 5);
});

test('it fires only at close range and hurts only suits', () => {
  const far = fixture(15);
  assert.equal(startBotLaser(far.sim, far.crawler, far.sim.player, 'player'), false);
  const near = fixture(6), nodes = near.sim.nodes.map(node => node.health);
  assert.equal(laserRules(near.crawler), CRAWLER_LASER);
  assert.equal(startBotLaser(near.sim, near.crawler, near.sim.player, 'player'), true);
  for (let i = 0; i < Math.ceil((CRAWLER_LASER.windup + .05) / DT); i++) {
    near.sim.clock += DT; stepRogueBot(near.sim, near.crawler, DT, SPECIES.crawler, 1, near.c);
  }
  assert.ok(near.sim.player.health < 100);
  assert.deepEqual(near.sim.nodes.map(node => node.health), nodes);
  assert.equal(startBotLaser(near.sim, near.crawler, near.sim.nodes[0], 'tissue'), false);
});

test('the Blender export has a baked body and eight hip-pivoted leg nodes', () => {
  const file = readFileSync(new URL('../dist/assets/enemies/crawler.glb', import.meta.url));
  const json = JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12)));
  assert.ok(file.length < 3 * 1024 * 1024);
  const names = json.nodes.map(node => node.name);
  assert.ok(names.includes('attack-membrane'));
  for (const side of ['L', 'R']) for (let i = 0; i < 4; i++) assert.ok(names.includes(`crawler-leg-${side}-${i}`));
  assert.ok(json.images.every(image => image.bufferView !== undefined && !image.uri));
});
