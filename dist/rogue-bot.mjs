import { clearSegment } from './ai-navigation.mjs';

export const ROGUE_BOT_SPEC = Object.freeze({ behavior: 'laser', radius: 1.08, y: 2.15,
  health: 88, speed: 3.4, suitDamage: 16, tissueDamage: 0, score: 240 });
export const LASER_RULES = Object.freeze({ range: 28, minimumRange: 4, windup: .95, flash: .16, recovery: .5, cooldown: 2.2, radius: .61 });

// The same conservative obstacle footprints as ordinary attacks. Clip the visible beam
// before it can reach cover, including cover a suit moves behind during the warning.
export function clipLaser(obstacles, from, to) {
  let fraction = 1;
  const dx = to.x - from.x, dz = to.z - from.z, a = dx * dx + dz * dz;
  for (const [x, z, radius] of obstacles) {
    const ox = from.x - x, oz = from.z - z, c = ox * ox + oz * oz - radius * radius;
    if (c < 0) { fraction = 0; break; }
    if (!a) continue;
    const b = ox * dx + oz * dz, discriminant = b * b - a * c;
    if (discriminant < 0) continue;
    const entry = (-b - Math.sqrt(discriminant)) / a;
    if (entry >= 0 && entry < fraction) fraction = entry;
  }
  return { x: from.x + dx * fraction, y: from.y + (to.y - from.y) * fraction, z: from.z + dz * fraction };
}

export function startBotLaser(sim, enemy, target, targetName) {
  const c = sim.ai.controllers.get(enemy.id);
  const range = target ? Math.hypot(target.x - enemy.x, target.z - enemy.z) : Infinity;
  if (targetName !== 'player' || !target || target.health <= 0 || sim.attackPlayer(target.id) !== target ||
      !c?.targetKey?.startsWith('player:') || c.attackTarget() !== target ||
      range > LASER_RULES.range || range < LASER_RULES.minimumRange ||
      !clearSegment(sim.obstacles, enemy, target)) return false;
  enemy.heading = Math.atan2(target.x - enemy.x, target.z - enemy.z);
  const from = { x: enemy.x + Math.sin(enemy.heading) * 1.1, y: enemy.y - .02, z: enemy.z + Math.cos(enemy.heading) * 1.1 };
  if (!clearSegment(sim.obstacles, enemy, from, .04) || !sim.ai.director.acquire(enemy, 'player', 1.9)) return false;
  const length = Math.max(.001, Math.hypot(target.x - from.x, target.y - from.y, target.z - from.z));
  const to = { x: from.x + (target.x - from.x) / length * LASER_RULES.range,
    y: from.y + (target.y - from.y) / length * LASER_RULES.range, z: from.z + (target.z - from.z) / length * LASER_RULES.range };
  enemy.actionTarget = 'player'; enemy.actionPlayerId = target.id;
  enemy.laser = { from, aim: to, to: clipLaser(sim.obstacles, from, to), stage: 'warning', remaining: LASER_RULES.windup };
  sim.setEnemyAction(enemy, 'laser-windup'); sim.attackEvent(enemy, 'windup', 'player');
  return true;
}

function cancel(sim, enemy) {
  enemy.laser = null; enemy.attackCooldown = .5; sim.setEnemyAction(enemy, 'idle'); sim.ai.director.release(enemy.id);
}

function fire(sim, enemy, spec) {
  const beam = enemy.laser;
  beam.to = clipLaser(sim.obstacles, beam.from, beam.aim);
  const dx = beam.to.x - beam.from.x, dy = beam.to.y - beam.from.y, dz = beam.to.z - beam.from.z;
  const length = dx * dx + dy * dy + dz * dz;
  let hit = null, first = Infinity;
  for (const { player } of sim.activeSuits()) {
    if (player.health <= 0 || !length) continue;
    const x = player.x - beam.from.x, y = player.y - beam.from.y, z = player.z - beam.from.z;
    const t = (x * dx + y * dy + z * dz) / length;
    if (t < 0 || t > 1 || t >= first || Math.hypot(x - dx * t, y - dy * t, z - dz * t) > LASER_RULES.radius ||
        !clearSegment(sim.obstacles, beam.from, player)) continue;
    first = t; hit = player;
  }
  sim.attackEvent(enemy, 'release', 'player');
  if (hit) {
    beam.to = { x: beam.from.x + dx * first, y: beam.from.y + dy * first, z: beam.from.z + dz * first };
    sim.damageTarget(enemy, 'player', spec.suitDamage, beam.to, hit.id);
    sim.attackEvent(enemy, 'impact', 'player', beam.to, hit.id);
  } else sim.attackEvent(enemy, 'miss', 'player', beam.to);
  beam.stage = 'fire'; beam.remaining = LASER_RULES.flash;
  sim.setEnemyAction(enemy, 'laser-fire');
}

export function stepRogueBot(sim, enemy, dt, spec, speedFactor, controller) {
  enemy.attackingTissue = false;
  if (enemy.action === 'laser-windup') {
    if (!(sim.attackPlayer(enemy.actionPlayerId)?.health > 0) || controller.action === 'evade') { cancel(sim, enemy); return; }
    const ready = sim.advanceAction(enemy, dt, LASER_RULES.windup);
    enemy.laser.remaining = Math.max(0, LASER_RULES.windup - enemy.actionElapsed);
    if (ready) fire(sim, enemy, spec);
    return;
  }
  if (enemy.action === 'laser-fire') {
    enemy.laser.remaining = Math.max(0, LASER_RULES.flash - enemy.actionElapsed - dt);
    if (sim.advanceAction(enemy, dt, LASER_RULES.flash)) { enemy.laser = null; sim.setEnemyAction(enemy, 'laser-recover'); }
    return;
  }
  if (enemy.action === 'laser-recover') {
    if (sim.advanceAction(enemy, dt, LASER_RULES.recovery)) {
      enemy.attackCooldown = LASER_RULES.cooldown; sim.setEnemyAction(enemy, 'idle'); sim.ai.director.release(enemy.id);
    }
    return;
  }
  enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
  enemy.y = spec.y + Math.sin(sim.clock * 2 + enemy.id) * .07;
  const target = controller.targetKey?.startsWith('player:') ? controller.attackTarget() : null;
  const defensive = ['retreat', 'cover', 'evade', 'investigate', 'idle', 'patrol'].includes(controller.action);
  if (!defensive && target && enemy.attackCooldown === 0 && startBotLaser(sim, enemy, target, 'player')) return;
  controller.move(dt, spec.speed * speedFactor, target && controller.action === 'pursue' ? controller.profile.preferredDistance : 0);
}
