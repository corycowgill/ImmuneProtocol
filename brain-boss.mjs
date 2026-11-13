const lobes = [
  ['left', 'Left core', -7.15, 4.15, -18.1, 2.34, .98],
  ['center', 'Central core', 0, 5.65, -21, 3.05, 1.16],
  ['right', 'Right core', 7.15, 4.15, -18.1, 2.34, .98],
];

export const BRAIN_BOSS_LOBES = lobes.map(([id, label, x, y, z, radius, weakRadius]) => ({
  id, x, y, z, radius,
  weakPoint: { id, label, x, y, z: z + radius - .04, radius: weakRadius },
}));

const PHASES = [
  { health: 1232, sealed: 4.5, warning: 2.1, exposed: 2.75, points: [1], spawn: ['virus', 'virus'] },
  { health: 616, sealed: 3.9, warning: 2, exposed: 2.6, points: [0, 2], spawn: ['virus', 'spore', 'virus'] },
  { health: 0, sealed: 3.4, warning: 1.85, exposed: 2.45, points: [2, 0, 1], spawn: ['guard', 'splitter', 'virus'] },
];
const MAX_HEALTH = 1848;
const COLLAPSE_TIME = 1.25;

export function createBrainBoss(sim) {
  const { sealed } = PHASES[0];
  const boss = {
    health: MAX_HEALTH, maxHealth: MAX_HEALTH, phase: 1, state: 'sealed', remaining: sealed,
    duration: sealed, cycle: 0, openings: 0, openness: 0, weakPoint: null, targetNodeId: null,
  };
  sim.boss = boss;
  sim.player.reserve = Math.max(66, sim.player.reserve);
  startCycle(sim);
  emit(sim, 'phase');
}

function emit(sim, stage, point = sim.boss.weakPoint) {
  const { phase } = sim.boss;
  sim.events.push({ type: 'boss', stage, phase, x: point.x, y: point.y, z: point.z });
}

function setState(boss, state, duration) {
  boss.state = state;
  boss.remaining = boss.duration = duration;
  boss.openness = state === 'exposed' ? 1 : 0;
}

function startCycle(sim) {
  const { boss } = sim;
  const pattern = PHASES[boss.phase - 1];
  const index = pattern.points[boss.cycle % pattern.points.length];
  boss.weakPoint = BRAIN_BOSS_LOBES[index].weakPoint;
  const lane = index === 1 ? boss.openings % 2 : index === 0 ? 0 : 1;
  boss.targetNodeId = sim.nodes[lane].id;
  setState(boss, 'sealed', pattern.sealed);
}

function spawnBrood(sim) {
  if (sim.enemies.length >= 6) return;
  const { boss, nodes } = sim;
  const focus = Number(boss.targetNodeId === nodes[1].id);
  const pattern = PHASES[boss.phase - 1].spawn;
  for (const [index, species] of pattern.entries()) {
    const lane = (focus + index) % 2;
    const lobe = BRAIN_BOSS_LOBES[lane * 2];
    const enemy = sim.createEnemy(species, lobe.x + (lane === 0 ? -1.7 : 1.7), lobe.z + 1.2 + index * 1.3, nodes[lane]);
    sim.enemies.push(enemy);
    emit(sim, 'spawn', enemy);
  }
}

export function stepBrainBoss(sim, dt) {
  const { boss } = sim;
  boss.remaining = Math.max(0, boss.remaining - dt);
  if (boss.state === 'defeated') return;
  if (boss.remaining <= 1e-8) {
    const pattern = PHASES[boss.phase - 1];
    if (boss.state === 'sealed') {
      setState(boss, 'warning', pattern.warning);
      if (sim.player.ammo + sim.player.reserve < 24) sim.player.reserve += 42;
      emit(sim, 'warning');
      if (boss.openings === 0) spawnBrood(sim);
    } else if (boss.state === 'warning') {
      setState(boss, 'exposed', pattern.exposed);
      boss.openings++;
      emit(sim, 'expose');
      if (boss.openings > 1) spawnBrood(sim);
    } else {
      emit(sim, 'closing');
      boss.cycle++;
      startCycle(sim);
    }
  }
  if (boss.state === 'exposed') {
    const elapsed = boss.duration - boss.remaining;
    boss.openness = Math.min(1, elapsed / .24, boss.remaining / .24);
  }
  const node = sim.nodes.find(item => item.id === boss.targetNodeId);
  const active = boss.state === 'exposed';
  sim.organ = {
    phase: active ? 'active' : boss.state === 'warning' ? 'warning' : 'recovery',
    label: 'Neural overload · ' + node.name,
    detail: active ? 'Takes extra damage. Repairs blocked' : 'Next node under pressure',
    remaining: boss.remaining,
    x: node.x, z: node.z, radius: 5.4, nodeId: node.id, repairBlocked: active,
  };
}

function intersect(origin, ray, sphere, radius = sphere.radius) {
  const x = sphere.x - origin.x;
  const y = sphere.y - origin.y;
  const z = sphere.z - origin.z;
  const forward = x * ray.x + y * ray.y + z * ray.z;
  const discriminant = radius ** 2 - (x * x + y * y + z * z - forward * forward);
  if (forward <= 0 || discriminant < 0) return Infinity;
  return Math.max(0, forward - Math.sqrt(discriminant));
}

export function traceBrainBoss(boss, origin, ray, limit) {
  if (!boss || boss.state === 'defeated') return null;
  let nearest = limit;
  let hit = null;
  for (const lobe of BRAIN_BOSS_LOBES) {
    const weakPoint = lobe.weakPoint;
    const shell = intersect(origin, ray, lobe);
    const exposed = boss.state === 'exposed' && boss.openness > .36 && boss.weakPoint.id === weakPoint.id &&
      origin.z > weakPoint.z + .35 && ray.z < -.14;
    let weak = Infinity;
    if (exposed) {
      const plane = (weakPoint.z - origin.z) / ray.z;
      const aperture = weakPoint.radius * boss.openness;
      const withinPort = Math.hypot(origin.x + plane * ray.x - weakPoint.x, origin.y + plane * ray.y - weakPoint.y) <= aperture;
      if (withinPort) weak = intersect(origin, ray, weakPoint, aperture);
    }
    const vulnerability = weak < nearest;
    const distance = vulnerability ? weak : shell;
    if (distance >= nearest) continue;
    nearest = distance;
    hit = { distance, vulnerable: vulnerability };
  }
  return hit;
}

export function hitBrainBoss(sim, hit, impact) {
  const { boss } = sim;
  if (!hit.vulnerable) {
    emit(sim, 'block', impact);
    return;
  }
  const pattern = PHASES[boss.phase - 1];
  boss.health = Math.max(pattern.health, boss.health - 28);
  emit(sim, 'hit', impact);
  if (boss.health > pattern.health) return;
  if (boss.phase === 3) {
    setState(boss, 'defeated', COLLAPSE_TIME);
    sim.organ.phase = 'recovery';
    sim.organ.repairBlocked = false;
    sim.score += 3000;
    sim.kills++;
    emit(sim, 'defeated');
    return;
  }
  boss.phase++;
  boss.cycle = 0;
  startCycle(sim);
  emit(sim, 'phase');
}
