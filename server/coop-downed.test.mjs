import test from 'node:test';
import assert from 'node:assert/strict';
import { CoopSimulation, HELP } from '../dist/coop-simulation.mjs';
import { spectatePose, spectateTarget } from '../dist/spectate.mjs';
import { radarSnapshot } from '../dist/radar.mjs';

const squad = () => {
  const sim = new CoopSimulation(['a', 'b', 'c'].map(id => ({ id, name: id.toUpperCase() })), 'artery');
  sim.start();
  sim.spawnIndex = 1e6;
  sim.enemies = [];
  return sim;
};
const down = (sim, index) => { sim.players[index].health = 0; sim.step(1 / 30, {}); };

test('a downed player watches a teammate who is still up, and can switch between them', () => {
  const sim = squad();
  down(sim, 0);
  const view = { ...sim.snapshotFor('a') };
  assert.equal(spectateTarget(view, null), 'b');
  assert.equal(spectateTarget(view, 'b'), 'b', 'the view stays put without a press');
  assert.equal(spectateTarget(view, 'b', true), 'c');
  assert.equal(spectateTarget(view, 'c', true), 'b');
  // Being revived brings the view back to the suit; so does nobody being left to watch.
  assert.equal(spectateTarget({ ...view, player: { ...view.player, reviveProgress: .2 } }, 'b'), null);
  down(sim, 1); down(sim, 2);
  assert.equal(spectateTarget(sim.snapshotFor('a'), 'b'), null);
  // A suit that is up has its own view.
  assert.equal(spectateTarget(squad().snapshotFor('a'), 'b'), null);
});

test('the spectator camera sits behind and above the watched suit, looking where it looks', () => {
  for (const yaw of [0, Math.PI / 2, -2.4]) {
    const suit = { x: 4, y: 1.25, z: -6, yaw, pitch: .2 };
    const pose = spectatePose(suit, 0);
    // A suit at yaw faces (-sin, -cos); the camera is on the other side of it.
    const along = (pose.x - suit.x) * -Math.sin(yaw) + (pose.z - suit.z) * -Math.cos(yaw);
    assert.ok(along < -2.5, 'behind the suit');
    assert.ok(pose.y > suit.y);
    assert.equal(pose.yaw, yaw);
  }
  assert.ok(spectatePose({ x: 0, y: .2, z: 0, yaw: 0 }, 3).y >= 4.2, 'never under raised ground');
});

test('a downed suit calls the squad for help with Repair, and shows on their tracker', () => {
  const sim = squad();
  down(sim, 0);
  const calls = () => sim.events.filter(event => event.type === 'suit' && event.stage === 'help');
  sim.step(1 / 30, { a: { repair: true } });
  assert.equal(calls().length, 1);
  assert.equal(calls()[0].playerId, 'a');
  assert.ok(sim.players[0].helpUntil > sim.clock);
  // Holding Repair, or pressing again within the cooldown, sends nothing more.
  sim.step(1 / 30, { a: { repair: true } });
  assert.equal(calls().length, 0);
  sim.step(1 / 30, { a: {} });
  sim.step(1 / 30, { a: { repair: true } });
  assert.equal(calls().length, 0);
  for (let t = 0; t < HELP.cooldown * 30; t++) sim.step(1 / 30, { a: {} });
  sim.step(1 / 30, { a: { repair: true } });
  assert.equal(calls().length, 1, 'a new call after the cooldown');

  const tracker = radarSnapshot(sim.snapshotFor('b'), {});
  const mark = tracker.contacts.find(contact => contact.kind === 'ally' && contact.downed);
  assert.ok(mark, 'the downed suit is on a teammate\'s tracker');
  assert.equal(mark.help, true);

  // A revive clears the call.
  const medic = sim.suits[1];
  Object.assign(medic.player, { x: sim.players[0].x + 1, z: sim.players[0].z });
  for (let t = 0; t < 5.2 * 30; t++) sim.step(1 / 30, { b: { repair: true } });
  assert.equal(sim.players[0].downed, false);
  assert.equal(sim.players[0].helpUntil, 0);
});
