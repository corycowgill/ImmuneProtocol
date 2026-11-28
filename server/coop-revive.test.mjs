import test from 'node:test';
import assert from 'node:assert/strict';
import { CoopSimulation, REVIVE } from '../dist/coop-simulation.mjs';

const downNear = () => {
  const sim = new CoopSimulation([{ id: 'alpha' }, { id: 'bravo' }]);
  sim.start();
  sim.enemies.length = 0;
  const [alpha, bravo] = sim.players;
  bravo.health = 0;
  sim.updateSuitStatus();
  alpha.x = bravo.x + 1.2; alpha.z = bravo.z;
  return { sim, alpha, bravo };
};

test('holding the sealer on a downed teammate for five seconds revives them at a third of their health', () => {
  const { sim, alpha, bravo } = downNear();
  assert.equal(bravo.downed, true);
  const step = 1 / 30;
  for (let t = 0; t < REVIVE.seconds - .5; t += step) sim.updateRepair(step, true, sim.suitsById.get('alpha'));
  assert.equal(bravo.downed, true);
  assert.ok(bravo.reviveProgress > .85);
  const snapshot = sim.snapshotFor('alpha');
  assert.equal(snapshot.revive.id, 'bravo');
  assert.equal(snapshot.repairing, true);
  assert.equal(snapshot.repairTargetId, 'bravo');
  assert.ok(sim.snapshotFor('bravo').player.reviveProgress > .85);
  for (let t = 0; t < .6; t += step) sim.updateRepair(step, true, sim.suitsById.get('alpha'));
  assert.equal(bravo.downed, false);
  assert.equal(bravo.health, 33);
  assert.equal(bravo.reviveProgress, 0);
  assert.ok(sim.events.some(event => event.type === 'suit' && event.stage === 'revive' && event.targetId === 'bravo'));
  assert.equal(sim.attackPlayer('bravo'), bravo);
});

test('letting go or walking away loses the revive; a teammate out of reach is not revived', () => {
  const { sim, alpha, bravo } = downNear();
  const suit = sim.suitsById.get('alpha');
  for (let tick = 0; tick < 60; tick++) sim.updateRepair(1 / 30, true, suit);
  sim.updateRepair(1 / 30, false, suit);
  assert.equal(bravo.reviveProgress, 0);
  for (let tick = 0; tick < 60; tick++) sim.updateRepair(1 / 30, true, suit);
  alpha.x = bravo.x + REVIVE.radius + 1;
  sim.updateRepair(1 / 30, true, suit);
  assert.equal(bravo.reviveProgress, 0);
  assert.equal(sim.snapshotFor('alpha').revive, null);
  for (let tick = 0; tick < 200; tick++) sim.updateRepair(1 / 30, true, suit);
  assert.equal(bravo.downed, true);
});

test('the revive runs through the normal step with the repair input', () => {
  const { sim, bravo } = downNear();
  for (let tick = 0; tick < 30 * (REVIVE.seconds + .2); tick++) sim.step(1 / 30, { alpha: { repair: true } });
  assert.equal(bravo.downed, false);
  assert.equal(bravo.health, REVIVE.health);
});
