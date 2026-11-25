// Endless mode: one arena, waves that never stop and keep getting harder. It wraps a freshly
// constructed solo Simulation the same way difficulty.mjs does, so the simulation itself stays
// unaware of it. Each wave is built from the arena's own authored waves, then grows:
//   - more pathogens (12% more of the template's roster every wave, and always more than the
//     wave before),
//   - arriving faster (down to half the authored spawn interval),
//   - with more health (+5% per wave) and harder strikes on tissue and suits (+3% per wave),
//   - and the arena's boss joins every fifth wave, tougher each time it comes back.
// The run ends only when a tissue node or the suit fails. There are no wave checkpoints.
import { LEVEL_BOSSES, spawnLevelBoss } from './level-bosses.mjs';

// Arenas whose waves are plain rosters with a level boss and no staged objective. Capillary
// Junction (timed surges), Heart Valve (rooted colonies), Gastric Chamber (intake and drain) and
// Neural Cortex (the Mega Virus) keep their scripted structure and are not offered.
export const ENDLESS_AREAS = Object.freeze(['artery', 'lungs', 'intestines', 'colon', 'lymph', 'ear']);

export const ENDLESS_RULES = Object.freeze({
  growth: .12, // extra share of the template roster per wave
  health: .05, // extra pathogen health per wave
  damage: .03, // extra tissue and suit damage per wave
  cadence: .965, // spawn interval multiplier per wave
  minCadence: .5, // never faster than half the authored interval
  bossEvery: 5, // the arena's boss joins every fifth wave
  bossGrowth: .25, // extra boss health each time it returns
  aliveCap: 80, // pathogens on the field at once; the rest wait their turn at the inlets
});

export function isEndlessArea(area) {
  return ENDLESS_AREAS.includes(area);
}

// How hard wave n (1-based) is, relative to the authored waves.
export function endlessScaling(wave) {
  const step = Math.max(0, wave - 1);
  const { growth, health, damage, cadence, minCadence, bossEvery } = ENDLESS_RULES;
  return {
    count: 1 + growth * step,
    health: 1 + health * step,
    damage: 1 + damage * step,
    cadence: Math.max(minCadence, cadence ** step),
    boss: wave % bossEvery === 0,
    bossCycle: Math.floor(wave / bossEvery),
  };
}

// The authored wave a generated wave is built on. The first pass plays the arena's waves in order;
// after that it cycles through the harder second half.
function templateFor(base, wave) {
  if (wave <= base.length) return base[wave - 1];
  const late = base.slice(Math.floor(base.length / 2));
  return late[(wave - base.length - 1) % late.length];
}

// Roster size of wave n: the template's roster grown by the wave's scale, and never fewer than
// MIN_STEP more pathogens than the wave before, so a short template cannot make a wave smaller.
const MIN_STEP = 3;
const sizes = new WeakMap();
function rosterSize(base, wave) {
  if (!sizes.has(base)) sizes.set(base, []);
  const known = sizes.get(base);
  for (let n = known.length + 1; n <= wave; n++) {
    const template = templateFor(base, n);
    const grown = Math.max(template.species.length, Math.round(template.species.length * endlessScaling(n).count));
    known.push(n === 1 ? grown : Math.max(grown, known[n - 2] + MIN_STEP));
  }
  return known[wave - 1];
}

// Builds wave n from the arena's authored rosters (already fielded five times over).
export function endlessWave(base, wave) {
  const template = templateFor(base, wave);
  const scale = endlessScaling(wave);
  const length = rosterSize(base, wave);
  const species = Array.from({ length }, (_, index) => template.species[index % template.species.length]);
  const lanes = template.lanes === undefined ? undefined
    : Array.from({ length }, (_, index) => template.lanes[index % template.lanes.length]).join('');
  return {
    ...template,
    name: template.name ? template.name + (wave > base.length ? ' · Wave ' + wave : '') : undefined,
    cadence: template.cadence * scale.cadence,
    species,
    ...(lanes === undefined ? {} : { lanes }),
    endlessWave: wave,
    endlessBoss: scale.boss,
  };
}

// Turns a freshly constructed solo Simulation into an endless run. Call before start().
export function applyEndless(sim) {
  if (!isEndlessArea(sim.area)) throw new Error('Endless mode is not available in ' + sim.area);
  const base = sim.missions.filter(mission => !mission.boss && Array.isArray(mission.species) && mission.species.length);
  const state = { base, bossSpawnedWave: 0, backlog: [], bestTissue: 100 };
  sim.endless = state;

  // Keep the roster one wave ahead of play, so difficulty.mjs (which reshapes every wave it can
  // see before each wave begins) treats generated waves like authored ones. Waves never reach the
  // final count, so no mission ever ends in a win.
  const ensure = count => {
    while (sim.missions.length < count) sim.missions.push(endlessWave(base, sim.missions.length + 1));
    sim.waves = sim.missions.length;
  };
  sim.missions = [];
  ensure(2);

  const reset = sim.reset.bind(sim);
  sim.reset = () => {
    reset();
    state.bossSpawnedWave = 0;
    state.backlog.length = 0;
    ensure(2);
  };

  const beginWave = sim.beginWave.bind(sim);
  sim.beginWave = () => {
    ensure(sim.wave + 2);
    sim.bossArrived = false;
    state.backlog.length = 0;
    const result = beginWave();
    sim.waves = sim.missions.length;
    return result;
  };

  // Endless runs have no wave checkpoints: losing ends the run.
  sim.captureCheckpoint = () => null;

  const scale = () => endlessScaling(Math.max(1, sim.wave));
  const createEnemy = sim.createEnemy.bind(sim);
  sim.createEnemy = (...args) => {
    const enemy = createEnemy(...args);
    enemy.health = enemy.maxHealth = Math.max(1, Math.round(enemy.maxHealth * scale().health));
    return enemy;
  };
  const damageNode = sim.damageNode.bind(sim);
  sim.damageNode = (node, amount) => damageNode(node, amount * scale().damage);
  const damageTarget = sim.damageTarget.bind(sim);
  // Tissue hits reach damageNode, so only suit hits are scaled here.
  sim.damageTarget = (enemy, target, amount, ...rest) =>
    damageTarget(enemy, target, target === 'player' ? amount * scale().damage : amount, ...rest);

  // Big waves outgrow the arena, so pathogens beyond the cap wait at their inlet and enter as the
  // field thins. Each keeps the spawn slot (and so the lane) it was given.
  const spawn = sim.spawn.bind(sim);
  sim.spawn = (type, encounter = null) => {
    if (sim.enemies.length < ENDLESS_RULES.aliveCap) return spawn(type, encounter);
    state.backlog.push({ type, encounter, index: sim.spawnIndex++ });
    return undefined;
  };
  const flush = () => {
    while (state.backlog.length && sim.enemies.length < ENDLESS_RULES.aliveCap && sim.phase === 'combat') {
      const { type, encounter, index } = state.backlog.shift();
      const next = sim.spawnIndex;
      sim.spawnIndex = index;
      spawn(type, encounter);
      sim.spawnIndex = next;
    }
  };

  const step = sim.step.bind(sim);
  sim.step = (dt, input) => {
    flush();
    step(dt, input);
    const mission = sim.missions[sim.wave - 1];
    if (sim.phase === 'combat' && mission?.endlessBoss && state.bossSpawnedWave !== sim.wave &&
      sim.spawnIndex >= mission.species.length && !state.backlog.length && LEVEL_BOSSES[sim.area]) {
      state.bossSpawnedWave = sim.wave;
      sim.bossArrived = true;
      const boss = spawnLevelBoss(sim);
      if (boss) {
        const extra = 1 + ENDLESS_RULES.bossGrowth * (endlessScaling(sim.wave).bossCycle - 1);
        boss.health = boss.maxHealth = Math.round(boss.maxHealth * extra);
      }
    }
    sim.remaining += state.backlog.length;
    if (sim.phase === 'combat' || sim.phase === 'intermission') state.bestTissue = Math.min(state.bestTissue, sim.tissue);
  };
  return sim;
}

// Waves the run fully cleared.
export function endlessWavesCleared(sim) {
  if (!sim?.endless) return 0;
  return Math.max(0, sim.phase === 'intermission' ? sim.wave : sim.wave - 1);
}

// ------------------------------------------------------------------ saved records

export const ENDLESS_RECORDS_KEY = 'immune-protocol.endless-records';

export function parseEndlessRecords(raw) {
  try {
    const value = JSON.parse(raw ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const records = {};
    for (const area of ENDLESS_AREAS) {
      const record = value[area];
      if (record && Number.isInteger(record.waves) && record.waves >= 0 && Number.isFinite(record.score)) {
        records[area] = { waves: record.waves, score: Math.max(0, Math.round(record.score)), difficulty: String(record.difficulty ?? 'medium') };
      }
    }
    return records;
  } catch {
    return {};
  }
}

// Returns the updated records and whether this run beat the arena's best (more waves, or the
// same waves for a higher score).
export function recordEndlessRun(records, { area, waves, score, difficulty }) {
  const previous = records[area];
  const better = !previous || waves > previous.waves || (waves === previous.waves && score > previous.score);
  if (!better || (waves === 0 && score === 0)) return { records, best: false, previous };
  return { records: { ...records, [area]: { waves, score, difficulty } }, best: true, previous };
}
