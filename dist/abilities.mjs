// The suit's moves beyond walking and shooting: a dash with a dodge window, a jump, a melee bash
// that tears latched pathogens off, and two throwables (the antibody grenade and the stun charge).
// Pure simulation: the Simulation calls these with itself and the suit acting (in solo play the
// Simulation is its own suit), and everything the renderer and audio need goes out as events.

export const ABILITIES = Object.freeze({
  // 5.4 m in a fifth of a second. Hits that land in the guard window are dodged outright.
  dash: Object.freeze({ speed: 27, time: .2, cooldown: 1.1, guard: .3 }),
  // A little over a metre of air: hop a crawler, a low ridge, or onto a plaque shelf.
  jump: Object.freeze({ velocity: 6.6, gravity: 19, airControl: .85 }),
  melee: Object.freeze({ cooldown: .72, reach: 3.2, arc: Math.cos(1.05), damage: 36, push: 4.4, stagger: 1.15, tissueReach: 4.2, strike: .1 }),
  grenade: Object.freeze({ carry: 2, max: 3, fuse: 1.45, radius: 6, damage: 150, speed: 17, lift: 3.2 }),
  stun: Object.freeze({ carry: 1, max: 2, fuse: 1, radius: 7, time: 3.2, damage: 12, speed: 15, lift: 3 }),
  throwCooldown: .55,
});

import { releaseCling } from './grip-phage.mjs';
import { STEP_HEIGHT, groundHeight } from './terrain.mjs';

const GRAVITY = 22;
const KNOCK_DECAY = 8;

// Carries a bashed pathogen along its knockback while it is staggered.
export function knockBack(sim, enemy, dt) {
  if (!enemy.knockVX && !enemy.knockVZ) return;
  enemy.x += enemy.knockVX * dt;
  enemy.z += enemy.knockVZ * dt;
  const keep = Math.exp(-KNOCK_DECAY * dt);
  enemy.knockVX *= keep;
  enemy.knockVZ *= keep;
  if (Math.hypot(enemy.knockVX, enemy.knockVZ) < .2) enemy.knockVX = enemy.knockVZ = 0;
  sim.skirtObstacles?.(enemy);
  sim.confineToArena(enemy);
}
const REST_HEIGHT = .14;

// Per-suit ability state, created on first use so checkpoints and co-op suits need no setup.
export function abilityState(suit) {
  return suit.ability ??= {
    dashCooldown: 0, dashTime: 0, dashX: 0, dashZ: 0,
    feet: 0, vy: 0, eye: null, airborne: false,
    meleeCooldown: 0, meleeStrike: 0, throwCooldown: 0,
    grenades: ABILITIES.grenade.carry, stuns: ABILITIES.stun.carry,
  };
}

// Throwables restock at every wave start, up to the carry count (more if a cache topped up).
export function restockThrowables(suit) {
  const state = abilityState(suit);
  state.grenades = Math.max(state.grenades, ABILITIES.grenade.carry);
  state.stuns = Math.max(state.stuns, ABILITIES.stun.carry);
}

// Runs inside movement. Returns true while a dash is carrying the suit (normal steering is off).
export function moveAbilities(sim, suit, input, dt) {
  const { player } = suit;
  const state = abilityState(suit);
  state.eye ??= player.y;
  state.dashCooldown = Math.max(0, state.dashCooldown - dt);
  const playerId = player.id;

  if (input.dash && state.dashCooldown === 0 && state.dashTime === 0 && player.health > 0) {
    // Dash the way the stick or keys point; with no direction held, dash backwards out of trouble.
    let strafe = input.moveX || 0;
    let forward = input.moveZ || 0;
    if (Math.hypot(strafe, forward) < .2) { strafe = 0; forward = -1; }
    const length = Math.hypot(strafe, forward);
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    state.dashX = (strafe * cos - forward * sin) / length;
    state.dashZ = -(strafe * sin + forward * cos) / length;
    state.dashTime = ABILITIES.dash.time;
    state.dashCooldown = ABILITIES.dash.cooldown;
    player.guardUntil = sim.clock + ABILITIES.dash.guard;
    sim.events.push({ type: 'dash', playerId, side: strafe / length, forward: forward / length, x: player.x, y: player.y, z: player.z });
  }

  if (input.jump && !state.airborne && player.health > 0) {
    state.vy = ABILITIES.jump.velocity;
    state.airborne = true;
    sim.events.push({ type: 'jump', playerId, x: player.x, y: player.y, z: player.z });
  }

  if (state.dashTime > 0) {
    const step = Math.min(dt, state.dashTime);
    state.dashTime = Math.max(0, state.dashTime - dt);
    player.x += state.dashX * ABILITIES.dash.speed * step;
    player.z += state.dashZ * ABILITIES.dash.speed * step;
    player.dashing = state.dashTime > 0;
    return true;
  }
  player.dashing = false;
  return false;
}

// Runs after the suit's horizontal move (walk or dash) from (fromX, fromZ): sheer edges taller
// than a step stop it, it walks up ramps and small steps, falls off edges, and lands on tops.
export function settleOnTerrain(sim, suit, fromX, fromZ, dt) {
  const { player } = suit;
  const state = abilityState(suit);
  state.eye ??= player.y;
  const pieces = sim.terrain ?? [];
  const ground = (x, z) => groundHeight(pieces, x, z, sim.clock ?? 0);
  // Feet clear an edge only if they are already (nearly) above it.
  const reach = state.feet + (state.airborne ? .05 : STEP_HEIGHT);
  if (ground(player.x, player.z) > reach) {
    // Slide along the edge where one axis is still open, otherwise stop at it.
    if (ground(player.x, fromZ) <= reach) player.z = fromZ;
    else if (ground(fromX, player.z) <= reach) player.x = fromX;
    else { player.x = fromX; player.z = fromZ; }
  }
  const floor = ground(player.x, player.z);
  if (state.airborne) {
    state.feet += state.vy * dt;
    state.vy -= ABILITIES.jump.gravity * dt;
    if (state.feet <= floor && state.vy <= 0) {
      sim.events.push({ type: 'land', playerId: player.id, speed: -state.vy, x: player.x, y: state.eye + floor, z: player.z });
      state.feet = floor;
      state.vy = 0;
      state.airborne = false;
    }
  } else if (floor < state.feet - .12) {
    // Walked off an edge: fall.
    state.airborne = true;
    state.vy = 0;
  } else state.feet = floor;
  player.y = state.eye + state.feet;
  player.lift = state.feet - floor;
  player.feet = state.feet;
}

// A hit that lands inside the dash's guard window is dodged. Returns true if it was.
export function dodges(sim, player, origin) {
  if (!(player.guardUntil > sim.clock)) return false;
  sim.events.push({ type: 'dodge', playerId: player.id, x: player.x, y: player.y, z: player.z, fromX: origin?.x, fromZ: origin?.z });
  return true;
}

const pushable = enemy => !enemy.boss && !enemy.segmentOf && !enemy.nest && enemy.type !== 'colony';

// Knocks a pathogen out of whatever it was doing: off the tissue it held, out of a windup.
function interrupt(sim, enemy, seconds) {
  if (!pushable(enemy)) return;
  // A Grip Phage clinging to a suit is torn off it as well as anything latched onto tissue.
  const tearing = enemy.latched || enemy.attackingTissue || enemy.action === 'cling';
  if (enemy.action === 'cling') releaseCling(sim, enemy, 'torn');
  enemy.latched = false;
  enemy.attackingTissue = false;
  if (enemy.action !== 'idle') sim.setEnemyAction(enemy, 'idle');
  enemy.attackCooldown = Math.max(enemy.attackCooldown ?? 0, seconds);
  enemy.stunRemaining = Math.max(enemy.stunRemaining ?? 0, seconds * .5);
  return tearing;
}

export function useMelee(sim, suit, input, dt) {
  const { player } = suit;
  const state = abilityState(suit);
  state.meleeCooldown = Math.max(0, state.meleeCooldown - dt);
  if (!input.melee || state.meleeCooldown > 0 || player.health <= 0) return;
  state.meleeCooldown = ABILITIES.melee.cooldown;
  const { reach, arc, damage, push, stagger, tissueReach } = ABILITIES.melee;
  const forwardX = -Math.sin(player.yaw);
  const forwardZ = -Math.cos(player.yaw);
  const hits = [];
  for (const enemy of [...sim.enemies]) {
    if (enemy.hidden || enemy.type === 'colony' || (enemy.tutorial && sim.tutorial === 'observe')) continue;
    const dx = enemy.x - player.x;
    const dz = enemy.z - player.z;
    const distance = Math.hypot(dx, dz);
    const gap = distance - (enemy.radius ?? .8);
    const facing = distance < 1e-3 ? 1 : (dx * forwardX + dz * forwardZ) / distance;
    // In the swing's arc, or tearing at tissue right beside the suit.
    const latchedNearby = (enemy.latched || enemy.attackingTissue || enemy.action === 'cling') && distance <= tissueReach;
    if (!(gap <= reach && facing >= arc) && !latchedNearby) continue;
    hits.push({ enemy, dx, dz, distance });
  }
  const freed = [];
  for (const { enemy, dx, dz, distance } of hits) {
    const point = { x: enemy.x, y: enemy.y, z: enemy.z };
    if (interrupt(sim, enemy, stagger)) freed.push(enemy.id);
    if (pushable(enemy)) {
      const awayX = distance < 1e-3 ? forwardX : dx / distance;
      const awayZ = distance < 1e-3 ? forwardZ : dz / distance;
      // Thrown back over the next few tenths of a second (see knockBack), not teleported.
      enemy.knockVX = awayX * push * KNOCK_DECAY;
      enemy.knockVZ = awayZ * push * KNOCK_DECAY;
    }
    sim.hitEnemy(enemy, damage, false, point, 'melee', suit);
  }
  sim.events.push({
    type: 'melee', playerId: player.id, hits: hits.length, freed: freed.length,
    x: player.x, y: player.y, z: player.z, targets: hits.map(({ enemy }) => ({ x: enemy.x, y: enemy.y, z: enemy.z })),
  });
  if (hits.length) sim.ai?.emit?.('combat', player, { owner: -1, radius: 14 });
}

export function throwItems(sim, suit, input, dt) {
  const { player } = suit;
  const state = abilityState(suit);
  state.throwCooldown = Math.max(0, state.throwCooldown - dt);
  const kind = input.grenade ? 'grenade' : input.stun ? 'stun' : null;
  if (!kind || state.throwCooldown > 0 || player.health <= 0) return;
  const key = kind === 'grenade' ? 'grenades' : 'stuns';
  if (state[key] <= 0) {
    sim.events.push({ type: 'throw', stage: 'empty', kind, playerId: player.id, x: player.x, y: player.y, z: player.z });
    return;
  }
  state[key] -= 1;
  state.throwCooldown = ABILITIES.throwCooldown;
  const spec = ABILITIES[kind];
  const pitch = player.pitch ?? 0;
  const forwardX = -Math.sin(player.yaw) * Math.cos(pitch);
  const forwardZ = -Math.cos(player.yaw) * Math.cos(pitch);
  const up = Math.sin(pitch);
  sim.throwables ??= [];
  sim.nextThrowableId = (sim.nextThrowableId ?? 0) + 1;
  const item = {
    id: sim.nextThrowableId, kind, owner: suit, fuse: spec.fuse, age: 0, rest: false,
    x: player.x + forwardX * .55 - Math.cos(player.yaw) * .25, y: player.y - .2, z: player.z + forwardZ * .55 + Math.sin(player.yaw) * .25,
    vx: forwardX * spec.speed, vy: up * spec.speed + spec.lift, vz: forwardZ * spec.speed,
    spin: 0,
  };
  sim.throwables.push(item);
  sim.events.push({ type: 'throw', stage: 'release', kind, id: item.id, playerId: player.id, x: item.x, y: item.y, z: item.z });
}

function bounceOff(sim, item) {
  let bounced = false;
  for (const [x, z, size] of sim.obstacles ?? []) {
    const dx = item.x - x;
    const dz = item.z - z;
    const gap = Math.hypot(dx, dz);
    if (gap >= size || gap < 1e-4) continue;
    const nx = dx / gap;
    const nz = dz / gap;
    item.x = x + nx * size;
    item.z = z + nz * size;
    const along = item.vx * nx + item.vz * nz;
    if (along < 0) {
      item.vx = (item.vx - 2 * along * nx) * .55;
      item.vz = (item.vz - 2 * along * nz) * .55;
      bounced = true;
    }
  }
  const before = { x: item.x, z: item.z };
  sim.confineToArena(item);
  if (Math.abs(before.x - item.x) + Math.abs(before.z - item.z) > 1e-6) {
    // Off the chamber wall: send it back toward the middle.
    const nx = -item.x;
    const nz = -item.z;
    const length = Math.hypot(nx, nz) || 1;
    const along = (item.vx * nx + item.vz * nz) / length;
    if (along < 0) {
      item.vx = (item.vx - 2 * along * nx / length) * .5;
      item.vz = (item.vz - 2 * along * nz / length) * .5;
      bounced = true;
    }
  }
  return bounced;
}

export function updateThrowables(sim, dt) {
  if (!sim.throwables?.length) return;
  let count = 0;
  for (const item of sim.throwables) {
    item.age += dt;
    item.fuse -= dt;
    // Something resting on a breathing platform rides it up and down.
    if (item.rest && !item.stuck) {
      const rest = groundHeight(sim.terrain ?? [], item.x, item.z, sim.clock) + REST_HEIGHT;
      if (Math.abs(rest - item.y) > .005) item.y = rest;
    }
    if (!item.rest) {
      item.vy -= GRAVITY * dt;
      const fromX = item.x;
      const fromZ = item.z;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.z += item.vz * dt;
      item.spin += dt * Math.hypot(item.vx, item.vz) * 1.6;
      let bounced = bounceOff(sim, item);
      // Struck the side of raised ground: knock it back off the edge.
      const pieces = sim.terrain ?? [];
      if (groundHeight(pieces, item.x, item.z, sim.clock) > item.y + .1) {
        item.x = fromX;
        item.z = fromZ;
        item.vx *= -.45;
        item.vz *= -.45;
        bounced = true;
      }
      const rest = groundHeight(pieces, item.x, item.z, sim.clock) + REST_HEIGHT;
      if (item.y < rest) {
        const impact = -item.vy;
        item.y = rest;
        item.vy = impact * .38;
        item.vx *= .6;
        item.vz *= .6;
        bounced ||= impact > 2.2;
        if (item.vy < 1.1 && Math.hypot(item.vx, item.vz) < .5) {
          item.rest = true;
          item.vx = item.vy = item.vz = 0;
        }
      }
      if (bounced) sim.events.push({ type: 'throw', stage: 'bounce', kind: item.kind, id: item.id, x: item.x, y: item.y, z: item.z });
      // An antibody grenade bursts on contact with a pathogen; the stun charge sticks and waits.
      const struck = sim.enemies.find(enemy => !enemy.hidden && enemy.type !== 'colony' &&
        Math.hypot(enemy.x - item.x, enemy.y - item.y, enemy.z - item.z) < (enemy.radius ?? .8) + .2);
      if (struck && item.age > .08) {
        if (item.kind === 'grenade') item.fuse = 0;
        else if (!item.stuck) {
          item.stuck = struck.id;
          item.rest = true;
          item.fuse = Math.min(item.fuse, .35);
        }
      }
    }
    if (item.stuck) {
      const host = sim.enemies.find(enemy => enemy.id === item.stuck);
      if (host) Object.assign(item, { x: host.x, y: host.y, z: host.z });
    }
    if (item.fuse <= 0) detonate(sim, item);
    else sim.throwables[count++] = item;
  }
  sim.throwables.length = count;
}

function detonate(sim, item) {
  const spec = ABILITIES[item.kind];
  const center = { x: item.x, y: Math.max(item.y, .4), z: item.z };
  sim.ai?.emit?.('explosion', center, { radius: 40 });
  if (item.kind === 'grenade') {
    sim.events.push({ type: 'explosion', kind: 'antibody', radius: spec.radius, ...center });
    for (const enemy of [...sim.enemies]) {
      if (!sim.enemies.includes(enemy) || enemy.hidden || (enemy.tutorial && sim.tutorial === 'observe')) continue;
      if (sim.valve && sim.shielded?.(enemy, center)) continue;
      const gap = Math.max(0, Math.hypot(enemy.x - center.x, enemy.y - center.y, enemy.z - center.z) - (enemy.radius ?? .8));
      if (gap > spec.radius) continue;
      const point = { x: enemy.x, y: enemy.y, z: enemy.z };
      // The blast throws smaller pathogens off whatever they were holding.
      if (gap < spec.radius * .6) interrupt(sim, enemy, .8);
      sim.hitEnemy(enemy, spec.damage * (1 - .6 * gap / spec.radius), false, point, 'grenade', item.owner);
    }
    return;
  }
  const stunned = [];
  for (const enemy of [...sim.enemies]) {
    if (!sim.enemies.includes(enemy) || enemy.hidden) continue;
    const gap = Math.max(0, Math.hypot(enemy.x - center.x, enemy.z - center.z) - (enemy.radius ?? .8));
    if (gap > spec.radius) continue;
    if (pushable(enemy)) {
      interrupt(sim, enemy, spec.time);
      enemy.stunRemaining = spec.time;
    } else enemy.slowRemaining = Math.max(enemy.slowRemaining ?? 0, spec.time);
    stunned.push({ id: enemy.id, x: enemy.x, y: enemy.y, z: enemy.z });
    sim.hitEnemy(enemy, spec.damage, false, { x: enemy.x, y: enemy.y, z: enemy.z }, 'stun', item.owner);
  }
  sim.events.push({ type: 'stun', radius: spec.radius, time: spec.time, stunned, ...center, ...(item.owner?.id != null ? { playerId: item.owner.id } : {}) });
}

// For co-op snapshots: the throwables in flight, without their owning suit objects.
export function snapshotThrowables(sim) {
  return (sim.throwables ?? []).map(({ owner, ...item }) => ({ ...item, ownerId: owner?.player?.id ?? null }));
}
