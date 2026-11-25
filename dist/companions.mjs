// Nano companions. Every suit brings one: the auto-turret (simulation.mjs places, carries and fires
// it) or the medic drone here. The drone hovers at its suit's shoulder and mends, a little at a
// time, whichever suit or tissue node in its field has lost the most. It can be stationed over a
// spot (the turret control) and called back the same way. It never fights, cannot be hurt, and
// in the Inner Ear the resonance jams it exactly as it jams a turret on the floor.
import { DRONE_BASE, droneStats, normalizeCompanion, normalizeDroneBuild } from './weapon-mods.mjs';
import { RESONANCE_CLEARANCE, groundHeight } from './terrain.mjs';

export const DRONE_RULES = Object.freeze({
  hover: 2.1, // metres above the ground beneath it
  follow: { side: 1.15, back: .85 }, // where it rides relative to its suit's view
  retarget: .5, // seconds between choosing who to mend
  catchUp: 4.5, // how sharply it closes on its anchor
  teleport: 30, // farther than this behind its suit and it skips ahead (a respawn, a checkpoint)
  scorePerPoint: 8, // tissue it mends scores like a sealer repair
  calm: 2, // seconds a suit must go without losing health before a drone mends it
});

const TISSUE = 100;
const HEALTH = 100;

export function companionOf(suit) {
  return normalizeCompanion(suit.weaponLoadout?.arsenal?.companion);
}

// A fresh drone at its suit's shoulder, or null when the suit brings the turret.
export function createDrone(sim, suit) {
  if (companionOf(suit) !== 'drone') return null;
  const build = normalizeDroneBuild(suit.weaponLoadout?.arsenal?.drone);
  const drone = {
    ownerId: suit.player.id ?? null, build, stats: droneStats(build), mode: 'follow', station: null,
    x: suit.player.x, y: 0, z: suit.player.z, yaw: suit.player.yaw ?? 0, targetKind: null, targetId: null,
    targetX: 0, targetY: 0, targetZ: 0, retarget: 0, jammed: false, healed: 0, scoreBank: 0,
  };
  placeAtAnchor(sim, drone, suit);
  return drone;
}

function anchorFor(sim, drone, suit) {
  if (drone.mode === 'station' && drone.station) return drone.station;
  const { player } = suit;
  const yaw = player.yaw ?? 0;
  // The view looks along (-sin yaw, -cos yaw); ride over the right shoulder, a little behind.
  const { side, back } = DRONE_RULES.follow;
  return { x: player.x + Math.cos(yaw) * side + Math.sin(yaw) * back, z: player.z - Math.sin(yaw) * side + Math.cos(yaw) * back };
}

function placeAtAnchor(sim, drone, suit) {
  const anchor = anchorFor(sim, drone, suit);
  drone.x = anchor.x;
  drone.z = anchor.z;
  drone.y = hoverHeight(sim, drone.x, drone.z);
}

function hoverHeight(sim, x, z) {
  return groundHeight(sim.terrain ?? [], x, z, sim.clock) + DRONE_RULES.hover;
}

// The turret control: station the drone where it is, or call a stationed drone back.
export function toggleDrone(sim, suit) {
  const drone = suit.drone;
  if (!drone || suit.player.health <= 0) return false;
  if (drone.mode === 'follow') {
    drone.mode = 'station';
    drone.station = { x: drone.x, z: drone.z };
  } else {
    drone.mode = 'follow';
    drone.station = null;
  }
  const event = { type: 'drone', stage: drone.mode === 'station' ? 'stationed' : 'following', x: drone.x, y: drone.y, z: drone.z };
  if (suit.player.id != null) event.playerId = suit.player.id;
  sim.events.push(event);
  return true;
}

function within(drone, x, z, radius) {
  return (drone.x - x) ** 2 + (drone.z - z) ** 2 <= radius * radius;
}

// The suit or node in the field that has lost the most (suits win ties), or null.
function chooseTarget(sim, drone) {
  const { radius } = drone.stats;
  let best = null;
  let need = 0;
  for (const suit of sim.activeSuits()) {
    const { player } = suit;
    if (player.health <= 0 || player.health >= HEALTH || !within(drone, player.x, player.z, radius) || hurting(sim, player)) continue;
    const lost = (HEALTH - player.health) / HEALTH;
    if (lost > need) {
      need = lost;
      best = { kind: 'suit', suit };
    }
  }
  for (const node of sim.nodes) {
    if (node.health <= 0 || node.health >= TISSUE || !within(drone, node.x, node.z, radius) || !mendable(sim, node)) continue;
    const lost = (TISSUE - node.health) / TISSUE;
    if (lost > need) {
      need = lost;
      best = { kind: 'node', node };
    }
  }
  return best;
}

// The same rules as a sealer: not through a neural overload, and a heart wound only while its
// valve is shut.
function mendable(sim, node) {
  if (sim.organ?.repairBlocked && sim.organ.nodeId === node.id) return false;
  if (node.valveIndex != null && sim.valve?.valves[node.valveIndex].phase !== 'closed') return false;
  return true;
}

function setTarget(sim, drone, target, suit) {
  const kind = target?.kind ?? null;
  const id = target ? (kind === 'suit' ? target.suit.player.id ?? 'solo' : target.node.id) : null;
  if (kind === drone.targetKind && id === drone.targetId) return;
  drone.targetKind = kind;
  drone.targetId = id;
  const event = { type: 'drone', stage: target ? 'mend' : 'idle', kind, targetId: id, x: drone.x, y: drone.y, z: drone.z };
  if (suit.player.id != null) event.playerId = suit.player.id;
  sim.events.push(event);
}

function stepDrone(sim, drone, suit, dt) {
  // Fly toward the anchor, faster the farther behind it falls, never above its top speed.
  const anchor = anchorFor(sim, drone, suit);
  const dx = anchor.x - drone.x;
  const dz = anchor.z - drone.z;
  const gap = Math.hypot(dx, dz);
  if (gap > DRONE_RULES.teleport) placeAtAnchor(sim, drone, suit);
  else if (gap > 1e-4) {
    const step = Math.min(gap, Math.max(gap * (1 - Math.exp(-dt * DRONE_RULES.catchUp)), 0), drone.stats.speed * dt);
    drone.x += dx / gap * step;
    drone.z += dz / gap * step;
  }
  // Keep clear of solid obstacles it would otherwise fly through.
  for (const [ox, oz, size] of sim.obstacles ?? []) {
    const ex = drone.x - ox;
    const ez = drone.z - oz;
    const distance = Math.hypot(ex, ez);
    if (distance < size && distance > 1e-6) {
      drone.x = ox + ex / distance * size;
      drone.z = oz + ez / distance * size;
    }
  }
  drone.y += (hoverHeight(sim, drone.x, drone.z) - drone.y) * Math.min(1, dt * 6);
  if (gap > .3) drone.yaw = Math.atan2(-dx, -dz);

  // The Inner Ear's resonance jams it near the floor, like the turret.
  const organ = sim.organ;
  drone.jammed = sim.area === 'ear' && organ?.phase === 'active' && insideHazard(drone, organ) &&
    groundHeight(sim.terrain ?? [], drone.x, drone.z, sim.clock) < RESONANCE_CLEARANCE;
  const working = !drone.jammed && !sim.tutorial && (sim.phase === 'combat' || sim.phase === 'intermission');
  drone.retarget -= dt;
  if (!working) setTarget(sim, drone, null, suit);
  else if (drone.retarget <= 0 || !stillValid(sim, drone)) {
    drone.retarget = DRONE_RULES.retarget;
    setTarget(sim, drone, chooseTarget(sim, drone), suit);
  }
  if (!drone.targetKind) return;
  if (drone.targetKind === 'suit') {
    const patient = sim.activeSuits().find(member => (member.player.id ?? 'solo') === drone.targetId)?.player;
    if (!patient) return;
    const amount = Math.min(drone.stats.suitHeal * dt, HEALTH - patient.health);
    patient.health += amount;
    drone.healed += amount;
    Object.assign(drone, { targetX: patient.x, targetY: (patient.y ?? 1.7) - .55, targetZ: patient.z });
  } else {
    const node = sim.nodes.find(item => item.id === drone.targetId);
    if (!node) return;
    const amount = Math.min(drone.stats.tissueHeal * dt, TISSUE - node.health);
    node.health += amount;
    drone.healed += amount;
    Object.assign(drone, { targetX: node.x, targetY: node.y ?? 1.25, targetZ: node.z });
    if (!sim.tutorial) {
      drone.scoreBank += amount * DRONE_RULES.scorePerPoint;
      const points = Math.floor(drone.scoreBank);
      if (points > 0) {
        drone.scoreBank -= points;
        sim.score += points;
        sim.creditPlayer(suit, points);
      }
    }
  }
}

function stillValid(sim, drone) {
  const { radius } = drone.stats;
  if (drone.targetKind === 'suit') {
    const player = sim.activeSuits().find(member => (member.player.id ?? 'solo') === drone.targetId)?.player;
    return !!player && player.health > 0 && player.health < HEALTH && within(drone, player.x, player.z, radius) && !hurting(sim, player);
  }
  if (drone.targetKind === 'node') {
    const node = sim.nodes.find(item => item.id === drone.targetId);
    return !!node && node.health > 0 && node.health < TISSUE && within(drone, node.x, node.z, radius) && mendable(sim, node);
  }
  return true;
}

function insideHazard(actor, hazard) {
  const dx = actor.x - hazard.x;
  const dz = actor.z - hazard.z;
  return hazard.radius ? Math.hypot(dx, dz) <= hazard.radius
    : Math.abs(dx) <= hazard.width / 2 && Math.abs(dz) <= hazard.depth / 2;
}

// Whether a suit lost health in the last DRONE_RULES.calm seconds.
function hurting(sim, player) {
  return sim.clock - (sim.suitHurtAt?.get(player.id ?? 'solo') ?? -Infinity) < DRONE_RULES.calm;
}

export function stepDrones(sim, dt) {
  const suits = sim.activeSuits();
  if (!suits.some(suit => suit.drone)) return;
  // Note when each suit last lost health, from any source (pathogens, lasers, hazards).
  sim.suitHurtAt ??= new Map();
  sim.suitHealthSeen ??= new Map();
  for (const { player } of suits) {
    const id = player.id ?? 'solo';
    if (player.health < (sim.suitHealthSeen.get(id) ?? player.health) - 1e-9) sim.suitHurtAt.set(id, sim.clock);
    sim.suitHealthSeen.set(id, player.health);
  }
  for (const suit of suits) if (suit.drone) stepDrone(sim, suit.drone, suit, dt);
}

// Plain copies for co-op snapshots and the renderer.
export function snapshotDrone(drone) {
  if (!drone) return null;
  const { build, stats, ...rest } = drone;
  return { ...rest, build: { ...build }, stats: { ...stats } };
}

export { DRONE_BASE };
