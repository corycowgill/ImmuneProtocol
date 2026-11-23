import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { COOP_MIN_PLAYERS, COOP_MAX_PLAYERS, CAMPAIGN_AREAS, COOP_SUITS, DEFAULT_COOP_SUIT, COOP_CODE_ALPHABET, COOP_CODE_LENGTH, COOP_NAME_LIMIT, COOP_RECONNECT_MS, COOP_TICK_RATE as TICK_RATE } from '../dist/coop-protocol.mjs';
import { CoopSimulation } from '../dist/coop-simulation.mjs';
import { normalizeWeaponLoadout } from '../dist/weapon-mods.mjs';

const INPUT_TIMEOUT = 750;
const LOBBY_IDLE_LIMIT = 20 * 60_000;
const RESULTS_IDLE_LIMIT = 20 * 60_000;
const MAX_ROOMS = 24;
const MAX_LOOK = 1200;
const EMPTY_INPUT = Object.freeze({});
// One-frame presses a slow tick must not drop.
const TAP_FLAGS = ['jump', 'dash', 'melee', 'grenade', 'stun'];
const INPUT_FLAGS = ['fire', 'aim', 'sprint', 'repair', 'reload', 'deploy', 'carry', 'swap', 'jump', 'dash', 'melee', 'grenade', 'stun'];
const INPUT_AXES = { moveX: 1, moveZ: 1, lookX: MAX_LOOK, lookY: MAX_LOOK };

function clampAxis(value, limit) {
  return Number.isFinite(value) ? Math.max(-limit, Math.min(limit, value)) : 0;
}

function readInput(value) {
  const input = {};
  for (const [axis, limit] of Object.entries(INPUT_AXES)) input[axis] = clampAxis(value[axis], limit);
  for (const flag of INPUT_FLAGS) input[flag] = value[flag] === true;
  return input;
}

function readName(value) {
  if (typeof value !== 'string') return 'Nano soldier';
  const cleaned = value.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, '').trim();
  return Array.from(cleaned).slice(0, COOP_NAME_LIMIT).join('') || 'Nano soldier';
}

function readSuit(value) {
  return COOP_SUITS.includes(value) ? value : DEFAULT_COOP_SUIT;
}

function generateCode() {
  return Array.from({ length: COOP_CODE_LENGTH }, () => COOP_CODE_ALPHABET[randomInt(COOP_CODE_ALPHABET.length)]).join('');
}

function readCode(value) {
  if (typeof value !== 'string') return '';
  const code = value.trim().toUpperCase();
  return code.length === COOP_CODE_LENGTH && Array.from(code).every(char => COOP_CODE_ALPHABET.includes(char)) ? code : '';
}

function send(client, message) {
  if (client?.readyState !== WebSocket.OPEN) return;
  if (client.bufferedAmount > 256_000) client.terminate();
  else client.send(JSON.stringify(message));
}

function error(client, code, message) {
  send(client, { type: 'error', code, message });
}

function resetInput(player) {
  player.input = EMPTY_INPUT;
  player.pending = { lookX: 0, lookY: 0, fire: false, deploy: false, reload: false, swap: false, jump: false, dash: false, melee: false, grenade: false, stun: false };
  player.lastInputAt = 0;
}

export class CoopRooms {
  constructor({ simulation = (players, area) => new CoopSimulation(players, area), graceMs = COOP_RECONNECT_MS } = {}) {
    this.rooms = new Map();
    this.createSimulation = simulation;
    this.graceMs = graceMs;
    this.timer = setInterval(() => this.tick(Date.now()), 1000 / TICK_RATE).unref();
  }

  connect(client) {
    const connection = { client, room: null, player: null, rateStarted: 0, messages: 0 };
    client.alive = true;
    client.on('pong', () => { client.alive = true; });
    client.on('message', (data, isBinary) => {
      try {
        this.message(connection, data, isBinary, Date.now());
      } catch (cause) {
        console.error('Co-op message failed', cause);
        if (connection.room?.simulation) this.endRoom(connection.room, 'MATCH_ERROR', 'The match could not continue. Create a new room to play again.');
        else error(client, 'SERVER_ERROR', 'The server could not complete that request. Try again.');
      }
    });
    client.on('close', () => this.disconnect(connection, Date.now()));
    client.on('error', () => client.terminate());
  }

  message(connection, data, isBinary, now) {
    const { client, room, player } = connection;
    if (now - connection.rateStarted >= 1000) {
      connection.rateStarted = now;
      connection.messages = 0;
    }
    if (++connection.messages > 140) {
      client.close(1008, 'Message rate exceeded');
      return;
    }
    let message;
    try { message = isBinary ? null : JSON.parse(data.toString()); } catch { /* Invalid JSON is a protocol error. */ }
    if (!message || typeof message.type !== 'string') {
      error(client, 'BAD_MESSAGE', 'The game sent an invalid message. Reload and try again.');
      return;
    }
    if (!room) {
      if (message.type === 'create') this.createRoom(connection, message, now);
      else if (message.type === 'join') this.joinRoom(connection, message, now);
      else if (message.type === 'resume') this.resumeRoom(connection, message, now);
      else if (message.type !== 'leave') error(client, 'NO_ROOM', 'Create or join a room first.');
      return;
    }
    switch (message.type) {
      case 'input':
        this.receiveInput(room, player, message, now);
        break;
      case 'ready':
        this.setReady(room, player, message, now);
        break;
      case 'suit':
        this.setSuit(room, player, message, now);
        break;
      case 'supply':
        if (room.phase === 'playing' && room.players.every(entry => entry.connection)) {
          room.simulation.selectJunctionSupply(message.choice);
        }
        break;
      case 'leave':
        this.leave(connection, now);
        break;
      default:
        error(client, 'ALREADY_IN_ROOM', 'Leave this room before joining another one.');
    }
  }

  createRoom(connection, message, now) {
    if (this.rooms.size >= MAX_ROOMS) {
      error(connection.client, 'SERVER_FULL', 'The co-op server is full. Try again in a moment.');
      return;
    }
    let code;
    do { code = generateCode(); } while (this.rooms.has(code));
    const room = {
      code, ownerId: '', players: [], phase: 'lobby', simulation: null, tick: 0, events: [],
      missionIndex: 0, results: [],
      touchedAt: now,
    };
    this.rooms.set(code, room);
    this.addPlayer(room, connection, message, now);
    room.ownerId = room.players[0].id;
    this.publishRoom(room);
  }

  joinRoom(connection, message, now) {
    const room = this.rooms.get(readCode(message.code));
    if (!room) {
      error(connection.client, 'ROOM_NOT_FOUND', 'Room not found. Check the code or ask your friend for a new invite.');
    } else if (room.phase !== 'lobby') {
      error(connection.client, 'ROOM_FULL', 'That match has already started. Join a new lobby.');
    } else if (room.players.length >= COOP_MAX_PLAYERS) {
      error(connection.client, 'ROOM_FULL', 'That room already has three players.');
    } else {
      this.addPlayer(room, connection, message, now);
      this.publishRoom(room);
    }
  }

  addPlayer(room, connection, message, now) {
    const player = {
      id: randomUUID(),
      token: randomBytes(24).toString('base64url'),
      name: readName(message.name),
      weaponLoadout: normalizeWeaponLoadout(message.loadout),
      suit: readSuit(message.suit),
      ready: false,
    };
    room.players.push(player);
    this.bind(room, player, connection, now);
  }

  bind(room, player, connection, now) {
    if (player.connection) {
      player.connection.room = null;
      player.connection.player = null;
      player.connection.client.close(4000, 'Session opened elsewhere');
    }
    player.connection = connection;
    player.disconnectedAt = null;
    player.sequence = 0;
    player.ack = 0;
    resetInput(player);
    connection.room = room;
    connection.player = player;
    room.touchedAt = now;
    send(connection.client, { type: 'session', code: room.code, id: player.id, token: player.token });
  }

  resumeRoom(connection, message, now) {
    const room = this.rooms.get(readCode(message.code));
    const player = room?.players.find(entry => entry.token === message.token);
    if (!player || (player.disconnectedAt !== null && now - player.disconnectedAt >= this.graceMs)) {
      error(connection.client, 'SESSION_EXPIRED', 'That seat expired. Ask for a new invite.');
      return;
    }
    this.bind(room, player, connection, now);
    this.publishRoom(room);
    if (room.simulation) this.publishState(room, player, []);
  }

  leave(connection, now) {
    const { room, player } = connection;
    if (room.phase === 'playing') {
      connection.room = null;
      connection.player = null;
      player.connection = null;
      this.endRoom(room, 'PARTNER_LEFT', 'Your teammate left the match. Create a new room to play again.');
      return;
    }
    this.removePlayer(room, player, now);
  }

  disconnect(connection, now) {
    const { room, player } = connection;
    if (!room || player.connection !== connection) return;
    connection.room = null;
    connection.player = null;
    player.connection = null;
    player.disconnectedAt = now;
    player.ready = false;
    resetInput(player);
    if (room.phase === 'playing') {
      for (const teammate of room.players) {
        teammate.ack = teammate.sequence;
        resetInput(teammate);
      }
    }
    this.publishRoom(room);
  }

  removePlayer(room, player, now) {
    if (player.connection) {
      player.connection.room = null;
      player.connection.player = null;
      player.connection = null;
    }
    room.players.splice(room.players.indexOf(player), 1);
    if (!room.players.length) {
      this.rooms.delete(room.code);
      return;
    }
    room.touchedAt = now;
    if (room.ownerId === player.id) room.ownerId = room.players[0].id;
    if (room.phase === 'finished') {
      room.phase = 'lobby';
      room.simulation = null;
      room.missionIndex = 0;
      room.results = [];
    }
    for (const remaining of room.players) remaining.ready = false;
    this.publishRoom(room);
  }

  setSuit(room, player, message, now) {
    // Suits are chosen in the lobby or at the mission checkpoint, never mid-deployment.
    if (room.phase !== 'lobby' && room.phase !== 'finished') return;
    if (!COOP_SUITS.includes(message.suit) || message.suit === player.suit) return;
    player.suit = message.suit;
    room.touchedAt = now;
    this.publishRoom(room);
  }

  setReady(room, player, message, now) {
    if (room.phase === 'playing' || typeof message.ready !== 'boolean') return;
    if (message.loadout && typeof message.loadout === 'object') {
      player.weaponLoadout = normalizeWeaponLoadout(message.loadout);
    }
    room.touchedAt = now;
    player.ready = message.ready;
    if (room.players.length >= COOP_MIN_PLAYERS && room.players.length <= COOP_MAX_PLAYERS && room.players.every(entry => entry.connection && entry.ready)) {
      this.startMatch(room);
    } else {
      this.publishRoom(room);
    }
  }

  startMatch(room) {
    // After a loss the squad retries from the start of the wave it lost, not the whole mission.
    const lost = room.phase === 'finished' && room.simulation?.phase === 'lost' ? room.simulation.checkpoint : null;
    const checkpoint = lost && (lost.wave > 1 || lost.stage === 'airway') ? lost : null;
    if (room.phase === 'finished' && room.simulation.phase === 'won') {
      room.missionIndex = (room.missionIndex + 1) % CAMPAIGN_AREAS.length;
      if (room.missionIndex === 0) room.results = [];
    }
    const participants = room.players.map(({ id, name, weaponLoadout, suit }) => ({ id, name, weaponLoadout, suit }));
    room.simulation = this.createSimulation(participants, CAMPAIGN_AREAS[room.missionIndex]);
    room.simulation.start(checkpoint);
    room.tick = 0;
    room.events = [...room.simulation.events];
    this.continueMatch(room);
  }

  continueMatch(room) {
    room.phase = 'playing';
    for (const player of room.players) {
      player.ready = false;
      player.ack = player.sequence;
      resetInput(player);
    }
    this.publishRoom(room);
    this.publishStates(room);
  }

  receiveInput(room, player, message, now) {
    if (room.phase !== 'playing' || room.players.some(entry => !entry.connection) ||
        !Number.isSafeInteger(message.seq) || message.seq <= player.sequence ||
        !message.input || typeof message.input !== 'object' || Array.isArray(message.input)) return;
    const input = readInput(message.input);
    player.input = input;
    player.sequence = message.seq;
    player.lastInputAt = now;
    player.pending.lookX = clampAxis(player.pending.lookX + input.lookX, MAX_LOOK);
    player.pending.lookY = clampAxis(player.pending.lookY + input.lookY, MAX_LOOK);
    player.pending.reload ||= input.reload;
    player.pending.deploy ||= input.deploy;
    for (const tap of TAP_FLAGS) player.pending[tap] ||= input[tap];
    player.pending.swap ||= input.swap;
    player.pending.fire ||= input.fire;
  }

  consumeInput(player, now) {
    if (now - player.lastInputAt > INPUT_TIMEOUT) resetInput(player);
    const { input, pending } = player;
    const turn = { ...input, ...pending, fire: input.fire || pending.fire };
    player.pending = { lookX: 0, lookY: 0, fire: false, deploy: false, reload: false, swap: false, jump: false, dash: false, melee: false, grenade: false, stun: false };
    player.ack = player.sequence;
    return turn;
  }

  tick(now) {
    for (const room of this.rooms.values()) {
      try {
        this.advance(room, now);
      } catch (cause) {
        console.error('Co-op match failed', cause);
        this.endRoom(room, 'MATCH_ERROR', 'The match could not continue. Create a new room to play again.');
      }
    }
  }

  advance(room, now) {
    const expired = room.players.filter(player => !player.connection && now - player.disconnectedAt >= this.graceMs);
    if (room.phase === 'lobby' || room.phase === 'finished') {
      const idleLimit = room.phase === 'lobby' ? LOBBY_IDLE_LIMIT : RESULTS_IDLE_LIMIT;
      if (now - room.touchedAt >= idleLimit) this.endRoom(room, 'ROOM_EXPIRED', 'The room expired. Create a new room to play again.');
      else for (const player of expired) this.removePlayer(room, player, now);
      return;
    }
    if (expired.length) {
      this.endRoom(room, 'PARTNER_LEFT', 'Your teammate did not reconnect. Create a new room to play again.');
      return;
    }
    if (room.players.some(player => !player.connection)) return;

    const sim = room.simulation;
    const inputs = Object.fromEntries(room.players.map(player => [player.id, this.consumeInput(player, now)]));
    sim.step(1 / TICK_RATE, inputs);
    room.tick++;
    room.events.push(...sim.events);
    if (sim.phase === 'won' || sim.phase === 'lost') {
      if (sim.phase === 'won') {
        const { area, tissue, score, kills } = sim;
        const nodes = sim.nodes.map(({ name, health }) => ({ name, health }));
        const players = sim.players.map(({ id, name, score, kills }) => ({ id, name, score, kills }));
        room.results.push({ area, tissue, score, kills, nodes, players });
      }
      room.phase = 'finished';
      room.touchedAt = now;
      this.publishRoom(room);
      this.publishStates(room);
    } else if (room.tick % 2 === 0) {
      this.publishStates(room);
    }
  }

  publishRoom(room) {
    const disconnected = room.players.filter(player => !player.connection);
    const message = {
      type: 'room', code: room.code, phase: room.phase, ownerId: room.ownerId,
      players: room.players.map(({ id, name, ready, connection, suit, weaponLoadout }) => ({
        id, name, ready, connected: !!connection, suit, weaponLoadout,
      })),
      missionIndex: room.missionIndex,
      results: room.results,
    };
    if (room.phase === 'finished' && room.simulation.phase === 'won') {
      message.nextArea = CAMPAIGN_AREAS[room.missionIndex + 1] ?? null;
    }
    if (disconnected.length) message.reconnectDeadline = Math.min(...disconnected.map(player => player.disconnectedAt + this.graceMs));
    for (const player of room.players) send(player.connection?.client, message);
  }

  publishStates(room) {
    const events = room.events.splice(0);
    for (const player of room.players) if (player.connection) this.publishState(room, player, events);
  }

  publishState(room, player, events) {
    const state = room.simulation.snapshotFor(player.id);
    delete state.events;
    send(player.connection.client, { type: 'state', tick: room.tick, ack: player.ack, state, events });
  }

  endRoom(room, code, message) {
    this.rooms.delete(room.code);
    for (const player of room.players) {
      const connection = player.connection;
      if (!connection) continue;
      connection.room = null;
      connection.player = null;
      player.connection = null;
      error(connection.client, code, message);
    }
  }

  close() {
    clearInterval(this.timer);
    this.rooms.clear();
  }
}
