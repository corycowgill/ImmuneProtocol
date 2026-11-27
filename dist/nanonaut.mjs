// The Nanonaut: a human operator in a red and yellow biosuit who fights for the nanobots with a
// carbine. Unlike the pathogens it fights like a soldier: it takes cover behind scenery, peeks out
// to fire short bursts, keeps its distance and strafes in the open, dodges when a suit lines up on
// it, reloads in cover, and pushes a weakened suit with its squad. It never attacks tissue.
//
// The tactical layer here sits on the shared controller (tactical-ai.mjs) for perception, memory
// and routes; nanonaut-view.mjs animates it from the state recorded on enemy.soldier.
import { clearSegment } from './ai-navigation.mjs';
import { raySolids } from './solids.mjs';

export const NANONAUT_SPEC = Object.freeze({ behavior: 'rifle', radius: .5, y: 1.05, health: 120, speed: 4.4,
  suitDamage: 14, tissueDamage: 0, score: 280, humanoid: true });

export const RIFLE = Object.freeze({
  range: 48, interval: .1, burst: [3, 6], burstRest: [.45, 1], magazine: 26, reload: 2.2,
  // Accuracy: the chance a round lands, before distance, movement and suppression.
  accuracy: .62, firstShotDelay: .38, settle: 1.4,
  muzzle: { stand: 1.46, crouch: .98 }, height: { stand: 1.84, crouch: 1.22 }, head: .17, body: .31,
});

export const SOLDIER = Object.freeze({
  walk: 1.6, run: 4.4, crouchWalk: .75, strafe: 1.35, back: 1.25, dodge: 4.6, dodgeTime: .6, dodgeRest: 2.4,
  // Where it wants to fight from: close enough to hit, far enough to use cover.
  band: [9, 24], tooClose: 5, coverSearch: 17, coverClearance: .85, peekStep: 1.15,
  hide: [.9, 2.1], peek: [1.4, 2.6], strafeLeg: [1.4, 2.8], suppressedFor: 1.6, decision: .3,
});

const rand = (sim, a, b) => a + (b - a) * sim.ai.random();
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createSoldier(enemy) {
  enemy.soldier = { state: 'patrol', stance: 'stand', timer: 0, next: 0, mag: RIFLE.magazine, reload: 0,
    burst: 0, shotTimer: 0, rest: 0, aimTime: 0, cover: null, strafe: 1, strafeTimer: 0, dodge: 0, dodgeDir: 1, dodgeRest: 0,
    suppressed: 0, aimYaw: enemy.heading, aimPitch: 0, moving: 0, shots: 0, targetId: null };
  enemy.feet = 0;
  return enemy.soldier;
}

// The humanoid hitbox for a suit's shot: a capsule for the body and a sphere for the head (a
// head hit is critical). Returns the entry distance, or null.
export function humanoidHit(enemy, origin, ray, range) {
  const s = enemy.soldier;
  const height = RIFLE.height[s?.stance === 'crouch' ? 'crouch' : 'stand'];
  const feet = enemy.feet ?? 0;
  const head = { x: enemy.x, y: feet + height - RIFLE.head, z: enemy.z };
  let best = null;
  const sphere = (c, r) => {
    const x = c.x - origin.x, y = c.y - origin.y, z = c.z - origin.z;
    const along = x * ray.x + y * ray.y + z * ray.z;
    const off = x * x + y * y + z * z - along * along;
    if (along <= 0 || off > r * r) return null;
    return Math.max(0, along - Math.sqrt(r * r - off));
  };
  const headEntry = sphere(head, RIFLE.head);
  if (headEntry != null && headEntry < range) best = { entry: headEntry, head: true };
  // Body: a vertical capsule from the shins to the shoulders, approximated by its closest approach.
  const bottom = feet + .25, top = feet + height - RIFLE.head * 2.1;
  const ox = origin.x - enemy.x, oz = origin.z - enemy.z;
  const a = ray.x * ray.x + ray.z * ray.z, b = 2 * (ox * ray.x + oz * ray.z), c = ox * ox + oz * oz - RIFLE.body * RIFLE.body;
  const disc = b * b - 4 * a * c;
  if (a > 1e-6 && disc >= 0) {
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    const y = origin.y + ray.y * t;
    if (t > 0 && t < range && y >= bottom && y <= top && (!best || t < best.entry)) best = { entry: t, head: false };
  }
  return best;
}

function coverFor(sim, enemy) {
  if (!sim.lowObstacles?.size || !(sim.overLowScenery?.(enemy) > 0)) return sim.obstacles;
  return sim.obstacles.filter(o => !sim.lowObstacles.has(o) || Math.hypot(enemy.x - o[0], enemy.z - o[1]) >= o[2]);
}

// Whether a straight line of fire is open: the obstacle footprints, and in 3D the low scenery and
// the artery's vessels (solids.mjs), as the drones' lasers check it.
export function lineOfFire(sim, from, to) {
  if (!clearSegment(sim.obstacles, from, to, .05)) return false;
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, length = Math.hypot(dx, dy, dz) || 1;
  const solids = (sim.shotSolids ?? []).filter(solid => solid.kind === 'tube' ||
    (solid.kind !== 'pillar' && sim.obstacles.includes(sim.obstacleOf?.get(solid))));
  return !solids.length || raySolids(solids, from, { x: dx / length, y: dy / length, z: dz / length }, length) >= length - .05;
}

// A spot behind an obstacle out of the threat's sight, with a peek point beside it that sees the
// threat. Scored for distance, the fighting band and whether a squadmate already holds it.
function findCover(sim, enemy, threat) {
  const nav = sim.ai.groundNavigation;
  const held = sim.nanonautCover ??= new Map();
  let best = null;
  for (const obstacle of sim.obstacles) {
    const [ox, oz, r] = obstacle;
    if (Math.hypot(ox - enemy.x, oz - enemy.z) > SOLDIER.coverSearch + r) continue;
    const away = Math.hypot(ox - threat.x, oz - threat.z) || 1;
    const ux = (ox - threat.x) / away, uz = (oz - threat.z) / away;
    const reach = r + SOLDIER.coverClearance;
    const spot = nav.project({ x: ox + ux * reach, z: oz + uz * reach });
    if (!nav.inside(spot) || Math.hypot(spot.x - ox, spot.z - oz) > reach + .6) continue;
    if (clearSegment(sim.obstacles, threat, spot)) continue; // seen from the threat: no cover
    // Peek: step out to either side, round the obstacle, until the threat is in sight.
    let peek = null;
    for (const side of [1, -1]) {
      for (const step of [SOLDIER.peekStep, SOLDIER.peekStep * 1.6]) {
        const px = spot.x - uz * side * (r * .55 + step), pz = spot.z + ux * side * (r * .55 + step);
        const point = nav.project({ x: px, z: pz });
        if (nav.inside(point) && clearSegment(sim.obstacles, threat, point) && nav.clear(spot, point, .2)) { peek = point; break; }
      }
      if (peek) break;
    }
    if (!peek) continue;
    const range = Math.hypot(spot.x - threat.x, spot.z - threat.z);
    const key = Math.round(spot.x) + ',' + Math.round(spot.z);
    const owner = held.get(key);
    if (owner != null && owner !== enemy.id && sim.enemies.some(e => e.id === owner)) continue;
    const band = range < SOLDIER.band[0] ? (SOLDIER.band[0] - range) * .6 : range > SOLDIER.band[1] ? (range - SOLDIER.band[1]) * .35 : 0;
    const score = dist2(enemy, spot) * .45 + band;
    if (!best || score < best.score) best = { x: spot.x, z: spot.z, peekX: peek.x, peekZ: peek.z, key, score, obstacle: [ox, oz, r] };
  }
  return best;
}

function releaseCover(sim, enemy) {
  const s = enemy.soldier;
  if (s.cover && sim.nanonautCover?.get(s.cover.key) === enemy.id) sim.nanonautCover.delete(s.cover.key);
  s.cover = null;
}

function setState(sim, enemy, state, timer = 0) {
  const s = enemy.soldier;
  if (s.state === state) return;
  s.state = state;
  s.timer = timer;
  if (state !== 'cover' && state !== 'peek' && state !== 'to-cover' && state !== 'reload') releaseCover(sim, enemy);
}

// One round: whether it lands depends on range, how long it has held its aim, whether either is
// moving and whether it is being shot at. A miss still flies (its tracer passes close by), and
// cover in the way stops it.
function fireRound(sim, enemy, target, spec, controller) {
  const s = enemy.soldier;
  const muzzleY = (enemy.feet ?? 0) + RIFLE.muzzle[s.stance === 'crouch' ? 'crouch' : 'stand'];
  const from = { x: enemy.x + Math.sin(s.aimYaw) * .55 - Math.cos(s.aimYaw) * .08, y: muzzleY, z: enemy.z + Math.cos(s.aimYaw) * .55 + Math.sin(s.aimYaw) * .08 };
  const range = dist2(enemy, target);
  const record = controller.memory.targets.get(controller.targetKey);
  const speed = record?.velocity ? Math.hypot(record.velocity.x, record.velocity.z) : 0;
  const difficulty = sim.ai.difficulty.accuracy ?? 1;
  let chance = RIFLE.accuracy * difficulty;
  chance *= range < 10 ? 1 : Math.max(.32, 1 - (range - 10) / 55);
  chance *= .45 + .55 * Math.min(1, s.aimTime / RIFLE.settle);
  if (speed > 3) chance *= .72;
  if (target.dashing || target.sliding) chance *= .45;
  if (target.crouched) chance *= .85;
  if (s.moving > .5) chance *= .75;
  if (s.stance === 'crouch' && s.moving < .2) chance *= 1.15;
  if (sim.clock < s.suppressed) chance *= .6;
  const hit = sim.ai.random() < Math.min(.9, chance);
  // Aim: the chest of a hit; a near miss passes within a metre or so.
  const aimY = (target.feet ?? (target.y - 1.6)) + (target.crouched ? .85 : 1.25);
  let to = { x: target.x, y: aimY, z: target.z };
  if (!hit) {
    const angle = sim.ai.random() * Math.PI * 2, miss = rand(sim, .45, 1.3);
    to = { x: to.x + Math.cos(angle) * miss, y: to.y + Math.sin(angle) * miss * .6, z: to.z + Math.sin(angle) * miss };
  }
  // Carry the round on past the target to the end of its range, then stop it at whatever it meets.
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, length = Math.hypot(dx, dy, dz) || 1;
  const far = hit ? length : RIFLE.range;
  let end = { x: from.x + dx / length * far, y: from.y + dy / length * far, z: from.z + dz / length * far };
  let landed = hit && lineOfFire(sim, from, to);
  if (!landed) {
    // Stop at the first obstacle footprint or the floor.
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const p = { x: from.x + (end.x - from.x) * k, y: from.y + (end.y - from.y) * k, z: from.z + (end.z - from.z) * k };
      if (p.y <= (sim.groundUnder?.(p) ?? 0) || !clearSegment(sim.obstacles, from, p, .02)) { end = p; break; }
    }
  }
  s.shots++;
  s.mag--;
  sim.events.push({ type: 'enemyAttack', enemyType: enemy.type, behavior: 'rifle', id: enemy.id, stage: 'release', target: 'player',
    x: from.x, y: from.y, z: from.z, to: landed ? to : end, hit: landed, targetPlayerId: target.id });
  if (landed) {
    sim.damageTarget(enemy, 'player', spec.suitDamage, from, target.id);
    sim.attackEvent(enemy, 'impact', 'player', to, target.id);
  }
  sim.ai.emit('combat', from, { owner: enemy.id, radius: 34 });
}

// The soldier's tactics, each simulation step.
export function stepNanonaut(sim, enemy, dt, spec, speedFactor, controller) {
  const s = enemy.soldier ?? createSoldier(enemy);
  enemy.attackingTissue = false;
  s.timer += dt;
  s.dodgeRest = Math.max(0, s.dodgeRest - dt);
  const target = controller.targetKey?.startsWith('player:') ? controller.attackTarget() : null;
  const remembered = !target && controller.targetKey?.startsWith('player:') ? controller.memory.targets.get(controller.targetKey) : null;
  const threat = target ?? remembered;
  if (target) { s.aimTime += dt; s.targetId = target.id; } else s.aimTime = Math.max(0, s.aimTime - dt * 2);
  // Being shot at, or hit, suppresses it: it ducks for cover and fires less accurately.
  if (sim.clock - controller.lastDamage < .05) s.suppressed = sim.clock + SOLDIER.suppressedFor;

  // A dodge, triggered when a suit lines up its aim on it (aimedAt).
  if (s.state === 'dodge') {
    const step = SOLDIER.dodge * dt * speedFactor;
    const side = { x: Math.cos(s.aimYaw) * s.dodgeDir, z: -Math.sin(s.aimYaw) * s.dodgeDir };
    const proposed = { x: enemy.x + side.x * step, z: enemy.z + side.z * step };
    const nav = sim.ai.groundNavigation;
    if (nav.inside(proposed) && nav.clear(enemy, proposed, enemy.radius * .5)) { enemy.x = proposed.x; enemy.z = proposed.z; }
    s.moving = 1;
    if (s.timer >= SOLDIER.dodgeTime) { setState(sim, enemy, target ? 'strafe' : 'advance'); s.stance = 'crouch'; s.dodgeRest = SOLDIER.dodgeRest; }
    finishStep(sim, enemy, target, s, dt, threat);
    return;
  }
  if (target && s.dodgeRest <= 0 && s.state !== 'reload' && s.state !== 'cover' && sim.clock >= (s.nextAimCheck ?? 0)) {
    s.nextAimCheck = sim.clock + .25;
    if (aimedAt(target, enemy) && sim.ai.random() < controller.profile.evasion) s.wantDodge = true;
  }
  // (The shared perception's own crosshair flag is not used: it reads the suit's yaw the other way round.)
  enemy.dodge = 0;
  if (s.wantDodge && s.dodgeRest <= 0 && target && s.state !== 'reload' && s.state !== 'cover') {
    s.wantDodge = false;
    s.dodgeDir = sim.ai.random() < .5 ? -1 : 1;
    setState(sim, enemy, 'dodge');
    s.burst = 0;
    sim.events.push({ type: 'enemyAttack', enemyType: enemy.type, behavior: 'rifle', id: enemy.id, stage: 'dodge', target: 'player',
      x: enemy.x, y: enemy.y, z: enemy.z, dir: s.dodgeDir });
    return;
  }

  // Reloading: in cover when it can, crouched, unable to fire.
  if (s.state === 'reload') {
    s.reload -= dt;
    if (s.reload <= 0) { s.mag = RIFLE.magazine; setState(sim, enemy, s.cover ? 'cover' : target ? 'strafe' : 'advance'); }
    moveTo(sim, enemy, controller, s.cover ? { x: s.cover.x, z: s.cover.z } : null, SOLDIER.crouchWalk, dt, speedFactor);
    finishStep(sim, enemy, target, s, dt, threat);
    return;
  }
  if (s.mag <= 0 || (s.mag < RIFLE.magazine * .35 && !target && s.cover)) {
    setState(sim, enemy, 'reload');
    s.reload = RIFLE.reload;
    s.stance = 'crouch';
    s.burst = 0;
    sim.events.push({ type: 'enemyAttack', enemyType: enemy.type, behavior: 'rifle', id: enemy.id, stage: 'reload', target: 'player', x: enemy.x, y: enemy.y, z: enemy.z });
    return;
  }

  // Decide.
  if (sim.clock >= s.next) {
    s.next = sim.clock + SOLDIER.decision * (sim.ai.difficulty.decision ?? 1);
    decide(sim, enemy, controller, target, threat, s);
  }

  let goal = null, speed = SOLDIER.walk;
  switch (s.state) {
    case 'patrol': speed = SOLDIER.walk; s.stance = 'stand'; break; // the controller's own patrol route
    case 'search': goal = remembered ? { x: remembered.x, z: remembered.z } : null; speed = SOLDIER.walk; s.stance = 'stand'; break;
    case 'to-cover': goal = { x: s.cover.x, z: s.cover.z }; speed = SOLDIER.run; s.stance = 'stand';
      if (dist2(enemy, goal) < .5) { setState(sim, enemy, 'cover'); s.timer = 0; s.hold = rand(sim, ...SOLDIER.hide); }
      break;
    case 'cover': goal = { x: s.cover.x, z: s.cover.z }; speed = SOLDIER.crouchWalk; s.stance = 'crouch';
      if (s.timer >= s.hold && sim.clock >= s.suppressed) { setState(sim, enemy, 'peek'); s.timer = 0; s.hold = rand(sim, ...SOLDIER.peek); }
      break;
    case 'peek': goal = { x: s.cover.peekX, z: s.cover.peekZ }; speed = SOLDIER.strafe; s.stance = 'stand';
      // The peek lasts from when it is out at the edge, not from when it left cover.
      if (dist2(enemy, goal) > .45) s.timer = 0;
      if (s.timer >= s.hold || sim.clock < s.suppressed) { setState(sim, enemy, 'cover'); s.timer = 0; s.hold = rand(sim, ...SOLDIER.hide); s.burst = 0; }
      break;
    case 'strafe': {
      s.stance = s.crouchFire > sim.clock ? 'crouch' : 'stand';
      s.strafeTimer -= dt;
      if (s.strafeTimer <= 0) {
        s.strafe = -s.strafe;
        s.strafeTimer = rand(sim, ...SOLDIER.strafeLeg);
        // Now and then it drops to a knee for a steadier burst.
        if (sim.ai.random() < .3) s.crouchFire = sim.clock + rand(sim, 1.2, 2.2);
      }
      if (target && s.stance !== 'crouch') {
        const range = dist2(enemy, target), dx = enemy.x - target.x, dz = enemy.z - target.z, d = range || 1;
        const along = range < SOLDIER.band[0] ? 1 : range > SOLDIER.band[1] ? -1 : 0;
        goal = { x: enemy.x + (-dz / d) * s.strafe * 2.4 + dx / d * along * 2, z: enemy.z + (dx / d) * s.strafe * 2.4 + dz / d * along * 2 };
        speed = along > 0 ? SOLDIER.back : SOLDIER.strafe;
      }
      break;
    }
    case 'push': goal = target ? { x: target.x, z: target.z } : null; speed = SOLDIER.walk * 1.25; s.stance = 'stand'; break;
    case 'advance': goal = threat ? { x: threat.x, z: threat.z } : null; speed = SOLDIER.run; s.stance = 'stand'; break;
    case 'backoff': {
      if (target) {
        const dx = enemy.x - target.x, dz = enemy.z - target.z, d = Math.hypot(dx, dz) || 1;
        goal = { x: enemy.x + dx / d * 3, z: enemy.z + dz / d * 3 };
      }
      speed = SOLDIER.back; s.stance = 'stand'; break;
    }
  }
  moveTo(sim, enemy, controller, goal, speed, dt, speedFactor, s.state === 'push' ? 7 : s.state === 'advance' ? SOLDIER.band[1] * .7 : 0);

  // Fire: bursts of a few rounds at a target it can see, once it has settled its aim, taking turns
  // with the squad through the encounter director's attack slots.
  const canFire = target && ['strafe', 'peek', 'push', 'backoff', 'search', 'advance'].includes(s.state) && s.mag > 0;
  s.shotTimer = Math.max(0, s.shotTimer - dt);
  s.rest = Math.max(0, s.rest - dt);
  if (canFire && s.burst === 0 && s.rest === 0 && s.aimTime >= RIFLE.firstShotDelay * (sim.ai.difficulty.reaction ?? 1) &&
      lineOfFire(sim, { x: enemy.x, y: (enemy.feet ?? 0) + 1.45, z: enemy.z }, { x: target.x, y: target.y - .3, z: target.z }) &&
      sim.ai.director.acquire(enemy, 'player', 1.1)) {
    s.burst = Math.round(rand(sim, ...RIFLE.burst));
  }
  if (s.burst > 0 && s.shotTimer === 0) {
    if (!canFire) { s.burst = 0; sim.ai.director.release(enemy.id); }
    else {
      fireRound(sim, enemy, target, spec, controller);
      s.burst--;
      s.shotTimer = RIFLE.interval * (enemy.cooldownScale ?? 1);
      if (s.burst === 0) { s.rest = rand(sim, ...RIFLE.burstRest); sim.ai.director.release(enemy.id); }
    }
  }
  finishStep(sim, enemy, target, s, dt, threat);
}

// Whether a suit's view is lined up on it: the suit looks along (-sin yaw, -cos yaw).
function aimedAt(suit, enemy) {
  const dx = enemy.x - suit.x, dz = enemy.z - suit.z, d = Math.hypot(dx, dz);
  if (d < 2 || suit.yaw == null) return false;
  const bearing = Math.atan2(-dx, -dz);
  const off = Math.abs(Math.atan2(Math.sin(bearing - suit.yaw), Math.cos(bearing - suit.yaw)));
  return off < .06 + RIFLE.body / d;
}

function decide(sim, enemy, controller, target, threat, s) {
  if (!threat) { setState(sim, enemy, controller.action === 'investigate' ? 'search' : 'patrol'); return; }
  if (!target) {
    // Lost sight: hold cover a while, then go and look.
    // (Losing sight of it is what running to cover is for.)
    if ((s.state === 'cover' || s.state === 'peek' || s.state === 'to-cover') && s.timer < 3) return;
    setState(sim, enemy, 'search');
    return;
  }
  const range = dist2(enemy, target);
  const suit = target;
  // Too close: back off firing, or dodge aside.
  if (range < SOLDIER.tooClose) { setState(sim, enemy, 'backoff'); return; }
  // Push a weakened suit with the squad.
  const allies = controller.memory.allies.length;
  if (suit.health < 35 && allies >= 1 && range > 8 && s.state !== 'push') { setState(sim, enemy, 'push'); return; }
  if (s.state === 'push' && suit.health >= 50) setState(sim, enemy, 'strafe');
  if (s.state === 'push') return;
  // In cover: stay while it still hides it from the suit; otherwise find new cover.
  if (s.cover && (s.state === 'cover' || s.state === 'peek' || s.state === 'to-cover')) {
    if (clearSegment(sim.obstacles, target, { x: s.cover.x, z: s.cover.z })) { releaseCover(sim, enemy); setState(sim, enemy, 'strafe'); }
    else return;
  }
  if (range > SOLDIER.band[1] + 6) { setState(sim, enemy, 'advance'); return; }
  // Take cover when there is some worth having, more readily when hurt or suppressed.
  const hurt = enemy.health / enemy.maxHealth < .6 || sim.clock < s.suppressed;
  if (!s.cover && (hurt || sim.ai.random() < .55)) {
    const cover = findCover(sim, enemy, target);
    if (cover && (hurt || cover.score < 9)) {
      s.cover = cover;
      sim.nanonautCover.set(cover.key, enemy.id);
      setState(sim, enemy, 'to-cover');
      return;
    }
  }
  if (s.state !== 'strafe') { setState(sim, enemy, 'strafe'); s.strafeTimer = rand(sim, ...SOLDIER.strafeLeg); }
}

function moveTo(sim, enemy, controller, goal, speed, dt, speedFactor, stop = 0) {
  const s = enemy.soldier;
  const before = { x: enemy.x, z: enemy.z };
  enemy.heading = s.walkHeading ?? enemy.heading;
  if (goal) controller.destination = sim.ai.groundNavigation.project(goal);
  if (goal || s.state === 'patrol') {
    // The controller walks its route; a soldier on its own errand keeps moving even when the
    // controller's own utility says idle.
    if (controller.action === 'idle') controller.action = 'pursue';
    controller.move(dt, speed * speedFactor, stop);
  }
  const moved = Math.hypot(enemy.x - before.x, enemy.z - before.z);
  s.moving = dt > 0 ? Math.min(1, moved / dt / SOLDIER.walk) : 0;
  // Where it is walking, kept apart from where it looks (enemy.heading is its gaze for perception).
  if (moved > 1e-4) s.walkHeading = Math.atan2(enemy.x - before.x, enemy.z - before.z);
}

function finishStep(sim, enemy, target, s, dt, threat = null) {
  // It faces its target while it can see one (aiming as it strafes), otherwise where it walks.
  // With nothing in sight it sweeps its gaze as it goes, the way a patrolling soldier checks around.
  const scan = s.state === 'patrol' || s.state === 'search' ? Math.sin(sim.clock * .7 + enemy.id) * .75 : 0;
  // In cover, at a peek, reloading or fighting in the open it holds its angle on where the suit was
  // last seen; running between positions it looks where it goes.
  const holds = threat && ['cover', 'peek', 'reload', 'strafe', 'backoff', 'push'].includes(s.state);
  const want = target ? Math.atan2(target.x - enemy.x, target.z - enemy.z)
    : holds ? Math.atan2(threat.x - enemy.x, threat.z - enemy.z) : (s.walkHeading ?? enemy.heading) + scan;
  const turn = Math.atan2(Math.sin(want - s.aimYaw), Math.cos(want - s.aimYaw));
  s.aimYaw += turn * Math.min(1, dt * (target ? 9 : 5));
  if (target) {
    const feet = enemy.feet ?? 0, muzzle = feet + RIFLE.muzzle[s.stance === 'crouch' ? 'crouch' : 'stand'];
    s.aimPitch = Math.atan2((target.feet ?? target.y - 1.6) + 1.2 - muzzle, Math.max(.5, Math.hypot(target.x - enemy.x, target.z - enemy.z)));
  } else s.aimPitch *= Math.exp(-dt * 4);
  enemy.feet = sim.groundUnder?.(enemy) ?? 0;
  enemy.y = enemy.feet + (s.stance === 'crouch' ? .75 : 1.05);
  enemy.heading = s.aimYaw;
}
