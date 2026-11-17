import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import WebSocket from 'ws';
import { hitBrainBoss } from '../dist/brain-boss.mjs';
import { CAMPAIGN_AREAS, COOP_CODE_ALPHABET, COOP_CODE_LENGTH } from '../dist/coop-protocol.mjs';
import { CoopSimulation } from '../dist/coop-simulation.mjs';
import { JUNCTION_GASH_SITES } from '../dist/simulation.mjs';
import { createCoopServer } from './index.mjs';

async function localServer(t, options) {
  const server = createCoopServer(options);
  t.after(server.close);
  server.http.listen(0, '127.0.0.1');
  await once(server.http, 'listening');
  return 'http://127.0.0.1:' + server.http.address().port;
}

async function connect(t, httpOrigin) {
  const url = new URL('/coop', httpOrigin);
  url.protocol = 'ws:';
  const socket = new WebSocket(url, { origin: httpOrigin });
  t.after(() => socket.terminate());
  const inbox = [];
  let consumer;
  socket.on('message', payload => {
    const message = JSON.parse(payload.toString());
    if (consumer?.matches(message)) consumer.resolve(message);
    else inbox.push(message);
  });
  await once(socket, 'open');
  return {
    socket,
    send: message => socket.send(JSON.stringify(message)),
    take(matches) {
      const index = inbox.findIndex(matches);
      if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          consumer = null;
          reject(new Error('Timed out waiting for co-op message. Pending messages: ' + inbox.map(item => item.type).join(', ')));
        }, 3000);
        consumer = { matches, resolve: message => {
          clearTimeout(timeout);
          consumer = null;
          resolve(message);
        } };
      });
    },
  };
}

const tagged = type => message => message.type === type;
const roomPhase = phase => message => message.type === 'room' && message.phase === phase;

test('serves the game, health check and demo ranges on the same host', async t => {
  const origin = await localServer(t);
  const health = await fetch(origin + '/healthz');
  assert.deepEqual(await health.json(), { ok: true, service: 'immune-protocol-coop', protocol: 1 });
  const game = await fetch(origin);
  assert.match(game.headers.get('content-type'), /^text\/html/);
  assert.match(await game.text(), /Immune Protocol/);
  const cached = await fetch(origin, { headers: { 'if-none-match': game.headers.get('etag') } });
  assert.equal(cached.status, 304);
  const demo = await fetch(origin + '/demo/immune-protocol-demo.mp4', { headers: { Range: 'bytes=0-31' } });
  assert.equal(demo.status, 206);
  assert.match(demo.headers.get('content-range'), /^bytes 0-31\//);
  assert.equal((await demo.arrayBuffer()).byteLength, 32);
  const escaped = await fetch(origin + '/..%2fpackage.json');
  assert.equal(escaped.status, 404);
  const forbidden = new WebSocket(new URL('/coop', origin.replace(/^http/, 'ws')), { origin: 'https://elsewhere.example' });
  t.after(() => forbidden.terminate());
  const [denial] = await once(forbidden, 'error');
  assert.match(denial.message, /403/);
});

test('shares authoritative combat, reload-safe reconnect, and the team intermission', async t => {
  let simulation;
  const origin = await localServer(t, {
    simulation: players => { simulation = new CoopSimulation(players); return simulation; },
    intermissionMs: 4000,
  });
  const host = await connect(t, origin);
  const guest = await connect(t, origin);
  const extra = await connect(t, origin);
  host.send({ type: 'create', name: '  Alpha  ', loadout: { optic: 'marksman-optic' } });
  const hostSession = await host.take(tagged('session'));
  assert.equal(hostSession.code.length, COOP_CODE_LENGTH);
  assert.ok([...hostSession.code].every(char => COOP_CODE_ALPHABET.includes(char)));
  guest.send({ type: 'join', code: hostSession.code.toLowerCase(), name: 'Bravo' });
  const guestSession = await guest.take(tagged('session'));
  assert.notEqual(guestSession.id, hostSession.id);
  assert.notEqual(guestSession.token, hostSession.token);
  const lobby = await host.take(message => roomPhase('lobby')(message) && message.players.length === 2);
  assert.equal(lobby.ownerId, hostSession.id);
  assert.deepEqual(lobby.players.map(player => [player.name, player.ready, player.connected]), [
    ['Alpha', false, true], ['Bravo', false, true],
  ]);
  assert.doesNotMatch(JSON.stringify(lobby), new RegExp(hostSession.token));
  extra.send({ type: 'join', code: guestSession.code });
  assert.equal((await extra.take(tagged('error'))).code, 'ROOM_FULL');
  extra.send({ type: 'resume', code: guestSession.code, token: 'invalid' });
  assert.equal((await extra.take(tagged('error'))).code, 'SESSION_EXPIRED');

  host.send({ type: 'ready', ready: true });
  await host.take(message => roomPhase('lobby')(message) && message.players[0].ready);
  assert.equal(simulation, undefined);
  guest.send({ type: 'ready', ready: true });
  await Promise.all([host.take(roomPhase('playing')), guest.take(roomPhase('playing'))]);
  const [firstHost, firstGuest] = await Promise.all([host.take(tagged('state')), guest.take(tagged('state'))]);
  assert.equal(firstHost.tick, 0);
  assert.equal(firstHost.state.localPlayerId, hostSession.id);
  assert.equal(firstGuest.state.localPlayerId, guestSession.id);
  assert.notEqual(firstHost.state.player.x, firstGuest.state.player.x);
  assert.equal(firstHost.state.weaponLoadout.optic, 'marksman-optic');
  assert.deepEqual(firstHost.state.nodes, firstGuest.state.nodes);
  assert.equal(firstHost.state.events, undefined);
  assert.deepEqual(firstHost.events, firstGuest.events);
  assert.ok(firstHost.events.some(event => event.type === 'wave' && event.stage === 'start'));

  host.send({ type: 'input', seq: 1, input: { moveX: 1, fire: true } });
  host.send({ type: 'input', seq: 2, input: { moveX: 1, fire: false } });
  const shot = message => tagged('state')(message) && message.events.some(event => event.type === 'shot' && event.playerId === hostSession.id);
  const [fired, sawShot] = await Promise.all([host.take(shot), guest.take(shot)]);
  assert.equal(fired.state.player.ammo, firstHost.state.player.ammo - 1);
  assert.equal(sawShot.state.player.ammo, firstGuest.state.player.ammo);
  assert.equal(fired.events.find(event => event.type === 'shot').sequence, sawShot.events.find(event => event.type === 'shot').sequence);
  assert.ok(fired.state.player.x > firstHost.state.player.x);
  host.send({ type: 'input', seq: 3, input: { fire: true } });
  await host.take(message => tagged('state')(message) && message.ack === 3);

  guest.socket.terminate();
  const paused = await host.take(message => roomPhase('playing')(message) && !message.players[1].connected);
  assert.ok(paused.reconnectDeadline > Date.now());
  const suspendedClock = simulation.clock;
  const suspendedAmmo = simulation.snapshotFor(hostSession.id).player.ammo;
  await delay(100);
  assert.equal(simulation.clock, suspendedClock);
  const connectedAgain = await connect(t, origin);
  connectedAgain.send({ type: 'resume', code: guestSession.code, token: guestSession.token });
  const resumed = await connectedAgain.take(tagged('session'));
  assert.equal(resumed.id, guestSession.id);
  await connectedAgain.take(roomPhase('playing'));
  assert.deepEqual(await host.take(message => roomPhase('playing')(message) && message.reconnectDeadline === undefined && message.players.every(player => player.connected)), {
    type: 'room', code: hostSession.code, phase: 'playing', ownerId: hostSession.id,
    players: lobby.players, missionIndex: 0, results: [],
  });
  const resumeView = await connectedAgain.take(tagged('state'));
  assert.equal(resumeView.state.player.ammo, sawShot.state.player.ammo);
  assert.equal(resumeView.ack, 0);
  assert.deepEqual(resumeView.events, []);
  await delay(180);
  assert.equal(simulation.snapshotFor(hostSession.id).player.ammo, suspendedAmmo);

  simulation.spawnIndex = simulation.missions[0].species.length;
  simulation.enemies = [];
  simulation.projectiles = [];
  const armory = await host.take(roomPhase('intermission'));
  await connectedAgain.take(roomPhase('intermission'));
  assert.ok(armory.deadline > Date.now());
  const breakClock = simulation.clock;
  host.send({ type: 'ready', ready: true, loadout: { magazine: 'extended-magazine' } });
  await host.take(message => roomPhase('intermission')(message) && message.players[0].ready);
  const extended = await host.take(message => tagged('state')(message) && message.state.weaponLoadout.magazine === 'extended-magazine');
  assert.ok(extended.state.magazineSize > firstHost.state.magazineSize);
  await delay(90);
  assert.equal(simulation.clock, breakClock);
  connectedAgain.send({ type: 'ready', ready: true });
  await connectedAgain.take(roomPhase('playing'));
  const continuing = await host.take(message => roomPhase('playing')(message) && !message.players[0].ready);
  assert.equal(continuing.deadline, undefined);
  assert.ok((await host.take(message => tagged('state')(message) && message.state.clock > breakClock)).tick > 0);

  connectedAgain.send({ type: 'leave' });
  assert.equal((await host.take(tagged('error'))).code, 'PARTNER_LEFT');
  host.send({ type: 'create' });
  assert.notEqual((await host.take(tagged('session'))).code, hostSession.code);
});

test('ends an active room when a detached seat runs out of reconnect time', async t => {
  const origin = await localServer(t, { graceMs: 100 });
  const first = await connect(t, origin);
  const second = await connect(t, origin);
  first.send({ type: 'create' });
  const firstSession = await first.take(tagged('session'));
  second.send({ type: 'join', code: firstSession.code });
  const formerGuest = await second.take(tagged('session'));
  first.send({ type: 'ready', ready: true });
  second.send({ type: 'ready', ready: true });
  await first.take(roomPhase('playing'));
  second.socket.terminate();
  assert.equal((await first.take(tagged('error'))).code, 'PARTNER_LEFT');
  const returning = await connect(t, origin);
  returning.send({ type: 'resume', code: formerGuest.code, token: formerGuest.token });
  assert.equal((await returning.take(tagged('error'))).code, 'SESSION_EXPIRED');
});

test('both seats advance through the full campaign, retry a mission, and restart together', async t => {
  let sim;
  const origin = await localServer(t, {
    simulation(players, area) {
      sim = new CoopSimulation(players, area);
      return sim;
    },
  });
  const host = await connect(t, origin);
  let guest = await connect(t, origin);
  host.send({ type: 'create', loadout: { optic: 'marksman-optic' } });
  const { code, id: hostId } = await host.take(tagged('session'));
  guest.send({ type: 'join', code });
  const { id: guestId, token } = await guest.take(tagged('session'));
  const ready = { type: 'ready', ready: true };
  const checkpoint = message => roomPhase('finished')(message) && message.players.every(player => !player.ready);

  async function deploy(area, index) {
    host.send(ready);
    await host.take(message => message.type === 'room' && message.players[0].ready && !message.players[1].ready);
    guest.send(ready);
    for (const side of [host, guest]) {
      const room = await side.take(roomPhase('playing'));
      assert.equal(room.code, code);
      assert.equal(room.missionIndex, index);
      assert.deepEqual(room.players.map(player => player.id), [hostId, guestId]);
      const { state } = await side.take(message => tagged('state')(message) && message.tick === 0);
      assert.equal(state.area, area);
      assert.equal(state.players[0].weaponLoadout.optic, 'marksman-optic');
    }
  }

  for (const [index, area] of CAMPAIGN_AREAS.entries()) {
    await deploy(area, index);
    if (area === 'heart') {
      sim.endMission('lost', 'tissue');
      for (const side of [host, guest]) {
        const room = await side.take(message => checkpoint(message) && message.missionIndex === index);
        assert.equal(room.nextArea, undefined);
        assert.equal(room.results.length, index);
      }
      await deploy(area, index);
    }
    sim.endMission('won');
    for (const side of [host, guest]) {
      const room = await side.take(message => checkpoint(message) && message.missionIndex === index);
      assert.equal(room.nextArea, CAMPAIGN_AREAS[index + 1] ?? null);
      assert.deepEqual(room.results.map(result => result.area), CAMPAIGN_AREAS.slice(0, index + 1));
    }
    if (area === 'stomach') {
      guest.socket.terminate();
      await host.take(message => roomPhase('finished')(message) && !message.players[1].connected);
      guest = await connect(t, origin);
      guest.send({ type: 'resume', code, token });
      assert.equal((await guest.take(tagged('session'))).id, guestId);
      const resumed = await guest.take(checkpoint);
      assert.equal(resumed.nextArea, 'intestines');
      assert.equal(resumed.results.length, 5);
      await guest.take(tagged('state'));
    }
  }
  await deploy('artery', 0);
});

test('both co-op suits can complete organ-specific objectives', () => {
  const profiles = [{ id: 'alpha' }, { id: 'bravo' }];
  const deploy = area => {
    const sim = new CoopSimulation(profiles, area);
    sim.start();
    return sim;
  };
  function repair(sim, index, point, seconds = 3) {
    const player = sim.players[index];
    Object.assign(player, { x: point.x, z: point.z });
    for (let tick = 0; tick < seconds * 30; tick++) {
      sim.step(1 / 30, { [player.id]: { repair: true } });
    }
  }

  const junction = deploy('junction');
  junction.wave = junction.waves;
  junction.clearWave();
  const node = junction.nodes[0];
  junction.gash = { ...JUNCTION_GASH_SITES.left, id: 'test-gash', node, nodeId: node.id,
    drainPerSecond: 1, sealRemaining: 10 };
  repair(junction, 1, junction.gash);
  assert.equal(junction.gash, null);
  for (let tick = 0; tick < 300 && junction.phase !== 'won'; tick++) junction.step(1 / 30);
  assert.equal(junction.phase, 'won');

  const heart = deploy('heart');
  for (let tick = 0; tick < 420 && !heart.valve.exposed; tick++) heart.step(1 / 30);
  assert.ok(heart.valve.exposed);
  heart.hitEnemy(heart.colony, heart.colony.health, true, heart.colony, 'player');
  heart.patrolIndex = 4;
  heart.enemies.length = 0;
  repair(heart, 1, heart.objective, 7);
  assert.equal(heart.phase, 'won');

  const lungs = deploy('lungs');
  lungs.wave = lungs.waves;
  lungs.spawnIndex = lungs.missions.at(-1).species.length;
  lungs.clearWave();
  repair(lungs, 0, lungs.nodes[0]);
  repair(lungs, 1, lungs.nodes[1]);
  assert.deepEqual(lungs.airway.ports.map(port => port.open), [true, true]);
  for (let tick = 0; tick < 900 && lungs.phase !== 'won'; tick++) {
    lungs.enemies.length = 0;
    lungs.step(1 / 30);
  }
  assert.equal(lungs.phase, 'won');

  const stomach = deploy('stomach');
  stomach.spawnIndex = stomach.missions[0].species.length;
  stomach.clearWave();
  repair(stomach, 0, stomach.gastric.intake);
  assert.equal(stomach.gastric.stage, 'drain');
  repair(stomach, 1, stomach.gastric.drain, 6);
  assert.equal(stomach.gastric.stage, 'drained');
  assert.equal(stomach.wave, 2);

  const acid = deploy('stomach');
  acid.organ = acid.createOrganPhase('active');
  for (const player of acid.players) Object.assign(player, { x: acid.organ.x, z: acid.organ.z });
  acid.step(1 / 30);
  assert.deepEqual(acid.events.filter(event => event.type === 'damage').map(event => event.playerId), ['alpha', 'bravo']);

  const brain = deploy('brain');
  brain.wave = brain.waves - 1;
  brain.beginWave();
  assert.ok(brain.players.every(player => player.reserve >= 66));
  for (let phase = 1; phase <= 3; phase++) {
    for (let tick = 0; tick < 300 && brain.boss.state !== 'exposed'; tick++) {
      brain.enemies.length = 0;
      brain.step(1 / 30);
    }
    assert.equal(brain.boss.state, 'exposed');
    assert.equal(brain.boss.phase, phase);
    while (brain.boss.phase === phase && brain.boss.state === 'exposed') {
      hitBrainBoss(brain, { vulnerable: true }, brain.boss.weakPoint);
    }
  }
  brain.enemies.length = 0;
  for (let tick = 0; tick < 60 && brain.phase !== 'won'; tick++) brain.step(1 / 30);
  assert.equal(brain.phase, 'won');
});
