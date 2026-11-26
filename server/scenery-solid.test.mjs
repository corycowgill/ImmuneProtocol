import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation, suitScenery, JUNCTION_INLETS, ARENA } from '../dist/simulation.mjs';
import { arteryVesselFootprints } from '../dist/artery-vessels.mjs';
import { planFieldObjectives, stepFieldObjectives } from '../dist/field-objectives.mjs';

const DT = 1 / 60;
const inside = (circles, x, z, margin = 0) => circles.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + margin);

test('the artery\'s great vessels are solid where they come down to the floor', () => {
  const circles = suitScenery('artery');
  assert.ok(circles.length > 20, 'the vessel bases become a chain of footprints');
  assert.deepEqual(circles, arteryVesselFootprints().map(([x, z, r]) => [x, z, r]));
  assert.deepEqual(suitScenery('lungs'), []);

  // Walk straight at the thick trunk on the right of the chamber.
  const sim = new Simulation('artery', { ai: { seed: 2 } });
  sim.start(); sim.tutorial = null; sim.phase = 'combat'; sim.enemies = []; sim.spawnCountdown = 1e9;
  const [x, z, r] = circles.reduce((big, circle) => circle[2] > big[2] ? circle : big);
  Object.assign(sim.player, { x: x - r - 5, z, yaw: -Math.PI / 2, pitch: 0 });
  for (let i = 0; i < 150; i++) { sim.events = []; sim.clock += DT; sim.movePlayer(DT, { moveZ: 1, sprint: true }); }
  assert.ok(!inside(circles, sim.player.x, sim.player.z, -1e-6), `the suit stood at ${sim.player.x.toFixed(2)}, ${sim.player.z.toFixed(2)}`);
  assert.ok(sim.player.x < x, 'it stopped on the near side');
});

test('nothing a suit must reach starts inside the vessels', () => {
  const circles = suitScenery('artery');
  const sim = new Simulation('artery', { ai: { seed: 3 } });
  sim.start();
  assert.ok(!inside(circles, sim.player.x, sim.player.z, .5), 'the insertion point is clear');
  for (const node of sim.nodes) assert.ok(!inside(circles, node.x, node.z, 5.4), `${node.id} can be sealed from every side`);
  for (const inlet of Object.values(JUNCTION_INLETS)) assert.ok(!inside(circles, inlet.x, inlet.z), 'inlets are clear');

  // Antibody caches over a whole campaign's worth of artery waves land clear of the vessels.
  let placed = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const run = new Simulation('artery', { ai: { seed }, encounterSeed: seed });
    run.start(); run.tutorial = null;
    for (let wave = 1; wave <= run.waves; wave++) {
      run.wave = wave;
      planFieldObjectives(run);
      if (!run.field) continue;
      // Every objective of the wave is due once its whole roster has arrived.
      run.phase = 'combat';
      run.spawnIndex = run.missions[wave - 1].species.length;
      stepFieldObjectives(run, DT, ARENA);
      placed += run.pickups.length + (run.field?.sites?.length ?? 0);
      for (const site of [...run.pickups, ...(run.field?.sites ?? [])]) assert.ok(!inside(circles, site.x, site.z, 1), `site at ${site.x.toFixed(1)}, ${site.z.toFixed(1)}`);
    }
  }
  assert.ok(placed > 0, 'some field objectives were placed');
});
