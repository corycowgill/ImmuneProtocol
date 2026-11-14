export const GASTRIC_VALVES = Object.freeze([
  Object.freeze({ id: 'gastric-intake', name: 'Intake valve', x: -17, y: 1.25, z: -1 }),
  Object.freeze({ id: 'gastric-drain', name: 'Drain valve', x: 16, y: 1.25, z: -9 }),
]);
export const GASTRIC_PASSAGE = Object.freeze({ x: 0, y: 1.5, z: 23 });
export const GASTRIC_REPAIR_RADIUS = 2.7;

const DRAIN_TIME = 2.4;
const CHANNEL_LEVEL = .68;
const COUNTERATTACK_WARNING = 2.4;
const FLANKS = [
  { at: 1.8, lane: 1, type: 'virus' },
  { at: 3.8, lane: 0, type: 'bacillus' },
  { at: 6.15, lane: 1, type: 'spore' },
  { at: 7.5, lane: 0, type: 'virus' },
];

export function createGastric() {
  const [intake, drain] = GASTRIC_VALVES.map(valve => ({ ...valve, progress: 0, points: 0 }));
  return {
    stage: 'flooded', intake, drain, remaining: 0, level: 1, sealPoints: 36,
    incoming: null, flankRemaining: null, nextFlank: 0, counterattacks: [],
  };
}

function emit(sim, stage, point) {
  sim.events.push({ type: 'gastric', stage, x: point.x, y: point.y, z: point.z, name: point.name });
}

export function startGastric(sim) {
  const { gastric, clock } = sim;
  gastric.stage = 'intake';
  gastric.counterattacks.push({ at: clock + 4.6, lane: 0, type: 'virus' });
  emit(sim, 'start', gastric.intake);
}

export function gastricValve(gastric) {
  return gastric?.stage === 'intake' ? gastric.intake : gastric?.stage === 'drain' ? gastric.drain : null;
}

export function repairGastricValve(sim, valve) {
  const { gastric } = sim;
  valve.points = Math.min(gastric.sealPoints, valve.points + sim.repairAmount);
  valve.progress = valve.points / gastric.sealPoints;
  if (valve.progress < 1) return false;

  sim.score += 150;
  if (valve === gastric.intake) {
    gastric.stage = 'drain';
    gastric.level = CHANNEL_LEVEL;
    gastric.counterattacks.push({ at: sim.clock + 5.1, lane: 1, type: 'spore' });
    shapeGastricHazard(sim);
    emit(sim, 'intake-closed', valve);
  } else {
    gastric.stage = 'draining';
    gastric.remaining = DRAIN_TIME;
    gastric.flankRemaining = DRAIN_TIME + FLANKS[0].at;
    emit(sim, 'draining', valve);
  }
  return true;
}

export function shapeGastricHazard(sim) {
  const { gastric, organ } = sim;
  if (!gastric || !organ || (gastric.stage !== 'drain' && gastric.stage !== 'draining')) return;
  const draining = gastric.stage === 'draining';
  organ.x = 5.8;
  organ.radius = draining ? 5.5 * gastric.level / CHANNEL_LEVEL : 5.5;
  organ.label = draining ? 'Draining acid' : organ.phase === 'recovery' ? 'Drain-channel surge in' : 'Drain-channel surge';
  organ.detail = 'Keep clear of the drain channel';
}

function advanceCounterattacks(sim) {
  const { gastric, clock } = sim;
  gastric.incoming = null;
  for (const attack of gastric.counterattacks) {
    if (attack.spawned) continue;
    const remaining = attack.at - clock;
    const node = sim.nodes[attack.lane];
    if (remaining <= COUNTERATTACK_WARNING && !attack.warned) {
      attack.warned = true;
      emit(sim, 'counterattack', node);
    }
    if (remaining <= 0) {
      attack.spawned = true;
      sim.enemies.push(sim.createEnemy(attack.type, node.x + Math.sign(node.x) * 8, node.z - 11, node));
      emit(sim, 'counterattack-arrival', node);
    } else if (attack.warned && (!gastric.incoming || remaining < gastric.incoming.remaining)) {
      gastric.incoming = { remaining, name: node.name };
    }
  }
}

export function advanceGastric(sim, dt) {
  const { gastric } = sim;
  advanceCounterattacks(sim);
  if (gastric.stage === 'draining') {
    gastric.remaining = Math.max(0, gastric.remaining - dt);
    gastric.level = CHANNEL_LEVEL * gastric.remaining / DRAIN_TIME;
    gastric.flankRemaining = gastric.remaining + FLANKS[0].at;
    if (gastric.remaining > 1e-9) {
      shapeGastricHazard(sim);
    } else {
      gastric.stage = 'drained';
      gastric.level = 0;
      sim.organ = null;
      sim.beginWave();
      emit(sim, 'drained', GASTRIC_PASSAGE);
    }
  }
  if (gastric.stage === 'drained') {
    const elapsed = sim.clock - sim.waveStartedAt;
    let flank = FLANKS[gastric.nextFlank];
    while (flank && flank.at <= elapsed + 1e-9) {
      const { x, z } = GASTRIC_PASSAGE;
      const offset = flank.lane === 0 ? -1.15 : 1.15;
      sim.enemies.push(sim.createEnemy(flank.type, x + offset, z, sim.nodes[flank.lane]));
      if (gastric.nextFlank === 0) emit(sim, 'flank', GASTRIC_PASSAGE);
      gastric.nextFlank++;
      flank = FLANKS[gastric.nextFlank];
    }
    gastric.flankRemaining = gastric.nextFlank === 0 ? FLANKS[0].at - elapsed : null;
  }
  if (!sim.player.ammo && !sim.player.reserve && sim.enemies.length) {
    sim.player.reserve = sim.magazineSize;
  }
}

export function pendingGastricEnemies(gastric) {
  return gastric?.stage === 'drained'
    ? FLANKS.length - gastric.nextFlank + gastric.counterattacks.filter(attack => !attack.spawned).length
    : 0;
}
