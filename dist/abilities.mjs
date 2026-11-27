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
import { SUIT_HEAD, STANCE, solidGround, solidSpan, surfaceUnder } from './solids.mjs';

// Mantling: a suit in the air that runs into a ledge grabs it and pulls itself up, if the top
// is within this reach of its feet (about 2.4 m from the floor at the top of a jump). It takes
// a moment: up first, then over the edge.
export const MANTLE = Object.freeze({ reach: 1.3, time: .32, perMetre: .16, over: .55 });
// Vaulting: something no taller than `height` above the feet, with ground no higher than a
// step within `depth` beyond its lip, is hopped clean over instead of climbed onto.
export const VAULT = Object.freeze({ height: 1.15, depth: 1.6, time: .42, clear: .2 });
// How high a suit can climb on scenery: a vessel that rises on into the canopy is too steep and
// slick past this, so the suit walks up it this far and no further.
export const CLIMB_CEILING = 4.5;
// Crouching: the eye drops by `drop`, the head by `head` (a crouched suit fits under a vessel run
// too low to walk under), and it moves at `speed` of a walk. A slide (crouch while sprinting
// forward) carries it `speed` m/s, slowing over `time`, and ends crouched.
export const CROUCH = Object.freeze({ drop: .62, head: 1.12, speed: .52, ease: 10 });
export const SLIDE = Object.freeze({ speed: 12.5, end: 4, time: .78, cooldown: .55 });
// Slopes: speed falls by `grade` per unit of rise over run, no lower than `uphill` of a walk on
// the flat and no higher than `downhill`.
export const SLOPE = Object.freeze({ grade: .35, uphill: .7, downhill: 1.12 });
// A footstep every so many metres, walking and running.
export const STEP = Object.freeze({ walk: 1.9, run: 2.6 });

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
    feet: 0, vy: 0, eye: null, airborne: false, crouched: false, crouch: 0, slide: null, slideCooldown: 0,
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
  // Climbing a ledge carries the suit on its own.
  if (state.mantle) return true;
  state.slideCooldown = Math.max(0, state.slideCooldown - dt);
  if (input.crouch && player.health > 0) {
    if (state.slide) state.slide = null;
    else if (!state.airborne && !state.crouched && input.sprint && (input.moveZ || 0) > .5 && state.slideCooldown === 0) {
      // Sprinting forward: drop into a slide.
      const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
      state.slide = { t: 0, x: -sin, z: -cos };
      state.crouched = true;
      sim.events.push({ type: 'slide', playerId: player.id, x: player.x, y: player.y, z: player.z });
    } else if (state.crouched) standUp(sim, suit, state);
    else { state.crouched = true; sim.events.push({ type: 'crouch', playerId: player.id, down: true, x: player.x, y: player.y, z: player.z }); }
  }
  // Sprinting or jumping from a crouch stands the suit up first (if there is room to).
  if (state.crouched && !state.slide && (input.sprint || input.jump) && !standUp(sim, suit, state)) input = { ...input, jump: false };
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

  if (input.jump && !state.airborne && player.health > 0 && !state.crouched) {
    state.slide = null;
    state.vy = ABILITIES.jump.velocity;
    state.airborne = true;
    sim.events.push({ type: 'jump', playerId, x: player.x, y: player.y, z: player.z });
  }

  if (state.slide) {
    // The slide: fast at first, slowing to a crouch walk.
    const slide = state.slide;
    slide.t += dt;
    const k = Math.min(1, slide.t / SLIDE.time);
    const speed = SLIDE.speed + (SLIDE.end - SLIDE.speed) * k * k;
    player.x += slide.x * speed * dt;
    player.z += slide.z * speed * dt;
    if (k >= 1 || state.airborne) { state.slide = null; state.slideCooldown = SLIDE.cooldown; }
    player.sliding = !!state.slide;
    player.dashing = false;
    return true;
  }
  player.sliding = false;
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
  const solids = sim.solids ?? [];
  // The ground under the suit: raised terrain and the solids it stands on (not ones overhead).
  // The body (its full footprint) stops at a wall's surface; it stands on what is under its feet.
  const head = headHeight(state);
  // A sheer edge is met by the body's footprint, so it stops the suit at any frame rate.
  const ground = (x, z, feet = state.feet) => Math.max(terrainUnderFootprint(pieces, x, z, sim.clock ?? 0), solidGround(solids, x, z, feet, undefined, head));
  const footing = (x, z, feet = state.feet) => Math.max(groundHeight(pieces, x, z, sim.clock ?? 0), solidGround(solids, x, z, feet, STANCE, head));
  if (state.mantle) { climbLedge(sim, suit, state, dt); return; }
  // Feet clear an edge only if they are already (nearly) above it.
  const reach = state.feet + (state.airborne ? .05 : STEP_HEIGHT);
  // (A suit that somehow stands inside a solid, say put there by a spawn, may walk out of it.)
  if (ground(player.x, player.z) > reach && ground(fromX, fromZ) <= state.feet + MANTLE.reach) {
    // In the air against a ledge it can reach: grab it and climb.
    if (state.airborne && startMantle(sim, suit, state, fromX, fromZ, footing)) return;
    // Slide along the edge where one axis is still open, otherwise stop at it.
    if (ground(player.x, fromZ) <= reach) player.z = fromZ;
    else if (ground(fromX, player.z) <= reach) player.x = fromX;
    else { player.x = fromX; player.z = fromZ; }
  }
  // No further up a vessel than the climbing ceiling.
  const rise = footing(player.x, player.z);
  if (rise > CLIMB_CEILING && rise > state.feet + .01) { player.x = fromX; player.z = fromZ; }
  // Uphill costs a little speed and downhill gives a little back.
  if (!state.airborne) {
    const moved = Math.hypot(player.x - fromX, player.z - fromZ);
    const slope = moved > 1e-4 ? (footing(player.x, player.z) - state.feet) / moved : 0;
    const keep = Math.max(SLOPE.uphill, Math.min(SLOPE.downhill, 1 - slope * SLOPE.grade));
    if (keep !== 1 && Math.abs(slope) < 2) {
      player.x = fromX + (player.x - fromX) * keep;
      player.z = fromZ + (player.z - fromZ) * keep;
    }
  }
  const floor = footing(player.x, player.z);
  if (!state.airborne && !state.slide && player.health > 0) stride(sim, suit, state, Math.hypot(player.x - fromX, player.z - fromZ), floor, dt);
  if (state.airborne) {
    state.feet += state.vy * dt;
    state.vy -= ABILITIES.jump.gravity * dt;
    if (state.feet <= floor && state.vy <= 0) {
      sim.events.push({ type: 'land', playerId: player.id, speed: -state.vy, x: player.x, y: state.eye + floor, z: player.z });
      state.feet = floor;
      state.vy = 0;
      state.airborne = false;
    }
  } else if (floor < state.feet - STEP_HEIGHT) {
    // Walked off an edge: fall. (Down a slope or a small step it keeps its footing.)
    state.airborne = true;
    state.vy = 0;
  } else state.feet = floor;
  settleStance(player, state, dt);
  player.y = state.eye - state.crouch * CROUCH.drop + state.feet;
  player.lift = state.feet - floor;
  player.feet = state.feet;
}

// Footsteps: one each `length` metres walked (longer strides at a run), on whatever the suit
// stands on, for the audio and teammates' views.
function stride(sim, suit, state, moved, floor, dt) {
  state.stride = (state.stride ?? 0) + moved;
  const length = moved / Math.max(1e-3, dt) > 8 ? STEP.run : STEP.walk;
  if (state.stride < length) return;
  state.stride = 0;
  const { player } = suit;
  sim.events.push({ type: 'step', playerId: player.id, surface: surfaceKind(sim, player, floor, state.feet), crouched: state.crouched, x: player.x, y: player.y, z: player.z });
}

// What the suit is standing on: the artery's vessels, raised plaque, or the tissue floor.
function surfaceKind(sim, player, floor, feet) {
  if (floor < .05) return 'flesh';
  const terrain = groundHeight(sim.terrain ?? [], player.x, player.z, sim.clock ?? 0);
  if (Math.abs(terrain - floor) < .05) return 'plaque';
  const tube = (sim.solids ?? []).some(solid => solid.kind === 'tube' && Math.abs((solidSpan(solid, player.x, player.z, STANCE)?.[1] ?? -9) - floor) < .05);
  return tube ? 'vessel' : 'flesh';
}

// Eases the crouch in and out.
function settleStance(player, state, dt) {
  const target = state.crouched ? 1 : 0;
  state.crouch += (target - state.crouch) * Math.min(1, dt * CROUCH.ease);
  if (Math.abs(target - state.crouch) < .002) state.crouch = target;
  player.crouched = state.crouched;
}

// The highest raised ground under a suit's footprint (its centre and a ring round it).
const RING = [[0, 0], ...Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4) * .3, Math.sin(i * Math.PI / 4) * .3])];
function terrainUnderFootprint(pieces, x, z, time) {
  if (!pieces.length) return 0;
  let height = 0;
  for (const [dx, dz] of RING) height = Math.max(height, groundHeight(pieces, x + dx, z + dz, time));
  return height;
}

// The suit's head height now: lower while crouched.
export const headHeight = state => state.crouched ? CROUCH.head : SUIT_HEAD;

// Stands a crouched suit up if nothing overhead is in the way. Returns true if it stood.
function standUp(sim, suit, state) {
  const { player } = suit;
  const low = solidGround(sim.solids ?? [], player.x, player.z, state.feet, STANCE, CROUCH.head);
  const tall = solidGround(sim.solids ?? [], player.x, player.z, state.feet, STANCE, SUIT_HEAD);
  if (tall > low + .01) return false;
  state.crouched = false;
  state.slide = null;
  sim.events.push({ type: 'crouch', playerId: player.id, down: false, x: player.x, y: player.y, z: player.z });
  return true;
}

// Looks along the suit's move for a ledge it can grab: the top just past the edge it ran into,
// within reach of its feet, with room to stand there. Starts the climb and returns true if so.
function startMantle(sim, suit, state, fromX, fromZ, ground) {
  const { player } = suit;
  const dx = player.x - fromX, dz = player.z - fromZ, length = Math.hypot(dx, dz);
  if (length < 1e-4 || player.health <= 0) return false;
  const nx = dx / length, nz = dz / length;
  const reach = state.feet + MANTLE.reach;
  for (let along = .2; along <= 1.2; along += .1) {
    const x = fromX + nx * along, z = fromZ + nz * along;
    // Judged as if standing at the ledge's height, so a tube overhead is not mistaken for it.
    const top = ground(x, z, reach);
    if (top <= state.feet + STEP_HEIGHT) continue;
    if (top > reach) return false;
    // Stand a little past the lip, on ground that rises no more than a step from there (a top,
    // or a slope it can walk on up).
    const toX = x + nx * MANTLE.over, toZ = z + nz * MANTLE.over;
    const landing = ground(toX, toZ, top);
    if (landing > Math.max(top, state.feet) + STEP_HEIGHT * 1.6 || landing > reach || landing < top - 1) continue;
    const rise = Math.max(top, landing) - state.feet;
    // Waist-high and thin, with open ground just past it: vault clean over.
    const vault = rise <= VAULT.height && vaultLanding(state, ground, x, z, nx, nz, reach);
    state.mantle = vault
      ? { t: 0, time: VAULT.time, fromX, fromZ, toX: vault.x, toZ: vault.z, fromFeet: state.feet, toFeet: vault.feet, peak: vault.peak + VAULT.clear, vault: true }
      : { t: 0, time: MANTLE.time + rise * MANTLE.perMetre, fromX, fromZ, toX, toZ, fromFeet: state.feet, toFeet: Math.max(top, landing) };
    player.x = fromX; player.z = fromZ;
    state.vy = 0;
    sim.events.push({ type: 'mantle', playerId: player.id, rise, vault: !!vault, x: player.x, y: player.y, z: player.z });
    return true;
  }
  return false;
}

// Past a lip at (x, z): the first spot within VAULT.depth whose ground is back within a step of
// the suit's feet, with nothing on the way over taller than it can reach. Null if there is none.
function vaultLanding(state, ground, x, z, nx, nz, reach) {
  let peak = 0;
  for (let along = .1; along <= VAULT.depth; along += .1) {
    const px = x + nx * along, pz = z + nz * along;
    const height = ground(px, pz, reach);
    if (height > reach) return null;
    peak = Math.max(peak, height);
    if (height <= state.feet + STEP_HEIGHT && along > .3) {
      return { x: px + nx * .35, z: pz + nz * .35, feet: ground(px + nx * .35, pz + nz * .35, state.feet + STEP_HEIGHT), peak };
    }
  }
  return null;
}

// Pulls the suit up a ledge: most of the rise first, then over the lip onto the top. A vault
// arcs over the top and down the far side.
function climbLedge(sim, suit, state, dt) {
  const { player } = suit;
  const m = state.mantle;
  m.t = Math.min(m.time, m.t + dt);
  const k = m.t / m.time;
  if (m.vault) {
    // Across at an even pace, over an arc that clears the top.
    const ease = k * k * (3 - 2 * k);
    player.x = m.fromX + (m.toX - m.fromX) * ease;
    player.z = m.fromZ + (m.toZ - m.fromZ) * ease;
    const base = m.fromFeet + (m.toFeet - m.fromFeet) * k;
    state.feet = base + (m.peak - Math.min(m.fromFeet, m.toFeet)) * Math.sin(Math.PI * Math.min(1, k * 1.1));
  } else {
    const up = 1 - (1 - Math.min(1, k / .7)) ** 2;
    const over = Math.max(0, (k - .45) / .55);
    const ease = over * over * (3 - 2 * over);
    player.x = m.fromX + (m.toX - m.fromX) * ease;
    player.z = m.fromZ + (m.toZ - m.fromZ) * ease;
    state.feet = m.fromFeet + (m.toFeet - m.fromFeet) * up;
  }
  if (k >= 1) {
    state.mantle = null;
    state.airborne = false;
    state.vy = 0;
    state.feet = m.toFeet;
    sim.events.push({ type: 'land', playerId: player.id, speed: 1.5, mantle: true, x: player.x, y: state.eye + state.feet, z: player.z });
  }
  player.mantling = !!state.mantle;
  state.crouched = false;
  settleStance(player, state, dt);
  player.y = state.eye - state.crouch * CROUCH.drop + state.feet;
  player.lift = 0;
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
  // Walls only: clots, mounds and vessels are met with height in updateThrowables.
  for (const [x, z, size] of sim.suitWalls ?? sim.obstacles ?? []) {
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
  // What a throwable at height y lands on or runs into: raised ground, and low scenery below it.
  sim.lowSolids ??= (sim.solids ?? []).filter(solid => solid.kind !== 'pillar');
  const surface = (x, z, y) => Math.max(groundHeight(sim.terrain ?? [], x, z, sim.clock), surfaceUnder(sim.lowSolids, x, z, y));
  let count = 0;
  for (const item of sim.throwables) {
    item.age += dt;
    item.fuse -= dt;
    // Something resting on a breathing platform rides it up and down.
    if (item.rest && !item.stuck) {
      const rest = surface(item.x, item.z, item.y) + REST_HEIGHT;
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
      if (surface(item.x, item.z, item.y) > item.y + .1) {
        item.x = fromX;
        item.z = fromZ;
        item.vx *= -.45;
        item.vz *= -.45;
        bounced = true;
      }
      const rest = surface(item.x, item.z, item.y + .4) + REST_HEIGHT;
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
