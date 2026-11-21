import { cpus } from 'node:os';
import { Simulation, SPECIES } from '../../dist/simulation.mjs';
import { CAMPAIGN_AREAS } from '../../dist/coop-protocol.mjs';

const frames = Math.max(60, Number(process.env.AI_FRAMES) || 1800);
const types = Object.keys(SPECIES).filter(t => t !== 'colony');
const rows = [];
const percentile = (values, fraction) => values[Math.min(values.length - 1, Math.floor(values.length * fraction))];
for (const count of [20, 40]) for (const area of CAMPAIGN_AREAS) {
  const at = performance.now();
  const sim = new Simulation(area, { ai: { seed: 2718 } });
  sim.start(); sim.enemies = []; sim.projectiles = [];
  const setupMs = performance.now() - at;
  for (let i = 0; i < count; i++) {
    const angle = i * 2.39996, radius = 18 + i % 5 * 3;
    const p = sim.ai.navigation.project({ x: Math.sin(angle) * radius, z: Math.cos(angle) * radius });
    const enemy = sim.createEnemy(types[i % types.length], p.x, p.z, sim.nodes[i % sim.nodes.length]);
    if (i % 4 === 0) enemy.health *= .3;
    sim.enemies.push(enemy);
  }
  const costs = [], whole = [];
  let maxRays = 0, maxPaths = 0;
  const actions = new Set();
  // Includes moving targets, hearing, colony updates, defensive behavior and ranged attacks.
  // No renderer, spawner or boss scripts: fixed ordinary-enemy population for fair comparisons.
  for (let frame = 0; frame < frames + 300; frame++) {
    sim.clock += 1 / 60; sim.events = [];
    sim.player.health = 100;
    const p = sim.ai.navigation.project({ x: Math.sin(sim.clock * .14) * 22, z: Math.cos(sim.clock * .14) * 24 });
    Object.assign(sim.player, p);
    for (const node of sim.nodes) node.health = 100;
    if (frame % 15 === 0) sim.ai.emit('gunfire', sim.player, { key: 'player:solo' });
    if (frame % 180 === 0) sim.ai.emit('explosion', sim.player, { radius: 40 });
    if (frame % 120 === 0) for (const enemy of sim.enemies) if (enemy.health < enemy.maxHealth * .5) sim.ai.damage(enemy, sim.player);
    const start = performance.now();
    sim.advanceEnemies(1 / 60); sim.advanceProjectiles(1 / 60);
    if (frame >= 300) {
      costs.push(sim.ai.telemetry.lastMs); whole.push(performance.now() - start);
      maxRays = Math.max(maxRays, sim.ai.telemetry.rays); maxPaths = Math.max(maxPaths, sim.ai.telemetry.paths);
      for (const c of sim.ai.controllers.values()) actions.add(c.action);
    }
  }
  costs.sort((a, b) => a - b); whole.sort((a, b) => a - b);
  const round = value => +value.toFixed(3);
  rows.push({ area, count, frames, setupMs: round(setupMs), aiMedianMs: round(percentile(costs, .5)),
    aiP95Ms: round(percentile(costs, .95)), aiPeakMs: round(costs.at(-1)), wholeP95Ms: round(percentile(whole, .95)),
    maxRays, maxPaths, searches: sim.ai.navigation.searches, failedSearches: sim.ai.navigation.failures, actions: [...actions].sort() });
  sim.ai.dispose();
}
console.log(JSON.stringify({ runtime: process.version, platform: process.platform, cpu: cpus()[0].model,
  timestep: 1 / 60, warmupFrames: 300, rendering: false, rows }, null, 2));
