// The Mega Nano Bot: the finale's second boss. When the Mega Virus collapses, a giant hostile
// medical nanomachine descends into the cortex, a human brain sealed in the glass dome on top of
// its hull as its processor. It hovers, and it fights in a loop:
//
//   Shield   A shield dome makes it untouchable while its three pylons stand. Destroy the pylons
//            and the shield drops for a while: the brain is its weak point (the hull is armoured
//            and turns nearly all fire). The shield reboots with fresh, tougher pylons when the
//            window closes or when it reaches a new phase.
//   Salvo    Missile pods fire a salvo at marked circles round each suit and the weakest node.
//            Step out of the circles before they land.
//   Sweep    The belly cannon sweeps a laser across the floor. Jump it or put scenery between.
//   Drones   The drone bay launches Rogue Bots (and, later, Crawlers).
//   EMP      A pulse that knocks out every turret and medic drone nearby for several seconds,
//            and stings suits inside it.
//
// Three phases (above 66%, above 33%, the rest), each faster, with bigger salvos and wider sweeps.
// Pure simulation: the hull is a level-boss enemy (level-bosses.mjs supplies its helpers), the
// pylons and the brain are part-enemies the suits can shoot, drawn by the hull's own model
// (nanobot-view.mjs).

export const NANOBOT = Object.freeze({
  id: 'nanobot', model: 'boss-nanobot', name: 'Mega Nano Bot', health: 5400, radius: 3.4, y: 6.4, scale: 3.2, score: 5000,
  hint: 'SHOOT ITS SHIELD PYLONS · THEN THE BRAIN',
});
// Where the pylons and the brain sit on the model, in its own units (scaled by NANOBOT.scale).
export const NANOBOT_LAYOUT = Object.freeze({
  pylons: Object.freeze([90, 210, 330].map(degrees => Object.freeze({ angle: degrees * Math.PI / 180, radius: .98, height: .12 }))),
  brain: Object.freeze({ x: 0, y: .56, z: 0, radius: .4 }),
});
const PHASES = Object.freeze([
  Object.freeze({ cooldown: 3.4, pylon: 420, salvo: 3, sweep: 1.75, drones: ['rogue-bot', 'rogue-bot'] }),
  Object.freeze({ cooldown: 2.8, pylon: 520, salvo: 4, sweep: 2.2, drones: ['rogue-bot', 'crawler'] }),
  Object.freeze({ cooldown: 2.2, pylon: 620, salvo: 5, sweep: 2.6, drones: ['crawler', 'rogue-bot', 'crawler'] }),
]);
const ATTACKS = Object.freeze([
  Object.freeze(['salvo', 'sweep', 'drones', 'salvo', 'emp']),
  Object.freeze(['salvo', 'sweep', 'emp', 'drones', 'sweep']),
  Object.freeze(['sweep', 'salvo', 'emp', 'salvo', 'drones', 'sweep']),
]);
export const NANOBOT_RULES = Object.freeze({
  enter: 3.6, enterHeight: 16,
  // The shield stays down this long once its pylons fall, the first part of it reeling.
  exposed: 12, reel: 3,
  // A pylon's and the brain's hit spheres, in metres.
  pylonRadius: 1.05, brainRadius: 1.35,
  // Brain hits pass to the hull at this rate; the hull itself turns most fire.
  brainScale: 1.25, hullScale: .1,
  salvo: Object.freeze({ warning: 1.55, radius: 3.2, suitDamage: 50, tissueDamage: 14 }),
  sweep: Object.freeze({ warning: 1.1, length: 44, width: 1.15, jump: .55, tick: .3, suitDamage: 30, tissueDamage: 6 }),
  emp: Object.freeze({ warning: 1.4, radius: 18, knockout: 7, suitDamage: 14 }),
  drones: Object.freeze({ warning: .9 }),
});

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const stageOf = boss => boss.health > boss.maxHealth * .66 ? 1 : boss.health > boss.maxHealth * .33 ? 2 : 3;

// A point on the model, from its own units to the arena, with the hull's heading and height.
export function nanobotPoint(boss, x, y, z) {
  const s = NANOBOT.scale, h = boss.heading ?? 0, cos = Math.cos(h), sin = Math.sin(h);
  return { x: boss.x + (x * cos + z * sin) * s, y: boss.y + y * s, z: boss.z + (-x * sin + z * cos) * s };
}

// The live parts: pylons (while the shield is up) and the brain (always; it only takes damage while
// the shield is down).
export function nanobotParts(sim, boss) {
  return sim.enemies.filter(enemy => enemy.relayTo === boss.id || enemy.pylonOf === boss.id);
}

function placeParts(sim, boss) {
  for (const part of nanobotParts(sim, boss)) {
    const point = part.pylonOf != null
      ? (() => { const p = NANOBOT_LAYOUT.pylons[part.slot]; return nanobotPoint(boss, Math.cos(p.angle) * p.radius, p.height, Math.sin(p.angle) * p.radius); })()
      : nanobotPoint(boss, NANOBOT_LAYOUT.brain.x, NANOBOT_LAYOUT.brain.y, NANOBOT_LAYOUT.brain.z);
    part.x = point.x; part.y = point.y; part.z = point.z;
    part.node = boss.node; part.nodeId = boss.nodeId;
  }
}

function part(sim, boss, fields) {
  const enemy = sim.createEnemy('nanobot-part', boss.x, boss.z, boss.node, { radius: 1, y: boss.y, health: 1, score: 0, ...fields.spec });
  enemy.score = fields.spec.score ?? 0;
  delete fields.spec;
  Object.assign(enemy, { behavior: 'boss-part', noView: true, segmentOf: boss.id, partOf: boss.id, ...fields });
  sim.enemies.push(enemy);
  return enemy;
}

// Raises the shield and spawns a fresh set of pylons for the current phase.
function raiseShield(sim, boss, helpers) {
  for (const old of sim.enemies.filter(enemy => enemy.pylonOf === boss.id)) sim.enemies.splice(sim.enemies.indexOf(old), 1);
  const health = Math.round(PHASES[boss.stage - 1].pylon * (boss.strength ?? 1));
  boss.pylons = [0, 1, 2].map(slot => part(sim, boss, { pylonOf: boss.id, slot, spec: { radius: NANOBOT_RULES.pylonRadius, health, score: 250 } }).id);
  boss.shielded = true;
  boss.exposedUntil = 0;
  boss.damageScale = 0;
  setBrain(sim, boss, 0);
  placeParts(sim, boss);
  helpers.emit(sim, boss, 'ability', { ability: 'shield-up' });
}

function setBrain(sim, boss, scale) {
  const brain = sim.enemies.find(enemy => enemy.relayTo === boss.id);
  if (brain) brain.relayScale = scale;
}

function dropShield(sim, boss, helpers) {
  boss.shielded = false;
  boss.exposedUntil = sim.clock + NANOBOT_RULES.exposed;
  boss.reelUntil = sim.clock + NANOBOT_RULES.reel;
  boss.damageScale = NANOBOT_RULES.hullScale;
  setBrain(sim, boss, NANOBOT_RULES.brainScale);
  boss.telegraph = null; boss.laser = null;
  boss.state = 'hover';
  helpers.warn(boss, 'SHIELD DOWN · SHOOT THE BRAIN');
  helpers.emit(sim, boss, 'ability', { ability: 'shield-down' });
}

// Sets the boss up the moment level-bosses.mjs has created its hull.
export function prepareNanobot(sim, boss) {
  boss.y = NANOBOT_RULES.enterHeight;
  boss.x = 0; boss.z = -sim.constructor.arena.z * .18;
  boss.heading = 0;
  boss.damageScale = 0;
  boss.stage = 1;
  boss.attackIndex = 0;
  boss.strength = boss.maxHealth / NANOBOT.health;
}

export function nanobotBehaviour(sim, boss, dt, helpers) {
  const rules = NANOBOT_RULES;
  if (boss.state === 'enter') {
    // Descends from the canopy, untouchable, before the fight starts.
    boss.timer = (boss.timer || rules.enter) - dt;
    boss.damageScale = 0;
    boss.y = NANOBOT.y + (rules.enterHeight - NANOBOT.y) * Math.max(0, boss.timer / rules.enter);
    if (!sim.enemies.some(enemy => enemy.relayTo === boss.id)) {
      part(sim, boss, { relayTo: boss.id, relayScale: 0, spec: { radius: rules.brainRadius, health: 1e9 } });
    }
    placeParts(sim, boss);
    if (boss.timer > 0) return;
    boss.timer = 0;
    boss.state = 'hover';
    boss.cooldown = 2;
    raiseShield(sim, boss, helpers);
  }

  // A new phase reboots the shield at once, and every phase announces itself.
  const stage = stageOf(boss);
  if (stage > boss.stage) {
    boss.stage = stage;
    boss.phase = stage;
    helpers.emit(sim, boss, 'phase', { phase: stage });
    if (!boss.shielded) raiseShield(sim, boss, helpers);
  }
  const phase = PHASES[boss.stage - 1];

  // Hover over the cortex, drifting, facing the nearest suit.
  boss.drift = (boss.drift ?? 0) + dt * .12;
  const anchor = { x: Math.sin(boss.drift) * sim.constructor.arena.x * .32, z: -sim.constructor.arena.z * .12 + Math.cos(boss.drift * .7) * sim.constructor.arena.z * .14 };
  const reeling = (boss.reelUntil ?? 0) > sim.clock;
  if (boss.state === 'hover' && !reeling) helpers.approach(sim, boss, anchor.x, anchor.z, 3.2, dt, .5);
  boss.y = NANOBOT.y + Math.sin(sim.clock * .8) * .35 - (reeling ? 1.2 : 0);
  const suit = helpers.nearestSuit(sim, boss, 90);
  if (suit && boss.state !== 'sweep') boss.heading = Math.atan2(suit.player.x - boss.x, suit.player.z - boss.z);
  helpers.setNode(boss, helpers.weakestNode(sim));
  placeParts(sim, boss);

  // The shield falls with its last pylon and comes back when the window closes.
  if (boss.shielded && !sim.enemies.some(enemy => enemy.pylonOf === boss.id)) dropShield(sim, boss, helpers);
  if (!boss.shielded && sim.clock >= boss.exposedUntil) {
    helpers.warn(boss, '');
    raiseShield(sim, boss, helpers);
  }
  if (reeling) return;

  if (boss.state === 'hover') {
    boss.cooldown -= dt;
    if (boss.cooldown > 0 || !suit) return;
    const pattern = ATTACKS[boss.stage - 1];
    const attack = pattern[boss.attackIndex++ % pattern.length];
    startAttack(sim, boss, attack, suit, phase, helpers);
    return;
  }
  boss.timer -= dt;
  if (boss.state === 'salvo' && boss.timer <= 0) landSalvo(sim, boss, helpers);
  else if (boss.state === 'sweep') stepSweep(sim, boss, dt, helpers);
  else if (boss.state === 'emp' && boss.timer <= 0) fireEmp(sim, boss, helpers);
  else if (boss.state === 'drones' && boss.timer <= 0) launchDrones(sim, boss, phase, helpers);
}

function startAttack(sim, boss, attack, suit, phase, helpers) {
  const rules = NANOBOT_RULES;
  boss.state = attack;
  if (attack === 'salvo') {
    // A circle on and round each suit, and on the weakest node.
    const rings = [];
    for (const { player } of helpers.livingSuits(sim)) {
      for (let i = 0; i < phase.salvo; i++) {
        const angle = i * 2.4 + sim.clock, reach = i ? 3.4 + (i % 2) * 2.2 : 0;
        rings.push({ x: player.x + Math.cos(angle) * reach, z: player.z + Math.sin(angle) * reach, radius: rules.salvo.radius });
      }
    }
    rings.push({ x: boss.node.x, z: boss.node.z, radius: rules.salvo.radius, node: boss.node.id });
    boss.timer = rules.salvo.warning;
    boss.rings = rings;
    helpers.warn(boss, 'MISSILE SALVO · LEAVE THE MARKED CIRCLES');
    helpers.telegraph(boss, 'salvo', rules.salvo.warning, rules.salvo.radius, { rings });
    helpers.emit(sim, boss, 'ability', { ability: 'salvo', rings, travel: rules.salvo.warning });
  } else if (attack === 'sweep') {
    // The cannon sweeps across the suit's side of the arena, through where the suit stands.
    const toSuit = Math.atan2(suit.player.x - boss.x, suit.player.z - boss.z);
    const half = phase.sweep / 2, side = boss.attackIndex % 2 ? 1 : -1;
    boss.sweep = { from: toSuit - half * side, to: toSuit + half * side, elapsed: 0, duration: 2.1 + phase.sweep * .25, tick: 0 };
    boss.timer = rules.sweep.warning;
    boss.heading = boss.sweep.from;
    helpers.warn(boss, 'LASER SWEEP · JUMP IT OR TAKE COVER');
    helpers.telegraph(boss, 'sweep', rules.sweep.warning, rules.sweep.length, { from: boss.sweep.from, to: boss.sweep.to });
    helpers.emit(sim, boss, 'ability', { ability: 'sweep' });
    aimBeam(sim, boss, boss.sweep.from, 'warn');
  } else if (attack === 'emp') {
    boss.timer = rules.emp.warning;
    helpers.warn(boss, 'EMP · YOUR TURRET AND DRONE WILL GO DOWN');
    helpers.telegraph(boss, 'emp', rules.emp.warning, rules.emp.radius);
    helpers.emit(sim, boss, 'ability', { ability: 'emp-warning' });
  } else {
    boss.timer = rules.drones.warning;
    helpers.warn(boss, 'DRONE BAY OPEN');
    helpers.emit(sim, boss, 'ability', { ability: 'drones-warning' });
  }
}

function finishAttack(sim, boss, helpers) {
  boss.state = 'hover';
  boss.cooldown = PHASES[boss.stage - 1].cooldown;
  boss.laser = null; boss.sweep = null; boss.rings = null;
  helpers.warn(boss, '');
}

function landSalvo(sim, boss, helpers) {
  const { salvo } = NANOBOT_RULES;
  for (const ring of boss.rings ?? []) {
    helpers.blast(sim, ring.x, 1, ring.z, ring.radius);
    for (const { player } of helpers.livingSuits(sim)) {
      if (distance(player, ring) <= ring.radius) sim.damageTarget(boss, 'player', salvo.suitDamage, ring, player.id);
    }
    const node = sim.nodes.find(item => item.health > 0 && distance(item, ring) <= ring.radius + 1.5);
    if (node) {
      helpers.setNode(boss, node);
      sim.damageTarget(boss, 'tissue', salvo.tissueDamage, ring);
    }
  }
  helpers.emit(sim, boss, 'ability', { ability: 'salvo-impact' });
  finishAttack(sim, boss, helpers);
}

// The beam runs from the belly cannon to the floor along a bearing, stopped by scenery.
function aimBeam(sim, boss, bearing, stage) {
  const { length } = NANOBOT_RULES.sweep;
  const from = nanobotPoint(boss, 0, -.42, .7);
  const end = { x: boss.x + Math.sin(bearing) * length, y: .3, z: boss.z + Math.cos(bearing) * length };
  const to = clip(sim.obstacles, { x: boss.x, y: .3, z: boss.z }, end);
  boss.laser = { stage, from, to: { x: to.x, y: .3, z: to.z }, bearing };
  return boss.laser;
}

function clip(obstacles, from, to) {
  let fraction = 1;
  const dx = to.x - from.x, dz = to.z - from.z, a = dx * dx + dz * dz;
  for (const [x, z, radius] of obstacles) {
    const ox = from.x - x, oz = from.z - z, c = ox * ox + oz * oz - radius * radius;
    if (c < 0 || !a) continue;
    const b = ox * dx + oz * dz, discriminant = b * b - a * c;
    if (discriminant < 0) continue;
    const entry = (-b - Math.sqrt(discriminant)) / a;
    if (entry >= 0 && entry < fraction) fraction = entry;
  }
  return { x: from.x + dx * fraction, z: from.z + dz * fraction };
}

function stepSweep(sim, boss, dt, helpers) {
  const { sweep } = NANOBOT_RULES;
  const state = boss.sweep;
  if (boss.timer > 0) { aimBeam(sim, boss, state.from, 'warn'); return; }
  state.elapsed += dt;
  const t = Math.min(1, state.elapsed / state.duration);
  const previous = state.bearing ?? state.from;
  const bearing = state.from + (state.to - state.from) * t;
  state.bearing = bearing;
  boss.heading = bearing;
  const beam = aimBeam(sim, boss, bearing, 'fire');
  // Far out the beam moves metres between frames, so it hits what it swept across since the last
  // one (within its reach, which scenery cuts short), not only what lies on it now.
  const reach = Math.hypot(beam.to.x - boss.x, beam.to.z - boss.z);
  const swept = target => {
    const d = Math.hypot(target.x - boss.x, target.z - boss.z);
    if (d > reach + .5) return false;
    const angle = Math.atan2(target.x - boss.x, target.z - boss.z);
    const half = Math.atan2(sweep.width, Math.max(1, d));
    const rel = value => Math.atan2(Math.sin(value - angle), Math.cos(value - angle));
    const a = rel(previous), b = rel(bearing);
    return Math.min(a, b) <= half && Math.max(a, b) >= -half;
  };
  state.hit ??= new Map();
  for (const { player } of helpers.livingSuits(sim)) {
    const key = player.id ?? 'solo';
    // Over the beam in a jump the suit is safe; each suit is burned at most once a tick.
    if ((player.lift ?? 0) > sweep.jump || !swept(player) || (state.hit.get(key) ?? -1) > sim.clock) continue;
    state.hit.set(key, sim.clock + sweep.tick);
    sim.damageTarget(boss, 'player', sweep.suitDamage, player, player.id);
  }
  for (const node of sim.nodes) {
    if (node.health <= 0 || !swept(node) || (state.hit.get(node.id) ?? -1) > sim.clock) continue;
    state.hit.set(node.id, sim.clock + sweep.tick);
    helpers.setNode(boss, node);
    sim.damageTarget(boss, 'tissue', sweep.tissueDamage, node);
  }
  if (t >= 1) finishAttack(sim, boss, helpers);
}

// Distance from a point to the beam's floor segment.
function offBeam(from, to, point) {
  const dx = to.x - from.x, dz = to.z - from.z, length = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / length));
  return Math.hypot(point.x - (from.x + dx * t), point.z - (from.z + dz * t));
}

function fireEmp(sim, boss, helpers) {
  const { emp } = NANOBOT_RULES;
  helpers.blast(sim, boss.x, 2, boss.z, emp.radius * .6);
  const downed = [];
  const companions = [...(sim.turrets ?? (sim.turret ? [sim.turret] : [])), ...(sim.drones ?? (sim.drone ? [sim.drone] : []))];
  for (const companion of companions) {
    if (!companion || distance(companion, boss) > emp.radius + 6) continue;
    companion.empUntil = sim.clock + emp.knockout;
    downed.push({ x: companion.x, y: companion.y ?? 1, z: companion.z, ownerId: companion.ownerId ?? null });
  }
  for (const { player } of helpers.livingSuits(sim)) {
    if (distance(player, boss) <= emp.radius) sim.damageTarget(boss, 'player', emp.suitDamage, boss, player.id);
  }
  helpers.emit(sim, boss, 'ability', { ability: 'emp', downed, radius: emp.radius });
  finishAttack(sim, boss, helpers);
}

function launchDrones(sim, boss, phase, helpers) {
  const bay = nanobotPoint(boss, 0, -.45, -.55);
  let launched = 0;
  phase.drones.forEach((type, index) => {
    const spread = (index - (phase.drones.length - 1) / 2) * 2.6;
    const drone = helpers.minion(sim, boss, type, bay.x + Math.cos(boss.heading) * spread, bay.z - Math.sin(boss.heading) * spread, boss.node);
    if (drone) launched++;
  });
  helpers.emit(sim, boss, 'ability', { ability: 'drones', launched });
  finishAttack(sim, boss, helpers);
}

// What the boss bar shows for it.
export function nanobotStatus(sim, boss) {
  const pylons = sim.enemies.filter(enemy => enemy.pylonOf === boss.id).length;
  return {
    phaseCount: 3,
    detail: boss.state === 'enter' ? 'Descending' : boss.shielded ? pylons === 1 ? 'Shield up · 1 pylon left' : `Shield up · ${pylons} pylons left` : 'Shield down · brain exposed',
    state: boss.shielded || boss.state === 'enter' ? 'sealed' : 'exposed',
  };
}
