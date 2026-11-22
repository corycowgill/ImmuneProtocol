import { NavigationSystem, clearSegment } from './ai-navigation.mjs';

export const BOSS_TUNING = Object.freeze({ sight: 75, memory: 4, commitment: 2.5, minions: 8, totalEnemies: 24 });
const routes = new WeakMap();
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const key = player => player.id ?? 'solo';

// Bosses have explicitly enhanced 360-degree vision, but cover still blocks acquisition.
// Damage creates a short-lived preference; a co-op suit cannot steal an attack mid-windup.
export function bossSuit(sim, boss, reach = BOSS_TUNING.sight) {
  let selected = null, score = -Infinity;
  for (const suit of sim.activeSuits()) {
    const p = suit.player, d = gap(p, boss);
    if (p.health <= 0 || d > Math.min(reach, BOSS_TUNING.sight) || !clearSegment(sim.obstacles, boss, p)) continue;
    const threat = boss.threats?.find(t => t.id === key(p));
    const recent = threat ? Math.max(0, 1 - (sim.clock - threat.time) / 5) * Math.min(12, threat.damage / 20) : 0;
    const sticky = boss.focusId === key(p) && sim.clock < boss.focusUntil ? 18 : 0;
    const value = -d + sticky + recent;
    if (value > score) { selected = suit; score = value; }
  }
  if (selected) {
    const p = selected.player;
    if (boss.focusId !== key(p)) { boss.focusId = key(p); boss.focusUntil = sim.clock + BOSS_TUNING.commitment; }
    boss.lastSeen = { x: p.x, z: p.z, time: sim.clock };
  }
  return selected;
}

export function bossDamageThreat(boss, player, damage, now) {
  if (!player || !(damage > 0)) return;
  boss.lastSeen = { x: player.x, z: player.z, time: now };
  boss.threats ??= [];
  boss.threats = boss.threats.filter(t => now - t.time < 5);
  const existing = boss.threats.find(t => t.id === key(player));
  if (existing) { existing.damage = Math.min(600, existing.damage + damage); existing.time = now; }
  else boss.threats.push({ id: key(player), damage: Math.min(600, damage), time: now });
}

export function moveBoss(sim, boss, x, z, speed, dt, stop = .2) {
  const destination = { x, z }, d = gap(boss, destination);
  if (d <= stop + .02) return true;
  const flying = boss.boss === 'bloom' || boss.boss === 'screamer' || boss.hidden;
  let next = destination;
  if (!flying) {
    let route = routes.get(boss);
    if (!route) {
      route = { nav: new NavigationSystem(sim.obstacles, sim.area, sim.constructor.arena, boss.radius), nextAt: 0, goal: destination, path: [], index: 0 };
      routes.set(boss, route);
    }
    const { nav } = route;
    // Spawn/knockback overlap recovery uses the same solid projection as ordinary AI.
    if (!nav.clear(boss, boss, boss.radius)) Object.assign(boss, nav.project(boss));
    if (!nav.clear(boss, destination)) {
      if (sim.clock >= route.nextAt && (gap(route.goal, destination) > 2 || route.index >= route.path.length || !route.path.length)) {
        route.goal = destination; route.path = nav.path(boss, destination) ?? []; route.index = 0; route.nextAt = sim.clock + .9;
      }
      if (route.path[route.index] && gap(boss, route.path[route.index]) < .5) route.index++;
      next = route.path[route.index];
      if (!next) return false;
    }
    const dx = next.x - boss.x, dz = next.z - boss.z, length = Math.max(.001, Math.hypot(dx, dz));
    const step = Math.min(length, speed * dt, Math.max(0, d - stop));
    const proposed = { x: boss.x + dx / length * step, z: boss.z + dz / length * step };
    if (!nav.clear(boss, proposed, boss.radius)) { route.path = []; route.nextAt = sim.clock + .15; return false; }
    boss.x = proposed.x; boss.z = proposed.z; boss.heading = Math.atan2(dx, dz);
  } else {
    const step = Math.min(d - stop, speed * dt);
    boss.x += (x - boss.x) / d * step; boss.z += (z - boss.z) / d * step;
    boss.heading = Math.atan2(x - boss.x, z - boss.z);
  }
  return gap(boss, destination) <= stop + .02;
}

export function telegraph(boss, kind, seconds, radius, extra = {}) {
  boss.telegraph = { kind, x: boss.x, z: boss.z, radius, duration: seconds, remaining: seconds, ...extra };
  boss.action = 'boss-windup';
}

// First collision along a segment; both charging movement and suit hits use swept geometry.
export function segmentCircle(from, to, x, z, radius) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const ox = from.x - x, oz = from.z - z;
  const a = dx * dx + dz * dz, c = ox * ox + oz * oz - radius * radius;
  if (c <= 0) return 0;
  if (!a) return Infinity;
  const b = ox * dx + oz * dz, discriminant = b * b - a * c;
  if (discriminant < 0) return Infinity;
  const t = (-b - Math.sqrt(discriminant)) / a;
  return t >= 0 && t <= 1 ? t : Infinity;
}

export function moveCharge(sim, boss, dt, speed) {
  const from = { x: boss.x, z: boss.z }, to = { x: boss.x + boss.chargeX * speed * dt, z: boss.z + boss.chargeZ * speed * dt };
  let fraction = 1;
  for (const [x, z, radius] of sim.obstacles) fraction = Math.min(fraction, segmentCircle(from, to, x, z, radius + boss.radius));
  boss.x = from.x + (to.x - from.x) * Math.max(0, fraction - .005);
  boss.z = from.z + (to.z - from.z) * Math.max(0, fraction - .005);
  const before = { x: boss.x, z: boss.z }; sim.confineToArena(boss);
  return { from, to: { x: boss.x, z: boss.z }, collided: fraction < 1 || gap(before, boss) > .01 };
}

export function chargeReach(sim, boss) {
  const d = Math.hypot(boss.chargeX, boss.chargeZ) || 1;
  const dx = boss.chargeX / d, dz = boss.chargeZ / d;
  const reach = (boss.chargeSpeed ?? 19) * 4;
  const to = { x: boss.x + dx * reach, z: boss.z + dz * reach };
  let fraction = 1;
  for (const [x, z, radius] of sim.obstacles) fraction = Math.min(fraction, segmentCircle(boss, to, x, z, radius + boss.radius));
  const { x, z } = sim.constructor.arena;
  const a = (dx / x) ** 2 + (dz / z) ** 2;
  const b = boss.x * dx / (x * x) + boss.z * dz / (z * z);
  const c = (boss.x / x) ** 2 + (boss.z / z) ** 2 - 1;
  const wall = (-b + Math.sqrt(Math.max(0, b * b - a * c))) / a;
  return Math.max(0, Math.min(reach * fraction, wall));
}

export function canSummon(sim, boss) {
  return sim.enemies.length < BOSS_TUNING.totalEnemies && sim.enemies.filter(e => e.summonedBy === boss.id).length < BOSS_TUNING.minions;
}
