import { cpus } from 'node:os';
import { Simulation } from '../../dist/simulation.mjs';
import { CoopSimulation } from '../../dist/coop-simulation.mjs';
import { LEVEL_BOSSES, spawnLevelBoss } from '../../dist/level-bosses.mjs';
import { createBrainBoss, stepBrainBoss } from '../../dist/brain-boss.mjs';

const rows = [], dt = 1 / 60;
for (const players of [1, 3]) for (const area of [...Object.keys(LEVEL_BOSSES), 'heart', 'brain']) {
  const sim = players === 1 ? new Simulation(area) : new CoopSimulation(['a', 'b', 'c'].map(id => ({ id, name: id })), area);
  sim.start(); sim.enemies = sim.enemies.filter(e => e.type === 'colony');
  const boss = LEVEL_BOSSES[area] ? spawnLevelBoss(sim) : null;
  if (area === 'brain') createBrainBoss(sim);
  const samples = [], states = new Set();
  let warnings = 0, damage = 0, maximum = 0;
  for (let frame = 0; frame < 5400; frame++) {
    sim.clock += dt; sim.events = [];
    if (frame === 2700 && boss) boss.health = boss.maxHealth * .4;
    sim.activeSuits().forEach(({ player }, index) => {
      const near = boss && sim.clock % 20 < 6;
      const p = sim.ai.navigation.project(near ? { x: boss.x + 8, z: boss.z }
        : { x: Math.sin(sim.clock * .08 + index) * 23, z: Math.cos(sim.clock * .08 + index) * 25 });
      Object.assign(player, p, { health: 100 });
    });
    for (const node of sim.nodes) node.health = 100;
    const at = performance.now();
    if (sim.valve) { sim.updateValve(); sim.advanceColony(dt); }
    if (sim.boss) stepBrainBoss(sim, dt);
    sim.advanceEnemies(dt); sim.advanceProjectiles(dt);
    const elapsed = performance.now() - at;
    if (frame >= 300) samples.push(elapsed);
    const tracked = boss ?? sim.colony ?? sim.boss;
    if (tracked) {
      states.add(tracked.state ?? sim.valve?.phase);
      if (tracked.telegraph?.remaining > 0 || tracked.state === 'warning') warnings++;
    }
    damage += sim.events.filter(e => e.type === 'damage').length;
    maximum = Math.max(maximum, sim.enemies.length);
    for (const enemy of sim.enemies) if (!Number.isFinite(enemy.x + enemy.y + enemy.z + enemy.health)) throw Error(area + ': non-finite enemy state');
  }
  samples.sort((a, b) => a - b);
  rows.push({ area, players, seconds: 90, p95Ms: +samples[Math.floor(samples.length * .95)].toFixed(3),
    peakMs: +samples.at(-1).toFixed(3), maxEnemies: maximum, warnings, damageEvents: damage, states: [...states] });
  sim.ai.dispose();
}
console.log(JSON.stringify({ runtime: process.version, cpu: cpus()[0].model, rendering: false, rows }, null, 2));
