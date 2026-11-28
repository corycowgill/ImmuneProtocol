import { Simulation } from './simulation.mjs';
import { ORGAN_MISSIONS } from './organs.mjs';
import { attachLobby } from './coop-lobby.mjs';
import { savedSuit } from './suits.mjs';
import { COOP_PATH, COOP_HEALTH_PATH, COOP_PROTOCOL_VERSION, COOP_RECONNECT_MS, COOP_SERVICE, COOP_TICK_RATE } from './coop-protocol.mjs';
import { terrainFor } from './terrain.mjs';
import { movementStandIn, shotStandIn } from './simulation.mjs';

// One-frame presses held until the next input packet, so a quick tap is never lost.
const TAPS = ['jump', 'dash', 'melee', 'grenade', 'stun', 'crouch'];

export const PUBLIC_COOP_ORIGIN = 'https://immune-protocol-coop.onrender.com';

const INPUT_TICK = 1 / COOP_TICK_RATE;
const TICK_MS = 1000 / COOP_TICK_RATE;
// Other actors are drawn this far behind the newest server state, blended between the two
// snapshots either side, so one late or lost packet does not make them stutter or snap.
export const INTERPOLATION_DELAY_MS = 100;
const SNAPSHOT_BUFFER = 12;
// How far a straight shot reaches (simulation.mjs RIFLE_RANGE), for a predicted tracer that meets nothing.
const SHOT_RANGE = 68;
const MAX_BUFFER = 64 * 1024;
const MAX_PENDING = 90;
const RESUME_KEY = 'immune-protocol.coop-session';

const emptyInput = () => ({
  moveX: 0, moveZ: 0, lookX: 0, lookY: 0,
  fire: false, repair: false, reload: false, deploy: false, carry: false, sprint: false, aim: false,
});

function saveSession(session) {
  try {
    if (session) sessionStorage.setItem(RESUME_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(RESUME_KEY);
  } catch { /* Some browser privacy settings disable storage. */ }
}

export function savedCoopSession(code) {
  try {
    const session = JSON.parse(sessionStorage.getItem(RESUME_KEY));
    return session?.code === code && typeof session.token === 'string' ? session : null;
  } catch { return null; }
}

export async function verifyCoopHost() {
  try {
    const response = await fetch(COOP_HEALTH_PATH, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return false;
    const health = await response.json();
    return health.ok && health.service === COOP_SERVICE && health.protocol === COOP_PROTOCOL_VERSION;
  } catch { return false; }
}

function hydrate(state) {
  for (const key of ['nearNode', 'objective', 'failedNode']) {
    const id = state[key + 'Id'] ?? state[key]?.id;
    state[key] = state.nodes.find(node => node.id === id) ?? state[key] ?? null;
  }
  if (state.gash) state.gash.node = state.nodes.find(node => node.id === state.gash.nodeId);
  const valves = state.gastric ? [state.gastric.intake, state.gastric.drain] : [];
  state.nearGastricValve = valves.find(valve => valve.id === state.nearGastricValveId) ?? null;
  state.repairTarget = [...state.nodes, ...valves, state.gash].find(target => target && target.id === state.repairTargetId) ?? null;
  // Reviving a downed teammate aims the sealer at the body on the floor.
  const downed = state.revive && state.players?.find(player => player.id === state.revive.id);
  if (downed && state.repairTargetId === downed.id) state.repairTarget = { id: downed.id, revive: true, x: downed.x, y: .45, z: downed.z };
  state.organMission = ORGAN_MISSIONS[state.area];
  for (const enemy of state.enemies) {
    if (enemy.nodeId) enemy.node = state.nodes.find(node => node.id === enemy.nodeId);
  }
  return state;
}

// Actors from the two snapshots bracketing the render time, blended. An actor gone from the newest
// snapshot (a pathogen killed since) is left out, and one that has only just appeared is drawn where
// the newest snapshot has it.
function bufferedActors(latest = [], newer = [], older, ratio) {
  const alive = new Set(latest.map(actor => actor.id));
  const blended = blendActors(newer, older, ratio).filter(actor => alive.has(actor.id));
  const drawn = new Set(blended.map(actor => actor.id));
  for (const actor of latest) if (!drawn.has(actor.id)) blended.push(actor);
  return blended;
}

function blendActors(newer, older, ratio) {
  if (!older || ratio >= 1) return newer;
  const previous = new Map(older.map(actor => [actor.id, actor]));
  return newer.map(actor => {
    const from = previous.get(actor.id);
    if (!from || Math.hypot(actor.x - from.x, actor.z - from.z) > 8) return actor;
    const interpolated = { ...actor };
    for (const axis of ['x', 'y', 'z', 'pitch']) {
      if (Number.isFinite(from[axis]) && Number.isFinite(actor[axis])) {
        interpolated[axis] = from[axis] + (actor[axis] - from[axis]) * ratio;
      }
    }
    if (Number.isFinite(from.yaw) && Number.isFinite(actor.yaw)) {
      const difference = actor.yaw - from.yaw;
      interpolated.yaw = from.yaw + Math.atan2(Math.sin(difference), Math.cos(difference)) * ratio;
    }
    return interpolated;
  });
}

export class CoopClient extends EventTarget {
  constructor(url = new URL(COOP_PATH, location.href)) {
    super();
    this.url = new URL(url);
    this.url.protocol = this.url.protocol === 'https:' || this.url.protocol === 'wss:' ? 'wss:' : 'ws:';
    this.socket = null;
    this.sessionConfirmed = false;
    this.session = null;
    this.room = null;
    this.retryTimer = 0;
    this.retryUntil = 0;
    this.retryDelay = 450;
    this.resetState();
    this.lobby = attachLobby(this);
  }

  resetState() {
    this.latest = null;
    this.snapshots = [];
    this.clockOffset = null;
    this.viewTick = null;
    this.view = null;
    this.events = [];
    this.weaponLoadout = null;
    this.seq = 0;
    this.pending = [];
    this.buffer = emptyInput();
    this.elapsed = 0;
    this.repairingSound = false;
    this.clearPrediction();
  }

  // Shots this client drew before the server confirmed them, by the input packet that fired them.
  clearPrediction() {
    this.predicted = [];
    this.queuedShots = [];
    this.fireCooldown = 0;
    this.ack = 0;
    this.blockedUntil = 0;
  }

  announce(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  get connected() { return this.sessionConfirmed && this.socket?.readyState === WebSocket.OPEN; }
  get localPlayer() { return this.room?.players.find(player => player.id === this.session?.id); }

  send(message) {
    if (this.socket?.readyState !== WebSocket.OPEN || this.socket.bufferedAmount > MAX_BUFFER) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  connect(intent) {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    clearTimeout(this.retryTimer);
    if (intent.type === 'resume' && !this.session) this.session = intent;
    else if (intent.type !== 'resume') intent = { ...intent, suit: savedSuit() };
    const socket = new WebSocket(this.url);
    this.socket = socket;
    this.sessionConfirmed = false;
    this.announce('connection', intent.type === 'resume' ? 'reconnecting' : 'connecting');
    socket.addEventListener('open', () => {
      if (socket === this.socket) this.send(intent);
    });
    socket.addEventListener('message', event => {
      if (socket !== this.socket || typeof event.data !== 'string') return;
      try { this.receive(JSON.parse(event.data)); } catch (error) {
        console.error('Could not read co-op message', error);
        this.announce('problem', 'The game server sent an unreadable update.');
      }
    });
    socket.addEventListener('close', event => {
      if (socket !== this.socket) return;
      this.socket = null;
      this.sessionConfirmed = false;
      if (event.code === 4000) {
        this.stop();
        this.announce('ended', 'This room was opened in another tab.');
        return;
      }
      this.pending.length = 0;
      this.buffer = emptyInput();
      this.elapsed = 0;
      this.clearPrediction();
      if (this.session) this.retry();
      else this.announce('problem', 'Could not connect to the game server. Try again.');
    });
  }

  retry() {
    const now = Date.now();
    if (!this.retryUntil) this.retryUntil = now + COOP_RECONNECT_MS;
    if (now >= this.retryUntil) {
      this.stop();
      this.announce('problem', 'The room could not be rejoined. Create or join a new room.');
      return;
    }
    this.announce('connection', 'reconnecting');
    const { code, token } = this.session;
    this.retryTimer = setTimeout(() => this.connect({ type: 'resume', code, token }), this.retryDelay);
    this.retryDelay = Math.min(4000, this.retryDelay * 2);
  }

  receive(message) {
    switch (message.type) {
      case 'session':
        this.session = { code: message.code, id: message.id, token: message.token };
        this.sessionConfirmed = true;
        this.seq = 0;
        this.pending = [];
        this.clearPrediction();
        this.retryUntil = 0;
        this.retryDelay = 450;
        saveSession(this.session);
        this.announce('session', this.session);
        break;
      case 'room':
        if (message.phase === 'playing' && this.room?.phase === 'finished') {
          const seq = this.seq;
          this.resetState();
          this.seq = seq;
        }
        this.room = message;
        // A teammate dropping out no longer holds the match, so only leaving play clears input.
        if (message.phase !== 'playing') {
          this.pending.length = 0;
          this.buffer = emptyInput();
          this.elapsed = 0;
          this.clearPrediction();
        }
        this.announce('room', message);
        break;
      case 'state': {
        const now = performance.now();
        const state = hydrate(message.state);
        // Reusing the object keeps the renderer's per-frame loadout checks cheap.
        const loadout = JSON.stringify(state.weaponLoadout);
        if (loadout !== this.weaponLoadout?.key) this.weaponLoadout = { key: loadout, value: state.weaponLoadout };
        state.weaponLoadout = this.weaponLoadout.value;
        this.latest = { state, receivedAt: now };
        this.bufferSnapshot(message.tick, state, now);
        this.pending = this.pending.filter(packet => packet.seq > message.ack);
        this.ack = message.ack;
        this.confirmShots(message.events ?? [], message.ack);
        this.events.push(...(message.events ?? []));
        if (!this.view) this.view = { ...state, events: [] };
        this.announce('state', state);
        break;
      }
      case 'error': {
        const terminal = ['PARTNER_LEFT', 'SESSION_EXPIRED', 'ROOM_EXPIRED', 'MATCH_ERROR'].includes(message.code);
        if (!this.session || terminal || this.retryUntil) this.stop();
        this.announce(terminal ? 'ended' : 'problem', message.message);
        break;
      }
    }
  }

  // Keeps the last few snapshots by server tick, and an estimate of the server's clock: the gap
  // between a packet's tick and when it arrived. Early packets pull the estimate forward at once,
  // late ones only slowly, so jitter does not drag the render time around.
  bufferSnapshot(tick, state, now) {
    if (!Number.isFinite(tick)) return;
    if (this.snapshots.length && tick < this.snapshots.at(-1).tick) {
      this.snapshots = [];
      this.clockOffset = null;
    }
    this.snapshots.push({ tick, state });
    if (this.snapshots.length > SNAPSHOT_BUFFER) this.snapshots.shift();
    const sample = tick * TICK_MS - now;
    if (this.clockOffset == null || Math.abs(sample - this.clockOffset) > 1000) this.clockOffset = sample;
    else this.clockOffset += (sample - this.clockOffset) * (sample > this.clockOffset ? .25 : .03);
  }

  // The server tick to draw other actors at, and the two snapshots either side of it.
  bracket(now) {
    const snapshots = this.snapshots;
    if (!snapshots.length || this.clockOffset == null) return null;
    const tick = (now + this.clockOffset - INTERPOLATION_DELAY_MS) / TICK_MS;
    this.viewTick = Math.max(0, tick);
    let newer = snapshots.findIndex(snapshot => snapshot.tick > tick);
    if (newer < 0) return { older: snapshots.at(-1), newer: snapshots.at(-1), ratio: 1 };
    if (newer === 0) return { older: snapshots[0], newer: snapshots[0], ratio: 1 };
    const older = snapshots[newer - 1];
    newer = snapshots[newer];
    return { older, newer, ratio: (tick - older.tick) / (newer.tick - older.tick) };
  }

  // A straight-shooting gun fires on this screen at once: the server will fire the same packet's
  // shot when it arrives. Waits for the server after a swap or reload press, and stops at what
  // the magazine holds less the shots still unconfirmed. Rockets are left to the server.
  predictShot(packet) {
    const { input, seq } = packet;
    this.fireCooldown = Math.max(0, this.fireCooldown - INPUT_TICK);
    if (input.swap || input.reload) this.blockedUntil = seq;
    const state = this.latest?.state, player = state?.player, weapon = state?.weapon;
    if (!input.fire || !player || !weapon || weapon.projectileSpeed || this.fireCooldown > 0 || this.ack < this.blockedUntil) return;
    if (player.downed || player.health <= 0 || player.mantling || state.reloading > 0 || state.switching > 0) return;
    if (state.repairing || (input.repair && state.canRepair) || !['combat', 'intermission'].includes(state.phase)) return;
    if (player.ammo - this.predicted.length <= 0) return;
    this.fireCooldown = weapon.interval;
    this.predicted.push({ seq });
    this.queuedShots.push({ aim: !!input.aim });
  }

  // The server's copy of a shot already drawn here is marked as an echo: its hit and crit still
  // count (hit marker, haptics, achievements), but its flash, tracer, recoil and sound are not
  // repeated. A predicted shot the server did not fire is dropped once its packet is acknowledged.
  confirmShots(events, ack) {
    const me = this.session?.id;
    let echo = false;
    for (const event of events) {
      if (event.type !== 'shot' || event.playerId !== me || event.rocket || event.blast) continue;
      if (!event.pellet) {
        const index = this.predicted.findIndex(shot => shot.seq <= ack);
        echo = index >= 0;
        if (echo) this.predicted.splice(index, 1);
      }
      if (echo) event.echo = true;
    }
    this.predicted = this.predicted.filter(shot => shot.seq > ack);
  }

  // Tracers for the shots fired this frame, traced against what the player sees.
  predictedShotEvents(state, player, enemies) {
    const weapon = state.weapon, kind = weapon.weapon ?? 'carbine', events = [];
    const tracer = shotStandIn(state, enemies);
    for (const { aim } of this.queuedShots.splice(0)) {
      for (let pellet = 0; pellet < (weapon.pellets ?? 1); pellet++) {
        const ray = Simulation.prototype.aimRay(player, aim ? weapon.aimSpread : weapon.hipSpread);
        let impact;
        try {
          impact = Simulation.prototype.traceRay.call(tracer, player, ray, aim, weapon).impact;
        } catch {
          impact = { x: player.x + ray.x * SHOT_RANGE, y: player.y + ray.y * SHOT_RANGE, z: player.z + ray.z * SHOT_RANGE };
        }
        events.push({ type: 'shot', predicted: true, playerId: this.session?.id, weapon: kind, pellet, hit: false, crit: false, ...impact });
      }
    }
    return events;
  }

  setSuit(suit) {
    return this.connected && this.send({ type: 'suit', suit });
  }

  setSettings(settings) {
    return this.connected && this.send({ type: 'settings', ...settings });
  }

  setReady(ready, loadout) {
    return this.connected && this.send({ type: 'ready', ready, loadout });
  }

  neutralize() {
    this.buffer = emptyInput();
    this.elapsed = 0;
    if (!this.connected || this.room?.phase !== 'playing') return;
    this.send({ type: 'input', seq: ++this.seq, input: this.buffer });
  }

  stop(notifyServer = false) {
    if (notifyServer) this.send({ type: 'leave' });
    clearTimeout(this.retryTimer);
    this.retryUntil = 0;
    this.retryDelay = 450;
    this.session = null;
    this.room = null;
    this.sessionConfirmed = false;
    saveSession(null);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.resetState();
  }

  advanceInput(dt, input) {
    if (!this.connected || this.room?.phase !== 'playing') return;
    this.buffer = {
      ...input,
      lookX: this.buffer.lookX + input.lookX,
      lookY: this.buffer.lookY + input.lookY,
      fire: this.buffer.fire || input.fire,
      // A quick tap of Repair (a downed suit's call for help) must reach the server too.
      repair: this.buffer.repair || input.repair,
      reload: this.buffer.reload || input.reload,
      deploy: this.buffer.deploy || input.deploy,
      swap: this.buffer.swap || input.swap,
      ...Object.fromEntries(TAPS.map(tap => [tap, !!(this.buffer[tap] || input[tap])])),
    };
    this.elapsed += dt;
    while (this.elapsed >= INPUT_TICK) {
      this.elapsed -= INPUT_TICK;
      // Each packet names the tick this screen was drawing, for the server's lag compensation.
      const input = this.viewTick == null ? this.buffer : { ...this.buffer, view: Math.round(this.viewTick * 100) / 100 };
      const packet = { type: 'input', seq: ++this.seq, input };
      if (this.send(packet)) {
        this.pending.push(packet);
        if (this.pending.length > MAX_PENDING) this.pending.shift();
        this.predictShot(packet);
      }
      this.buffer = { ...input, lookX: 0, lookY: 0, deploy: false, swap: false, ...Object.fromEntries(TAPS.map(tap => [tap, false])) };
    }
  }

  frame(dt, input, now) {
    if (!this.latest) return null;
    this.advanceInput(dt, input);
    const { state } = this.latest;
    const view = this.bracket(now) ?? { older: { state }, newer: { state }, ratio: 1 };
    const older = view.older.state, newer = view.newer.state, ratio = view.ratio;
    const player = { ...state.player };
    if (this.connected && this.room?.phase === 'playing' && !player.downed) {
      // The suit's dash and jump state rides along so prediction carries a dash through to its end.
      const movement = movementStandIn(state, player);
      for (const packet of this.pending) Simulation.prototype.movePlayer.call(movement, INPUT_TICK, packet.input);
      Simulation.prototype.movePlayer.call(movement, this.elapsed, this.buffer);
    }
    // The magazine counts shots fired here that the server has not confirmed yet.
    player.ammo = Math.max(0, player.ammo - this.predicted.length);
    const actors = key => bufferedActors(state[key], newer[key], older[key], ratio);
    const enemies = actors('enemies');
    const events = this.events.splice(0);
    if (this.queuedShots.length) events.push(...this.predictedShotEvents(state, player, enemies));
    Object.assign(this.view, state, {
      player,
      players: actors('players'),
      enemies,
      projectiles: actors('projectiles'),
      throwables: actors('throwables'),
      drones: actors('drones'),
      events,
    });
    return this.view;
  }
}
