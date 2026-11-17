import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import WebSocket from 'ws';
import { COOP_SUITS, DEFAULT_COOP_SUIT } from '../dist/coop-protocol.mjs';
import { CoopSimulation } from '../dist/coop-simulation.mjs';
import { SUIT_MODELS } from '../dist/suit-models.mjs';
import { createCoopServer } from './index.mjs';

async function connect(t, origin) {
  const socket = new WebSocket(origin.replace(/^http/, 'ws') + '/coop', { origin });
  t.after(() => socket.terminate());
  const inbox = [];
  const waiting = [];
  socket.on('message', payload => {
    const message = JSON.parse(payload.toString());
    const index = waiting.findIndex(entry => entry.matches(message));
    if (index >= 0) waiting.splice(index, 1)[0].resolve(message);
    else inbox.push(message);
  });
  await once(socket, 'open');
  return {
    send: message => socket.send(JSON.stringify(message)),
    take(matches) {
      const index = inbox.findIndex(matches);
      if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const entry = { matches, resolve };
        waiting.push(entry);
        setTimeout(() => {
          if (waiting.includes(entry)) reject(new Error('Timed out waiting for a co-op message'));
        }, 3000);
      });
    },
  };
}

const lobbyWith = check => message => message.type === 'room' && message.phase === 'lobby' && check(message.players);

test('every selectable suit has a model for each rig joint', () => {
  const joints = ['hips', 'upper', 'head', ...['thigh', 'shin', 'boot', 'bicep', 'forearm', 'glove'].flatMap(part => [part + '_L', part + '_R'])];
  assert.ok(COOP_SUITS.includes(DEFAULT_COOP_SUIT));
  for (const id of COOP_SUITS) {
    const { materials, parts } = SUIT_MODELS[id];
    assert.deepEqual(Object.keys(parts).sort(), [...joints].sort(), id);
    for (const items of Object.values(parts)) {
      for (const [kind, material] of items) {
        assert.ok(['box', 'ball', 'cyl', 'torus'].includes(kind));
        assert.ok(Object.hasOwn(materials, material), id + ' uses ' + material);
      }
    }
  }
});

test('players pick suits in the lobby, see each other\'s choice, and deploy wearing them', async t => {
  let simulation;
  const server = createCoopServer({
    simulation: (players, area) => { simulation = new CoopSimulation(players, area); return simulation; },
  });
  t.after(server.close);
  server.http.listen(0, '127.0.0.1');
  await once(server.http, 'listening');
  const origin = 'http://127.0.0.1:' + server.http.address().port;
  const host = await connect(t, origin);
  const guest = await connect(t, origin);

  host.send({ type: 'create', name: 'Alpha', suit: 'wraith' });
  const { code } = await host.take(message => message.type === 'session');
  guest.send({ type: 'join', code, name: 'Bravo', suit: 'not-a-suit' });
  await guest.take(message => message.type === 'session');
  const lobby = await host.take(lobbyWith(players => players.length === 2));
  assert.deepEqual(lobby.players.map(player => player.suit), ['wraith', DEFAULT_COOP_SUIT]);
  assert.ok(lobby.players.every(player => typeof player.weaponLoadout === 'object'));

  guest.send({ type: 'suit', suit: 'bathysphere' });
  const changed = await host.take(lobbyWith(players => players[1]?.suit === 'bathysphere'));
  assert.equal(changed.players[0].suit, 'wraith');
  guest.send({ type: 'suit', suit: 'unknown' });
  host.send({ type: 'suit', suit: 'lifeline' });
  const both = await guest.take(lobbyWith(players => players[0].suit === 'lifeline'));
  assert.equal(both.players[1].suit, 'bathysphere');

  host.send({ type: 'ready', ready: true });
  guest.send({ type: 'ready', ready: true });
  await host.take(message => message.type === 'room' && message.phase === 'playing');
  const { state } = await host.take(message => message.type === 'state');
  assert.deepEqual(state.players.map(player => player.suit), ['lifeline', 'bathysphere']);
  host.send({ type: 'suit', suit: 'vanguard' });
  await delay(60);
  assert.equal(simulation.players[0].suit, 'lifeline');
});
