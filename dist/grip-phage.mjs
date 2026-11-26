// The Grip Phage: a phage that hunts suits rather than tissue. It pounces like a virus, but when
// the pounce lands on a suit it clings to the visor with its tail fibres: it smears its fluid over
// the glass, slows the suit and drains its integrity until it is torn off. A bash tears it off and
// throws it back, gunfire or a grenade kills it, a stun charge shakes it loose, and it lets go by
// itself after a few seconds. One can cling to a suit at a time.
//
// Pure simulation: the world reads `action === 'cling'` (and actionPlayerId) to keep the goo on the
// visor and pose the model, and the HUD prompts a bash while a suit is held.

export const GRIP_SPEC = Object.freeze({
  behavior: 'virus', radius: .84, y: 1.72, health: 70, speed: 2.95, suitDamage: 5, tissueDamage: 4, score: 210,
  grip: Object.freeze({
    // Authored suit damage per second while clinging, before difficulty and wave scaling (about
    // 2.5% of a suit a second on Medium, so a full hold costs about a ninth of it).
    drain: 12.5,
    // Seconds before it lets go by itself, and how long it keeps off the suit afterwards.
    hold: 4.5, rest: 2.4,
    // How much it slows the suit it holds, and where it sits: ahead of and below the eye.
    slow: .55, ahead: .72, below: .34,
  }),
});
const DRAIN_TICK = .3;

// The suit's living Grip Phage, if one holds it.
export function grippedBy(sim, player) {
  return sim.enemies.find(enemy => enemy.action === 'cling' && enemy.health > 0 &&
    (enemy.actionPlayerId ?? null) === (player.id ?? null)) ?? null;
}

// Called when a Grip Phage's pounce lands on a suit. Returns false if another already holds it.
export function startCling(sim, enemy, player) {
  if (grippedBy(sim, player)) return false;
  sim.setEnemyAction(enemy, 'cling');
  enemy.actionTarget = 'player';
  enemy.actionPlayerId = player.id ?? null;
  enemy.clingDrain = 0;
  placeOnVisor(enemy, player);
  sim.events.push({ type: 'grip', stage: 'start', id: enemy.id, ...(player.id != null ? { playerId: player.id } : {}), x: enemy.x, y: enemy.y, z: enemy.z });
  return true;
}

function placeOnVisor(enemy, player) {
  const { ahead, below } = GRIP_SPEC.grip;
  enemy.x = player.x - Math.sin(player.yaw) * ahead;
  enemy.z = player.z - Math.cos(player.yaw) * ahead;
  enemy.y = player.y - below;
  enemy.heading = Math.atan2(player.x - enemy.x, player.z - enemy.z);
}

export function advanceCling(sim, enemy, dt) {
  const player = sim.attackPlayer(enemy.actionPlayerId);
  // A stun charge or a bash elsewhere leaves it hanging where it was: if the suit has moved off,
  // it has lost its grip.
  if (!player || player.health <= 0 || Math.hypot(enemy.x - player.x, enemy.z - player.z) > 2.2) return releaseCling(sim, enemy, 'lost');
  placeOnVisor(enemy, player);
  enemy.clingDrain += dt;
  while (enemy.clingDrain >= DRAIN_TICK) {
    enemy.clingDrain -= DRAIN_TICK;
    sim.damageTarget(enemy, 'player', GRIP_SPEC.grip.drain * DRAIN_TICK, enemy, enemy.actionPlayerId);
  }
  if (sim.advanceAction(enemy, dt, GRIP_SPEC.grip.hold)) releaseCling(sim, enemy, 'tired');
}

// It lets go: pushed off a little in front of the suit, and keeps away for a moment.
export function releaseCling(sim, enemy, reason = 'tired') {
  if (enemy.action !== 'cling') return;
  const playerId = enemy.actionPlayerId;
  sim.setEnemyAction(enemy, 'idle');
  enemy.attackCooldown = Math.max(enemy.attackCooldown ?? 0, GRIP_SPEC.grip.rest);
  sim.ai?.director?.release(enemy.id);
  sim.events.push({ type: 'grip', stage: 'end', reason, id: enemy.id, ...(playerId != null ? { playerId } : {}), x: enemy.x, y: enemy.y, z: enemy.z });
}
