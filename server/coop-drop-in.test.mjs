import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { CoopSimulation } from '../dist/coop-simulation.mjs';
import { createCoopServer } from './index.mjs';

const type = value => message => message.type === value;
const phase = value => message => message.type === 'room' && message.phase === value;
async function connect(t, origin) {
  const socket = new WebSocket(origin.replace(/^http/, 'ws') + '/coop', { origin });
  t.after(() => socket.terminate());
  const inbox = [], waiters = [];
  socket.on('message', data => {
    const message = JSON.parse(data);
    const index = waiters.findIndex(waiter => waiter.matches(message));
    if (index < 0) inbox.push(message);
    else waiters.splice(index, 1)[0].resolve(message);
  });
  await once(socket, 'open');
  return { socket, send: message => socket.send(JSON.stringify(message)), take(matches) {
    const index = inbox.findIndex(matches);
    if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for squad message')), 3000);
      waiters.push({ matches, resolve: message => { clearTimeout(timer); resolve(message); } });
    });
  } };
}

// A pair in a room, plus a third socket ready to join it.
async function pair(t) {
  let simulation;
  const server = createCoopServer({ simulation: (players, area) => (simulation = new CoopSimulation(players, area)) });
  t.after(server.close);
  server.http.listen(0, '127.0.0.1'); await once(server.http, 'listening');
  const origin = 'http://127.0.0.1:' + server.http.address().port;
  const [host, guest, late] = await Promise.all([0, 1, 2].map(() => connect(t, origin)));
  host.send({ type: 'create', name: 'Alpha' });
  const hostSession = await host.take(type('session'));
  guest.send({ type: 'join', code: hostSession.code, name: 'Bravo' });
  const guestSession = await guest.take(type('session'));
  await host.take(message => phase('lobby')(message) && message.players.length === 2);
  const deploy = async () => {
    host.send({ type: 'ready', ready: true });
    guest.send({ type: 'ready', ready: true });
    return host.take(phase('playing'));
  };
  return { host, guest, late, hostSession, guestSession, deploy, get sim() { return simulation; } };
}

test('a third player drops into a match in progress with a fresh suit', async t => {
  const squad = await pair(t);
  await squad.deploy();
  await squad.host.take(type('state'));
  squad.sim.players[0].health = 40;
  squad.late.send({ type: 'join', code: squad.hostSession.code, name: 'Charlie', suit: 'lifeline', loadout: { optic: 'marksman-optic' } });
  const session = await squad.late.take(type('session'));
  const room = await squad.late.take(phase('playing'));
  assert.equal(room.players.length, 3);
  // The newcomer gets a state straight away, so their game can launch without waiting a tick.
  const first = await squad.late.take(type('state'));
  assert.equal(first.state.localPlayerId, session.id);
  assert.equal(first.state.player.health, 100);
  assert.equal(first.state.players.length, 3);
  assert.equal(first.state.weaponLoadout.optic, 'marksman-optic');
  assert.ok(first.state.ability.grenades > 0, 'a mid-wave joiner has throwables');
  const joined = await squad.host.take(message => type('state')(message) && message.events.some(event => event.stage === 'joined'));
  assert.equal(joined.events.find(event => event.stage === 'joined').name, 'Charlie');
  assert.equal(squad.sim.players[0].health, 40, 'the squad plays on untouched');
  // Three seats is still the limit.
  const fourth = await connect(t, 'http://127.0.0.1:' + new URL(squad.host.socket.url).port);
  fourth.send({ type: 'join', code: squad.hostSession.code, name: 'Delta' });
  assert.equal((await fourth.take(type('error'))).code, 'ROOM_FULL');
});

test('a player joins at the checkpoint between missions and deploys with the squad', async t => {
  const squad = await pair(t);
  await squad.deploy();
  await squad.host.take(type('state'));
  squad.sim.endMission('won');
  await squad.host.take(phase('finished'));
  squad.late.send({ type: 'join', code: squad.hostSession.code, name: 'Charlie' });
  await squad.late.take(type('session'));
  assert.equal((await squad.late.take(phase('finished'))).players.length, 3);
  for (const client of [squad.host, squad.guest, squad.late]) client.send({ type: 'ready', ready: true });
  const next = await squad.late.take(phase('playing'));
  assert.equal(next.missionIndex, 1);
  assert.equal((await squad.late.take(message => type('state')(message) && message.tick === 0)).state.players.length, 3);
});

test('the host picks Endless, its arena and the difficulty; others cannot', async t => {
  const squad = await pair(t);
  squad.guest.send({ type: 'settings', mode: 'endless', difficulty: 'hard' });
  squad.host.send({ type: 'settings', mode: 'endless', arena: 'lungs', difficulty: 'easy' });
  const room = await squad.guest.take(message => phase('lobby')(message) && message.settings.mode === 'endless');
  assert.deepEqual(room.settings, { mode: 'endless', difficulty: 'easy', arena: 'lungs' });
  // Bad values keep what was there.
  squad.host.send({ type: 'settings', mode: 'deathmatch', arena: 'brain', difficulty: 'nightmare' });
  squad.host.send({ type: 'ready', ready: true });
  squad.guest.send({ type: 'ready', ready: true });
  await squad.host.take(phase('playing'));
  const { state } = await squad.host.take(type('state'));
  assert.equal(state.area, 'lungs');
  assert.equal(state.difficulty, 'easy');
  assert.deepEqual(state.endless, { wave: 1 });
  assert.equal(squad.sim.captureCheckpoint(), null, 'Endless has no checkpoints');
  // Easy gives a turret suit two placements, as in solo.
  assert.ok(squad.sim.suits.every(suit => suit.companion !== 'turret' || suit.turretCharges === 2));
  // Settings are locked once deployed.
  squad.host.send({ type: 'settings', difficulty: 'hard' });
  // An Endless loss ends in the report; readying up runs the same arena again from wave 1.
  squad.sim.wave = 4;
  squad.sim.endMission('lost');
  const over = await squad.host.take(phase('finished'));
  assert.equal(over.settings.difficulty, 'easy');
  assert.equal(over.nextArea, undefined);
  squad.host.send({ type: 'ready', ready: true });
  squad.guest.send({ type: 'ready', ready: true });
  const again = await squad.host.take(phase('playing'));
  assert.equal(again.missionIndex, 0);
  const rerun = await squad.host.take(message => type('state')(message) && message.tick === 0);
  assert.equal(rerun.state.area, 'lungs');
  assert.equal(rerun.state.wave, 1);
});

test('a campaign room on Hard reshapes its waves like solo Hard', async t => {
  const squad = await pair(t);
  squad.host.send({ type: 'settings', difficulty: 'hard' });
  await squad.guest.take(message => phase('lobby')(message) && message.settings.difficulty === 'hard');
  await squad.deploy();
  const { state } = await squad.host.take(type('state'));
  assert.equal(state.difficulty, 'hard');
  assert.equal(state.endless, null);
  const medium = new CoopSimulation([{ id: 'a' }, { id: 'b' }], 'artery');
  assert.ok(squad.sim.missions[0].species.length > medium.missions[0].species.length, 'Hard adds pathogens');
});
