import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation, TISSUE_SOLID_RADIUS } from '../dist/simulation.mjs';
import { CAMPAIGN_AREAS } from '../dist/coop-protocol.mjs';

const DT = 1 / 60;

function field(area = 'artery') {
  const sim = new Simulation(area, { ai: { seed: 5 } });
  sim.start();
  sim.tutorial = null;
  sim.phase = 'combat';
  sim.enemies = [];
  sim.spawnCountdown = 1e9;
  return sim;
}

// Stands the suit `distance` metres south of a node, facing it (yaw 0 looks toward -z).
function facing(sim, node, distance) {
  Object.assign(sim.player, { x: node.x, z: node.z + distance, yaw: 0, pitch: 0 });
}

const walk = (sim, seconds, input) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) { sim.events = []; sim.clock += DT; sim.movePlayer(DT, input); sim.actSuits?.(DT, input); }
};
const distanceTo = (sim, node) => Math.hypot(sim.player.x - node.x, sim.player.z - node.z);

test('a suit walking into a tissue node stops at its body, in every arena', () => {
  for (const area of CAMPAIGN_AREAS) {
    const sim = field(area);
    for (const node of sim.nodes) {
      facing(sim, node, 6);
      walk(sim, 2.5, { moveZ: 1, sprint: true });
      // Scenery or raised ground may stop the suit first; it must never reach the node's body.
      assert.ok(distanceTo(sim, node) >= TISSUE_SOLID_RADIUS - 1e-6, `${area} ${node.id}: reached ${distanceTo(sim, node).toFixed(2)} m`);
    }
  }
});

test('a dash cannot carry a suit through a node, and a suit placed inside one is pushed out', () => {
  const sim = field();
  const node = sim.nodes[0];
  facing(sim, node, 3);
  walk(sim, .4, { dash: true, moveZ: 1 });
  assert.ok(sim.player.z > node.z, 'the suit is still on the near side');
  assert.ok(distanceTo(sim, node) >= TISSUE_SOLID_RADIUS - 1e-6);

  Object.assign(sim.player, { x: node.x + .3, z: node.z });
  walk(sim, DT, {});
  assert.ok(Math.abs(distanceTo(sim, node) - TISSUE_SOLID_RADIUS) < 1e-6);
  assert.ok(sim.player.x > node.x, 'pushed out on the side it stood');
});

test('a suit can still seal a node from where it stops, and nothing starts inside one', () => {
  const sim = field();
  const node = sim.nodes[0];
  node.health = 50;
  facing(sim, node, 4);
  walk(sim, 1, { moveZ: 1 });
  walk(sim, 2, { repair: true });
  assert.ok(node.health > 50, 'the sealer reaches the node from its edge');

  for (const area of CAMPAIGN_AREAS) {
    const fresh = field(area);
    for (const node of fresh.nodes) {
      assert.ok(distanceTo(fresh, node) > TISSUE_SOLID_RADIUS, `${area} starts the suit inside ${node.id}`);
    }
  }
});

test('nodes the arena is not showing are not solid', () => {
  const training = field();
  training.tutorial = 'observe';
  const second = training.nodes[1];
  Object.assign(training.player, { x: second.x, z: second.z + .2 });
  walk(training, DT, {});
  assert.ok(distanceTo(training, second) < 1, 'only the first node stands during training');

  const airway = field('lungs');
  airway.airway = { active: true };
  const node = airway.nodes[0];
  Object.assign(airway.player, { x: node.x, z: node.z + .2 });
  airway.keepOffNodes(airway.player);
  assert.ok(distanceTo(airway, node) < 1, 'nodes are hidden during the airway objective');
});
