import test from 'node:test';
import assert from 'node:assert/strict';
import { CoopSimulation, REWIND } from '../dist/coop-simulation.mjs';
import { COOP_TICK_RATE } from '../dist/coop-protocol.mjs';

// The client module reaches for the lobby's DOM when it is built; without one it skips the lobby.
globalThis.document ??= { getElementById: () => null };
const { CoopClient, INTERPOLATION_DELAY_MS } = await import('../dist/coop-client.mjs');

const TICK = 1 / COOP_TICK_RATE, TICK_MS = 1000 / COOP_TICK_RATE;

// A pathogen walking across the shooter's sights, one step per tick.
function crossing() {
  const sim = new CoopSimulation([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 'artery');
  sim.start();
  sim.spawnIndex = 1e6;
  const shooter = sim.suits[0];
  Object.assign(shooter.player, { x: 0, z: 0, yaw: 0, pitch: 0 });
  sim.players[1].health = 0;
  const target = sim.createEnemy('virus', 0, -10, sim.nodes[0]);
  Object.assign(target, { y: shooter.player.y, speed: 0, health: 1e6, maxHealth: 1e6 });
  sim.enemies = [target];
  sim.history = [];
  return { sim, shooter, target };
}

test('lag compensation traces a shot against where the shooter saw the pathogen', () => {
  const { sim, shooter, target } = crossing();
  // Record where it stood, then move it well clear of the crosshair.
  for (let i = 0; i < 6; i++) {
    sim.frame++;
    sim.history.push({ frame: sim.frame, at: new Map([[target.id, [i < 3 ? 0 : 3, target.y, -10, 0]]]) });
  }
  target.x = 3;
  shooter.viewTick = sim.frame - 4.5;
  const health = target.health;
  sim.events = [];
  sim.shoot(true, shooter);
  assert.ok(target.health < health, 'the shot lands where the pathogen was on screen');
  assert.ok(Math.abs(target.x - 3) < .5, 'and the pathogen is back where it is now, knockback and all');
  assert.equal(sim.events.find(event => event.type === 'shot').hit, true);

  // A view older than the cap is pulled forward to the oldest kept, so it cannot reach back far.
  shooter.fireCooldown = 0;
  sim.history = [{ frame: sim.frame - REWIND.ticks, at: new Map([[target.id, [3, target.y, -10, 0]]]) }, { frame: sim.frame, at: new Map([[target.id, [3, target.y, -10, 0]]]) }];
  shooter.viewTick = sim.frame - 100;
  const before = target.health;
  sim.shoot(true, shooter);
  assert.equal(target.health, before, 'too old a view misses the pathogen that has moved on');
});

test('the room steps record history and read each player\'s view tick', () => {
  const { sim } = crossing();
  for (let i = 0; i < 20; i++) sim.step(TICK, { a: { view: sim.frame - 2 } });
  assert.equal(sim.frame, 20);
  assert.equal(sim.history.length, REWIND.ticks + 2);
  assert.equal(sim.history.at(-1).frame, 20);
  assert.equal(sim.suits[0].viewTick, 17);
});

function client() {
  const coop = new CoopClient('ws://127.0.0.1/coop');
  const sent = [];
  coop.socket = { readyState: WebSocket.OPEN, bufferedAmount: 0, send: data => sent.push(JSON.parse(data)) };
  coop.receive({ type: 'session', code: 'ABCDEFGH', id: 'a', token: 't' });
  coop.receive({ type: 'room', phase: 'playing', players: [] });
  return { coop, sent };
}

function snapshot(sim, tick, ack = 0, events = []) {
  const state = sim.snapshotFor('a');
  delete state.events;
  return { type: 'state', tick, ack, state: JSON.parse(JSON.stringify(state)), events };
}

test('a fired shot shows at once, and the server\'s copy only confirms it', () => {
  const { sim } = crossing();
  const { coop, sent } = client();
  coop.receive(snapshot(sim, 2));
  const ammo = sim.suits[0].player.ammo;
  const first = coop.frame(TICK * 1.01, { fire: true, lookX: 0, lookY: 0 }, 1000);
  const shots = first.events.filter(event => event.type === 'shot');
  assert.equal(shots.length, 1, 'the tracer, flash and sound play this frame');
  assert.equal(shots[0].predicted, true);
  assert.equal(shots[0].hit, false, 'the hit marker waits for the server');
  assert.equal(first.player.ammo, ammo - 1);
  const packet = sent.find(message => message.type === 'input' && message.input.fire);

  // Held through the gun's cooldown, no second round is drawn before it could fire.
  const held = coop.frame(TICK * 1.01, { fire: true, lookX: 0, lookY: 0 }, 1033);
  assert.equal(held.events.filter(event => event.type === 'shot').length, 0);

  // The server fires that packet's shot: it comes back as an echo carrying the hit.
  sim.suits[0].player.ammo = ammo - 1;
  const confirm = { type: 'shot', playerId: 'a', weapon: 'carbine', pellet: 0, hit: true, crit: false, x: 0, y: 1, z: -10 };
  coop.receive(snapshot(sim, 4, packet.seq, [confirm]));
  const after = coop.frame(0, { lookX: 0, lookY: 0 }, 1066);
  const echoed = after.events.find(event => event.type === 'shot');
  assert.equal(echoed.echo, true);
  assert.equal(echoed.hit, true);
  assert.equal(after.player.ammo, ammo - 1, 'the round is not counted twice');

  // A teammate's shot is never treated as an echo.
  coop.receive(snapshot(sim, 6, packet.seq, [{ ...confirm, echo: undefined, playerId: 'b' }]));
  assert.equal(coop.frame(0, { lookX: 0, lookY: 0 }, 1100).events.find(event => event.type === 'shot').echo, undefined);
});

test('a predicted shot the server never fired is dropped when its packet is acknowledged', () => {
  const { sim } = crossing();
  const { coop, sent } = client();
  coop.receive(snapshot(sim, 2));
  coop.frame(TICK * 1.01, { fire: true, lookX: 0, lookY: 0 }, 1000);
  const packet = sent.find(message => message.type === 'input' && message.input.fire);
  assert.equal(coop.predicted.length, 1);
  coop.receive(snapshot(sim, 4, packet.seq));
  assert.equal(coop.predicted.length, 0);
  assert.equal(coop.frame(0, { lookX: 0, lookY: 0 }, 1033).player.ammo, sim.suits[0].player.ammo);
});

test('no shot is predicted while reloading, switching, empty or with a rocket launcher', () => {
  const { sim } = crossing();
  for (const change of [
    state => { state.reloading = 1; },
    state => { state.switching = .3; },
    state => { state.player.ammo = 0; },
    state => { state.weapon.projectileSpeed = 30; },
    state => { state.player.downed = true; },
  ]) {
    const { coop } = client();
    const message = snapshot(sim, 2);
    change(message.state);
    coop.receive(message);
    const view = coop.frame(TICK * 1.01, { fire: true, lookX: 0, lookY: 0 }, 1000);
    assert.equal(view.events.filter(event => event.type === 'shot').length, 0);
  }
});

test('other actors are drawn a moment behind, blended between the snapshots either side', () => {
  const { sim, target } = crossing();
  const { coop, sent } = client();
  const at = (tick, x) => { target.x = x; return snapshot(sim, tick); };
  // Packets arrive on time: tick n at n ticks' worth of milliseconds.
  for (const [tick, x] of [[10, 0], [12, 2], [14, 4]]) {
    const message = at(tick, x);
    coop.receive(message);
    coop.bufferSnapshot(tick, coop.latest.state, tick * TICK_MS);
  }
  coop.clockOffset = 0;
  // Drawn 100 ms (three ticks) behind tick 14.5: tick 11.5, between the first two snapshots.
  const now = 14.5 * TICK_MS;
  const view = coop.frame(0, { lookX: 0, lookY: 0 }, now);
  const drawn = view.enemies.find(enemy => enemy.id === target.id);
  assert.ok(Math.abs(drawn.x - 1.5) < 1e-6, 'x ' + drawn.x);
  assert.ok(Math.abs(coop.viewTick - (14.5 - INTERPOLATION_DELAY_MS / TICK_MS)) < 1e-9);

  // The next packet names that tick, for lag compensation.
  coop.frame(TICK * 1.01, { lookX: 0, lookY: 0 }, now);
  assert.equal(sent.at(-1).input.view, Math.round(coop.viewTick * 100) / 100);

  // A pathogen gone from the newest snapshot is not drawn from the older ones.
  sim.enemies = [];
  coop.receive(snapshot(sim, 16));
  coop.bufferSnapshot(16, coop.latest.state, 16 * TICK_MS);
  assert.equal(coop.frame(0, { lookX: 0, lookY: 0 }, now).enemies.length, 0);
});

test('the clock estimate follows early packets at once and late ones slowly', () => {
  const { coop } = client();
  const state = { players: [], enemies: [], projectiles: [], throwables: [], drones: [] };
  coop.bufferSnapshot(10, state, 10 * TICK_MS);
  assert.equal(coop.clockOffset, 0);
  coop.bufferSnapshot(12, state, 12 * TICK_MS + 60);
  assert.ok(coop.clockOffset > -60 * .05 && coop.clockOffset < 0, 'a late packet barely moves it');
  const late = coop.clockOffset;
  coop.bufferSnapshot(14, state, 14 * TICK_MS - 40);
  assert.ok(coop.clockOffset > late + 5, 'an early one pulls it forward');
  // A new match starts the ticks again: the buffer and the estimate start over.
  coop.bufferSnapshot(0, state, 99_000);
  assert.equal(coop.snapshots.length, 1);
  assert.equal(coop.clockOffset, -99_000);
});
