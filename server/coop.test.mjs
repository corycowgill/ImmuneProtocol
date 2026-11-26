import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import WebSocket from 'ws';
import { hitBrainBoss } from '../dist/brain-boss.mjs';
import { CAMPAIGN_AREAS, COOP_CODE_ALPHABET, COOP_CODE_LENGTH, COOP_PROTOCOL_VERSION } from '../dist/coop-protocol.mjs';
import { CoopSimulation } from '../dist/coop-simulation.mjs';
import { DIFFICULTIES, MISSION_TUNING, applyDifficulty } from '../dist/difficulty.mjs';
import {
  DEFAULT_WEAPON_LOADOUT, loadoutWithBuild, loadoutWithWeapon, normalizeWeaponLoadout, weaponStats,
} from '../dist/weapon-mods.mjs';
import { JUNCTION_GASH_SITES, Simulation } from '../dist/simulation.mjs';
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
  assert.deepEqual(await health.json(), { ok: true, service: 'immune-protocol-coop', protocol: COOP_PROTOCOL_VERSION });
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

test('shares authoritative combat, reload-safe reconnect, and an unattended wave countdown', async t => {
  let simulation;
  const origin = await localServer(t, {
    simulation: players => { simulation = new CoopSimulation(players); return simulation; },
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
  // Skip the post-wave banner. The countdown to the next wave then runs on its own: the room
  // stays in play with no ready-up and no armory stop.
  simulation.outro = { remaining: 0, duration: 0 };
  const countdown = await host.take(message => tagged('state')(message) && message.state.phase === 'intermission');
  assert.equal(countdown.state.wave, 1);
  simulation.intermission = .1;
  const nextWave = await host.take(message => tagged('state')(message) && message.state.wave === 2);
  assert.equal(nextWave.state.phase, 'combat');
  assert.ok(nextWave.state.clock > countdown.state.clock);

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
  for (let tick = 0; tick < 420 && !heart.valve.valves[0].exposed; tick++) heart.step(1 / 30);
  assert.ok(heart.valve.valves[0].exposed);
  for (const colony of heart.enemies.filter(enemy => enemy.type === 'colony')) {
    heart.hitEnemy(colony, colony.health, true, colony, 'player');
  }
  assert.ok(heart.valve.colonyDefeated);
  heart.patrolIndex = Infinity;
  heart.enemies.length = 0;
  // Each wound is sealed while its own valve is closed; one suit takes two, the other two.
  for (let tick = 0; tick < 30 * 40 && heart.phase !== 'won'; tick++) {
    const input = {};
    for (const [index, player] of heart.players.entries()) {
      const node = heart.nodes.filter((_, n) => n % 2 === index).find(item => item.health < 100) ?? heart.nodes[index];
      Object.assign(player, { x: node.x, z: node.z + 2 });
      input[player.id] = { repair: true };
    }
    heart.step(1 / 30, input);
  }
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
  for (let phase = 1; phase <= 3; phase++) {
    for (let tick = 0; tick < 300 && (brain.boss.state !== 'exposed' || brain.boss.openness <= .36); tick++) {
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
  for (let tick = 0; tick < 200 && brain.phase !== 'won'; tick++) brain.step(1 / 30);
  assert.equal(brain.phase, 'won');
});

test('solo and co-op can repeatedly reload full magazines after the old reserve would be spent', () => {
  const solo = new Simulation('artery');
  const coop = new CoopSimulation([
    { id: 'alpha', weaponLoadout: { magazine: 'extended-magazine' } },
    { id: 'bravo' },
  ]);
  for (const sim of [solo, coop]) {
    sim.start();
    for (const suit of sim.activeSuits()) {
      const { player, magazineSize, weapon } = suit;
      for (let magazine = 0; magazine < 10; magazine++) {
        for (let round = 0; round < magazineSize; round++) {
          sim.updateRifle(weapon.interval, { fire: true }, false, suit);
        }
        assert.equal(player.ammo, 0);
        sim.updateRifle(0, magazine % 2 === 0 ? { reload: true } : { fire: true }, false, suit);
        assert.equal(suit.reloading, weapon.reloadSeconds);
        sim.updateRifle(weapon.reloadSeconds / 2, { fire: true }, false, suit);
        assert.equal(player.ammo, 0);
        sim.updateRifle(weapon.reloadSeconds / 2, {}, false, suit);
        assert.equal(player.ammo, magazineSize);
      }
    }
  }
});

test('three-node arenas, the macrophage sweep and the post-wave countdown', () => {
  const lymph = new Simulation('lymph');
  lymph.start();
  assert.equal(lymph.nodes.length, 3);
  lymph.nodes[2].health = 40;
  assert.equal(Math.round(lymph.tissue), 80);
  lymph.organCycle = 0;
  lymph.organ = lymph.createOrganPhase('active');
  lymph.organ.remaining = 30;
  for (let index = 0; index < 3; index++) {
    lymph.enemies.push(lymph.createEnemy('virus', lymph.organ.x + index, lymph.organ.z, lymph.nodes[0]));
  }
  for (let tick = 0; tick < 60; tick++) lymph.step(1 / 30);
  assert.equal(lymph.kills, 3);

  const artery = new Simulation('artery');
  artery.start();
  artery.spawnIndex = artery.missions[0].species.length;
  artery.enemies.length = 0;
  artery.step(1 / 30);
  assert.equal(artery.phase, 'combat');
  assert.ok(artery.outro);
  for (let tick = 0; tick < 3.5 * 30; tick++) artery.step(1 / 30);
  assert.equal(artery.phase, 'combat');
  for (let tick = 0; tick < 30; tick++) artery.step(1 / 30);
  assert.equal(artery.phase, 'intermission');
  assert.equal(artery.outro, null);
});

test('difficulty reshapes solo missions and leaves scripted encounters intact', () => {
  const deploy = (area, level) => {
    const sim = applyDifficulty(new Simulation(area), level);
    sim.start();
    return sim;
  };
  const pathogens = sim => sim.missions.reduce((sum, wave) => sum + (wave.arrivals ?? wave.species).length, 0);
  for (const area of CAMPAIGN_AREAS) {
    const [easy, medium, hard] = ['easy', 'medium', 'hard'].map(level => deploy(area, level));
    // Medium is the authored campaign, apart from the missions with their own Medium relief.
    if (MISSION_TUNING.medium[area]) assert.equal(medium.missions.length, new Simulation(area).missions.length, area);
    else assert.deepEqual(medium.missions, new Simulation(area).missions, area);
    assert.equal(easy.missions.length, medium.missions.length, area);
    assert.equal(hard.missions.length, medium.missions.length, area);
    // The heart's only wave is its rooted colonies.
    if (area === 'heart') assert.equal(pathogens(easy), pathogens(medium));
    else assert.ok(pathogens(easy) < pathogens(medium), area);
    assert.ok(pathogens(hard) >= pathogens(medium), area);
    assert.equal(easy.turretCharges, 2);
    assert.equal(medium.turretCharges, 1);
    assert.equal(hard.turretCharges, 1);
    assert.ok(easy.repairAmount > medium.repairAmount && hard.repairAmount < medium.repairAmount, area);
    const virus = [easy, medium, hard].map(sim => sim.createEnemy('virus', 0, 0, sim.nodes[0]).maxHealth);
    assert.ok(virus[0] < virus[1] && virus[1] < virus[2], area);
  }

  // Lanes stay attached to their pathogens, and Hard keeps the Gastric Chamber's wave sizes.
  const lungs = deploy('lungs', 'easy');
  for (const wave of lungs.missions) assert.equal(wave.lanes.length, wave.species.length);
  assert.deepEqual(deploy('stomach', 'hard').missions.map(wave => wave.species), new Simulation('stomach').missions.map(wave => wave.species));

  // Capillary Junction surges keep the arrival that carries their forecast, including Overtime.
  const junction = deploy('junction', 'easy');
  for (const wave of junction.missions) {
    for (const surge of wave.surges) assert.equal(wave.arrivals.filter(arrival => arrival.surge === surge).length, 1);
  }
  junction.wave = junction.missions.length;
  junction.extractionPending = true;
  junction.chooseExtraction('stay');
  const overtime = junction.missions.at(-1);
  assert.equal(overtime.name, 'Overtime');
  assert.ok(overtime.arrivals.length < 45);
  assert.equal(junction.spawnIndex, 0);

  // The heart colony and Mega Virus waves are untouched; the boss scales through its hit size.
  assert.deepEqual(deploy('heart', 'easy').missions[0].species, Array(12).fill('colony'));
  const brain = deploy('brain', 'hard');
  assert.ok(brain.missions.at(-1).boss);
  brain.wave = brain.missions.length - 1;
  brain.beginWave();
  brain.boss.state = 'exposed'; brain.boss.openness = 1;
  const health = brain.boss.health;
  hitBrainBoss(brain, { vulnerable: true }, brain.boss.weakPoint);
  assert.equal(health - brain.boss.health, Math.round(28 / DIFFICULTIES.hard.enemyHealth));

  // Hard raises tissue damage only where two nodes are defended; suits always take more.
  const tissueLoss = (area, level) => {
    const sim = deploy(area, level);
    const node = sim.nodes[0];
    sim.damageNode(node, 10);
    return 100 - node.health;
  };
  assert.equal(tissueLoss('lungs', 'hard'), 10 * DIFFICULTIES.hard.tissueDamage);
  assert.equal(tissueLoss('artery', 'hard'), 10);
  assert.equal(tissueLoss('artery', 'easy'), 10 * DIFFICULTIES.easy.tissueDamage);
  // The Bronchial Fork has no per-mission suit exception on Hard.
  const suit = deploy('lungs', 'hard');
  const attacker = suit.createEnemy('virus', 0, 0, suit.nodes[0]);
  suit.damageTarget(attacker, 'player', 10);
  // Each strike is scaled down for the five-fold waves before difficulty applies.
  assert.ok(Math.abs(100 - suit.player.health - 10 * .22 * DIFFICULTIES.hard.suitDamage) < 1e-9);
});

test('two carried weapons: loadouts, swapping, spread, pellets, rockets and charms', () => {
  // Saves from before weapons existed become the carbine build, with the pistol as secondary.
  const legacy = normalizeWeaponLoadout({ optic: 'marksman-optic', finish: 'crimson' });
  assert.equal(legacy.weapon, 'carbine');
  assert.equal(legacy.optic, 'marksman-optic');
  assert.deepEqual([legacy.arsenal.primary, legacy.arsenal.secondary], ['carbine', 'pistol']);
  const swapped = loadoutWithWeapon(legacy, 'secondary', 'carbine');
  assert.deepEqual([swapped.arsenal.primary, swapped.arsenal.secondary], ['pistol', 'carbine']);
  assert.equal(swapped.arsenal.builds.carbine.optic, 'marksman-optic');

  const arm = (primary, secondary = 'pistol', build = {}) => {
    const loadout = loadoutWithBuild(loadoutWithWeapon(loadoutWithWeapon(DEFAULT_WEAPON_LOADOUT, 'primary', primary), 'secondary', secondary), primary, build);
    const sim = new Simulation('artery', { weaponLoadout: loadout });
    sim.start();
    sim.tutorial = null;
    sim.enemies.length = 0;
    return sim;
  };
  const target = (sim, type, distance) => {
    const enemy = sim.createEnemy(type, sim.player.x, sim.player.z - distance, sim.nodes[0]);
    sim.enemies.push(enemy);
    sim.player.yaw = 0;
    sim.player.pitch = Math.atan2(enemy.y - sim.player.y, distance);
    return enemy;
  };

  // Each weapon keeps its own magazine across swaps and can't fire mid-swap.
  const sniper = arm('sniper');
  assert.equal(sniper.magazineSize, 5);
  sniper.updateRifle(1 / 30, { fire: true, aim: true }, false);
  assert.equal(sniper.player.ammo, 4);
  sniper.updateRifle(1 / 30, { swap: true }, false);
  assert.equal(sniper.weaponLoadout.weapon, 'pistol');
  assert.equal(sniper.player.ammo, 16);
  assert.ok(sniper.switching > 0);
  sniper.updateRifle(1 / 30, { fire: true }, false);
  assert.equal(sniper.player.ammo, 16);
  for (let tick = 0; tick < 30; tick++) sniper.updateRifle(1 / 30, {}, false);
  sniper.updateRifle(1 / 30, { swap: true }, false);
  assert.equal(sniper.weaponLoadout.weapon, 'sniper');
  assert.equal(sniper.player.ammo, 4);

  // Aiming tightens spread; the scope is far more accurate than the hip.
  const stats = weaponStats(loadoutWithWeapon(DEFAULT_WEAPON_LOADOUT, 'primary', 'sniper'));
  assert.ok(stats.aimSpread < stats.hipSpread / 50);

  // Shotgun pellets lose damage with range.
  const damage = distance => {
    const sim = arm('shotgun', 'pistol', { charm: 'eye' });
    const enemy = target(sim, 'guard', distance);
    enemy.heading = Math.PI;
    enemy.health = enemy.maxHealth = 10000;
    sim.updateRifle(1 / 30, { fire: true, aim: true }, false);
    return 10000 - enemy.health;
  };
  assert.ok(damage(5) > damage(30) * 2.5);

  // Rockets burst on arrival and splash nearby pathogens.
  const rocket = arm('launcher');
  const struck = target(rocket, 'bacillus', 12);
  const neighbour = rocket.createEnemy('virus', rocket.player.x + 2.5, rocket.player.z - 12, rocket.nodes[0]);
  rocket.enemies.push(neighbour);
  rocket.updateRifle(1 / 30, { fire: true }, false);
  assert.ok(rocket.enemies.includes(struck));
  for (let tick = 0; tick < 20; tick++) {
    rocket.clock += 1 / 30;
    rocket.updateRifle(1 / 30, {}, false);
  }
  assert.ok(!rocket.enemies.includes(struck) && !rocket.enemies.includes(neighbour));
  assert.equal(rocket.player.ammo, 1);

  // Charms buff the weapon they hang on.
  const plain = weaponStats(DEFAULT_WEAPON_LOADOUT);
  const lucky = weaponStats(loadoutWithBuild(DEFAULT_WEAPON_LOADOUT, 'carbine', { charm: 'clover' }));
  const swift = weaponStats(loadoutWithBuild(DEFAULT_WEAPON_LOADOUT, 'carbine', { charm: 'feather' }));
  assert.ok(lucky.aimCritical > plain.aimCritical);
  assert.ok(swift.moveSpeed > plain.moveSpeed);

  // Co-op suits swap through the same input flag.
  const coop = new CoopSimulation([{ id: 'alpha', weaponLoadout: loadoutWithWeapon(DEFAULT_WEAPON_LOADOUT, 'primary', 'shotgun') }, { id: 'bravo' }]);
  coop.start();
  coop.step(1 / 30, { alpha: { swap: true } });
  assert.equal(coop.snapshotFor('alpha').weaponLoadout.weapon, 'pistol');
  assert.equal(coop.snapshotFor('bravo').weaponLoadout.weapon, 'carbine');
  assert.equal(coop.snapshotFor('alpha').weaponLoadout.arsenal.builds, undefined);
});

test('waves field five times their roster and score is kept per player', () => {
  const artery = new Simulation('artery');
  assert.deepEqual(artery.missions.map(wave => wave.species.length), [45, 65, 80, 95, 110]);
  assert.equal(artery.missions[0].species.slice(0, 9).join(), artery.missions[0].species.slice(9, 18).join());
  const lungs = new Simulation('lungs');
  assert.equal(lungs.missions[0].species.length, 55);
  for (const wave of lungs.missions) assert.equal(wave.lanes.length, wave.species.length);
  assert.equal(new Simulation('junction').missions[0].arrivals.length, 30);
  assert.deepEqual(new Simulation('heart').missions[0].species, Array(12).fill('colony'));

  const sim = new CoopSimulation([{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Bravo' }]);
  sim.start();
  const [alpha, bravo] = sim.suits;
  const spawn = () => { const enemy = sim.createEnemy('virus', 0, 0, sim.nodes[0]); sim.enemies.push(enemy); return enemy; };
  const at = { x: 0, y: 1, z: 0 };
  sim.hitEnemy(spawn(), 1e4, true, at, 'player', alpha);
  sim.hitEnemy(spawn(), 1e4, false, at, 'player', bravo);
  sim.hitEnemy(spawn(), 1e4, false, at, 'player', bravo);
  sim.hitEnemy(spawn(), 1e4, false, at, 'turret');
  assert.deepEqual([alpha.player.score, alpha.player.kills], [135, 1]);
  assert.deepEqual([bravo.player.score, bravo.player.kills], [200, 2]);
  // Turret kills and wave bonuses count for the team only.
  assert.equal(sim.score, 435);
  assert.equal(sim.kills, 4);
  const view = sim.snapshotFor('a');
  assert.deepEqual(view.players.map(player => [player.name, player.score, player.kills]), [['Alpha', 135, 1], ['Bravo', 200, 2]]);
  // A respawn keeps the score; a new mission starts from zero.
  alpha.resetPose(50);
  assert.equal(alpha.player.score, 135);
  sim.start();
  assert.deepEqual(sim.players.map(player => player.score), [0, 0]);

  const solo = new Simulation('artery');
  solo.start();
  const target = solo.createEnemy('spore', 0, 0, solo.nodes[0]);
  solo.enemies.push(target);
  solo.hitEnemy(target, 1e4, false, at, 'player', solo);
  assert.deepEqual([solo.player.score, solo.player.kills, solo.score], [130, 1, 130]);
});
