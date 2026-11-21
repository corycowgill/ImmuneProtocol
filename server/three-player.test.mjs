import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import * as THREE from '../dist/vendor/three.module.js';
import { CAMPAIGN_AREAS } from '../dist/coop-protocol.mjs';
import { CoopSimulation } from '../dist/coop-simulation.mjs';
import { createSquadView } from '../dist/squad-view.mjs';
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
async function squad(t, options = {}) {
  let simulation;
  const server = createCoopServer({ ...options, simulation: (players, area) => (simulation = new CoopSimulation(players, area)) });
  t.after(server.close);
  server.http.listen(0, '127.0.0.1'); await once(server.http, 'listening');
  const origin = 'http://127.0.0.1:' + server.http.address().port;
  const clients = await Promise.all(Array.from({ length: 3 }, () => connect(t, origin)));
  clients[0].send({ type: 'create', name: 'Alpha', suit: 'vanguard' });
  const sessions = [await clients[0].take(type('session'))];
  for (const index of [1, 2]) {
    clients[index].send({ type: 'join', code: sessions[0].code, name: ['Alpha','Bravo','Charlie'][index], suit: ['vanguard','wraith','lifeline'][index], loadout: index === 2 ? { optic: 'marksman-optic' } : undefined });
    sessions.push(await clients[index].take(type('session')));
  }
  await clients[0].take(message => phase('lobby')(message) && message.players.length === 3);
  return { origin, clients, sessions, get sim() { return simulation; } };
}

test('three seats enforce capacity and ready barriers, share third-player shots, and reconnect all seats', async t => {
  const team = await squad(t, { intermissionMs: 8000 });
  const { clients, sessions } = team;
  const fourth = await connect(t, team.origin);
  fourth.send({ type: 'join', code: sessions[0].code });
  assert.equal((await fourth.take(type('error'))).code, 'ROOM_FULL');
  for (const index of [0, 1]) clients[index].send({ type: 'ready', ready: true });
  await clients[0].take(message => phase('lobby')(message) && message.players[0].ready && message.players[1].ready);
  assert.equal(team.sim, undefined, 'two ready players must wait for the joined third player');
  clients[2].send({ type: 'ready', ready: true });
  await Promise.all(clients.map(client => client.take(phase('playing'))));
  const starts = await Promise.all(clients.map(client => client.take(type('state'))));
  assert.equal(new Set(starts.map(({ state }) => state.player.x + ',' + state.player.z)).size, 3);
  starts.forEach(({ state }, index) => {
    assert.equal(state.localPlayerId, sessions[index].id);
    assert.equal(state.players.length, 3);
    assert.deepEqual(state.players.map(player => player.suit), ['vanguard', 'wraith', 'lifeline']);
  });
  clients[2].send({ type: 'input', seq: 1, input: { fire: true, moveX: 1 } });
  const shot = message => type('state')(message) && message.events.some(event => event.type === 'shot' && event.playerId === sessions[2].id);
  const shots = await Promise.all(clients.map(client => client.take(shot)));
  assert.equal(shots[2].state.player.ammo, starts[2].state.player.ammo - 1);
  assert.equal(shots[0].state.player.ammo, starts[0].state.player.ammo);
  assert.deepEqual(shots[0].events, shots[2].events);
  clients[2].socket.terminate();
  await clients[0].take(message => phase('playing')(message) && !message.players[2].connected);
  const stopped = team.sim.clock;
  await delay(90); assert.equal(team.sim.clock, stopped);
  clients[2] = await connect(t, team.origin);
  clients[2].send({ type: 'resume', code: sessions[2].code, token: sessions[2].token });
  assert.equal((await clients[2].take(type('session'))).id, sessions[2].id);
  await clients[2].take(phase('playing'));
  assert.equal((await clients[2].take(type('state'))).state.players.length, 3);
  team.sim.spawnIndex = team.sim.missions[0].species.length;
  team.sim.enemies = []; team.sim.projectiles = []; team.sim.outro = { remaining: 0, duration: 0 };
  await Promise.all(clients.map(client => client.take(phase('intermission'))));
  const breakClock = team.sim.clock;
  for (const index of [0, 1]) clients[index].send({ type: 'ready', ready: true });
  await clients[0].take(message => phase('intermission')(message) && message.players[0].ready && message.players[1].ready);
  await delay(70); assert.equal(team.sim.clock, breakClock);
  clients[2].send({ type: 'ready', ready: true });
  await Promise.all(clients.map(client => client.take(phase('playing'))));
});

test('a three-player squad advances all ten missions and retries a loss with every loadout intact', async t => {
  const team = await squad(t);
  const { clients, sessions } = team;
  const ready = { type: 'ready', ready: true };
  async function deploy(area, index) {
    for (const client of clients) client.send(ready);
    for (let seat = 0; seat < clients.length; seat++) {
      const room = await clients[seat].take(phase('playing'));
      assert.equal(room.missionIndex, index);
      assert.deepEqual(room.players.map(player => player.id), sessions.map(session => session.id));
      const { state } = await clients[seat].take(message => type('state')(message) && message.tick === 0);
      assert.equal(state.area, area); assert.equal(state.players.length, 3);
      assert.equal(state.localPlayerId, sessions[seat].id);
      assert.equal(state.players[2].weaponLoadout.optic, 'marksman-optic');
    }
  }
  for (const [index, area] of CAMPAIGN_AREAS.entries()) {
    await deploy(area, index);
    if (area === 'heart') {
      team.sim.endMission('lost', 'tissue');
      await Promise.all(clients.map(client => client.take(message => phase('finished')(message) && message.missionIndex === index && message.players.every(player => !player.ready))));
      await deploy(area, index);
    }
    team.sim.endMission('won');
    for (const client of clients) {
      const room = await client.take(message => phase('finished')(message) && message.missionIndex === index && message.results.length === index + 1 && message.players.every(player => !player.ready));
      assert.equal(room.results.length, index + 1);
      assert.equal(room.nextArea, CAMPAIGN_AREAS[index + 1] ?? null);
    }
  }
  await deploy('artery', 0);
});

test('the third suit repairs, fires and survives when the other two are down; invalid squads are rejected', () => {
  const profiles = ['alpha', 'bravo', 'charlie'].map(id => ({ id }));
  for (const invalid of [profiles.slice(0,1), [...profiles, { id: 'delta' }], [profiles[0],profiles[1],profiles[0]]]) {
    assert.throws(() => new CoopSimulation(invalid), /two or three distinct/);
  }
  const sim = new CoopSimulation(profiles); sim.start();
  const third = sim.players[2], node = sim.nodes[2];
  third.x = node.x; third.z = node.z; node.health = 50;
  sim.players[0].health = sim.players[1].health = 0;
  for (let tick=0;tick<45;tick++) sim.step(1/30, { charlie: { repair: true } });
  assert.ok(node.health > 50); assert.equal(sim.suitsDefeated(), false);
  assert.equal(sim.chooseAttackPlayer({ x: third.x, z: third.z }).id, 'charlie');
  sim.step(1/30, { charlie: { fire: true } });
  assert.ok(sim.events.some(event => event.type === 'shot' && event.playerId === 'charlie'));
  assert.equal(sim.snapshotFor('charlie').players.filter(player => player.downed).length, 2);
});

test('both remote rigs render and muzzle flashes route to the correct teammate from any local seat', () => {
  const rigs = [];
  const view = createSquadView(null, () => {
    let actor;
    const rig = { root: new THREE.Group(), update(player, ground) { actor=player; this.player=player; this.ground=ground; }, hide() { actor=null; }, fire(id) { return actor?.id === id; } };
    rigs.push(rig); return rig;
  });
  const players = ['a','b','c'].map((id,index) => ({ id, x: index, z: index*2 }));
  for (const local of players) {
    view.update(players, local.id, (x,z)=>x+z, 0, false);
    assert.deepEqual(rigs.map(rig=>rig.player.id), players.filter(player=>player.id!==local.id).map(player=>player.id));
    assert.equal(view.fire(local.id, false), false);
    for(const remote of players.filter(player=>player.id!==local.id)) assert.equal(view.fire(remote.id,false),true);
  }
  view.update(players.slice(0,2),'a',()=>0,0,false);
  assert.equal(rigs[1].player, undefined); assert.equal(view.fire('c',false),false);
  view.hide(); assert.equal(view.fire('b',false),false);
});
