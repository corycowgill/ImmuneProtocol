import { Simulation } from './simulation.mjs';
import { ORGAN_MISSIONS } from './organs.mjs';
import { attachLobby } from './coop-lobby.mjs';
import { savedSuit } from './suits.mjs';
import { COOP_PATH, COOP_HEALTH_PATH, COOP_PROTOCOL_VERSION, COOP_RECONNECT_MS, COOP_SERVICE, COOP_TICK_RATE } from './coop-protocol.mjs';
import { terrainFor } from './terrain.mjs';

// One-frame presses held until the next input packet, so a quick tap is never lost.
const TAPS = ['jump', 'dash', 'melee', 'grenade', 'stun'];

export const PUBLIC_COOP_ORIGIN = 'https://immune-protocol-coop.onrender.com';

const INPUT_TICK = 1 / COOP_TICK_RATE;
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
  state.organMission = ORGAN_MISSIONS[state.area];
  for (const enemy of state.enemies) {
    if (enemy.nodeId) enemy.node = state.nodes.find(node => node.id === enemy.nodeId);
  }
  return state;
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
    this.previous = null;
    this.view = null;
    this.events = [];
    this.weaponLoadout = null;
    this.seq = 0;
    this.pending = [];
    this.buffer = emptyInput();
    this.elapsed = 0;
    this.repairingSound = false;
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
        if (message.phase !== 'playing' || message.reconnectDeadline) {
          this.pending.length = 0;
          this.buffer = emptyInput();
          this.elapsed = 0;
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
        this.previous = this.latest;
        this.latest = { state, receivedAt: now };
        this.pending = this.pending.filter(packet => packet.seq > message.ack);
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

  setSuit(suit) {
    return this.connected && this.send({ type: 'suit', suit });
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
    if (!this.connected || this.room?.phase !== 'playing' || this.room.reconnectDeadline) return;
    this.buffer = {
      ...input,
      lookX: this.buffer.lookX + input.lookX,
      lookY: this.buffer.lookY + input.lookY,
      fire: this.buffer.fire || input.fire,
      reload: this.buffer.reload || input.reload,
      deploy: this.buffer.deploy || input.deploy,
      swap: this.buffer.swap || input.swap,
      ...Object.fromEntries(TAPS.map(tap => [tap, !!(this.buffer[tap] || input[tap])])),
    };
    this.elapsed += dt;
    while (this.elapsed >= INPUT_TICK) {
      this.elapsed -= INPUT_TICK;
      const packet = { type: 'input', seq: ++this.seq, input: this.buffer };
      if (this.send(packet)) {
        this.pending.push(packet);
        if (this.pending.length > MAX_PENDING) this.pending.shift();
      }
      this.buffer = { ...input, lookX: 0, lookY: 0, deploy: false, swap: false, ...Object.fromEntries(TAPS.map(tap => [tap, false])) };
    }
  }

  frame(dt, input, now) {
    if (!this.latest) return null;
    this.advanceInput(dt, input);
    const { state, receivedAt } = this.latest;
    const older = this.previous?.state;
    const span = Math.max(30, Math.min(100, receivedAt - (this.previous?.receivedAt ?? receivedAt)));
    const ratio = Math.min(1, Math.max(0, (now - receivedAt) / span));
    const player = { ...state.player };
    if (this.connected && this.room?.phase === 'playing' && !this.room.reconnectDeadline && !player.downed) {
      const { weapon, valve, organ, organMission } = state;
      // The suit's dash and jump state rides along so prediction carries a dash through to its end.
      const movement = { player, weapon, valve, organ, organMission, events: [], clock: state.clock, terrain: terrainFor(state.area),
        ability: state.ability ? { ...state.ability } : undefined, confineToArena: Simulation.prototype.confineToArena };
      for (const packet of this.pending) Simulation.prototype.movePlayer.call(movement, INPUT_TICK, packet.input);
      Simulation.prototype.movePlayer.call(movement, this.elapsed, this.buffer);
    }
    const events = this.events.splice(0);
    Object.assign(this.view, state, {
      player,
      players: blendActors(state.players, older?.players, ratio),
      enemies: blendActors(state.enemies, older?.enemies, ratio),
      projectiles: blendActors(state.projectiles, older?.projectiles, ratio),
      throwables: blendActors(state.throwables ?? [], older?.throwables, ratio),
      drones: blendActors(state.drones ?? [], older?.drones, ratio),
      events,
    });
    return this.view;
  }
}
