import { cpus } from 'node:os';
import { Simulation } from '../../dist/simulation.mjs';
import { CoopSimulation } from '../../dist/coop-simulation.mjs';
import { CAMPAIGN_AREAS } from '../../dist/coop-protocol.mjs';
import { stepEncounters } from '../../dist/encounters.mjs';

const rows = [], dt = 1 / 60;
for (const players of [1, 3]) for (const area of CAMPAIGN_AREAS.filter(a => !['heart', 'junction'].includes(a))) {
  const sim = players === 1 ? new Simulation(area, { encounterSeed: 31 })
    : new CoopSimulation(['a', 'b', 'c'].map(id => ({ id, name: id })), area, { encounterSeed: 31 });
  sim.start();
  const samples = [], patterns = new Set(); let packs = 0, spawns = 0, warnings = 0, setupMs = 0;
  for (let wave = 1; wave <= sim.waves; wave++) {
    sim.enemies = []; sim.wave = wave - 1;
    const at = performance.now(); sim.beginWave(); setupMs = Math.max(setupMs, performance.now() - at);
    const plan = sim.encounterPlan;
    if (!plan) continue;
    plan.packs.forEach(p => patterns.add(p.pattern)); packs += plan.packs.length;
    const born = new Map();
    for (let frame = 0; frame < 360 / dt && sim.spawnIndex < plan.slots.length; frame++) {
      sim.clock += dt; sim.events = [];
      const start = performance.now(); stepEncounters(sim, dt); samples.push(performance.now() - start);
      warnings += sim.events.filter(e => e.type === 'encounter' && e.stage === 'warning').length;
      for (const e of sim.enemies) if (!born.has(e.id)) { born.set(e.id, sim.clock); spawns++; }
      // Fixed ten-second entity lifetimes exercise live group counts/clear handling.
      sim.enemies = sim.enemies.filter(e => sim.clock - born.get(e.id) < 10);
    }
    if (sim.spawnIndex !== plan.slots.length) throw Error(`${area} wave ${wave}: stalled arrivals`);
  }
  samples.sort((a, b) => a - b);
  rows.push({ area, players, packs, spawns, warnings, patterns: [...patterns].sort(),
    setupPeakMs: +setupMs.toFixed(3), schedulerP95Ms: +samples[Math.floor(samples.length * .95)].toFixed(3),
    schedulerPeakMs: +samples.at(-1).toFixed(3) });
  sim.ai.dispose();
}
console.log(JSON.stringify({ runtime: process.version, cpu: cpus()[0].model, seed: 31, rendering: false,
  note: 'Scheduler only; all ordinary waves, real arena geometry, fixed suit positions and ten-second enemy lifetimes. No combat AI/rendering.', rows }, null, 2));
