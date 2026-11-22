// Solo difficulty modes. Medium is the tuned baseline; Easy and Hard scale it per mission when it starts.
// Online co-op always plays Medium because the server runs its own simulation.

export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({
    name: 'Easy',
    summary: 'Learn the arenas. Fewer, weaker pathogens arrive more slowly and tissue holds out longer.',
    changes: [
      'One in three pathogens removed from each wave, the rest arriving 30% more slowly',
      'Pathogens and the Mega Virus have 25% less health',
      'Tissue takes 35% less damage, your suit 40% less (hazards included)',
      'Repair pulses restore 30% more tissue',
      'Place your auto-turret twice per mission, so you can move it once',
      'Slower pathogen reactions, less information sharing and at most three ordinary high-pressure attacks',
    ],
    enemyHealth: .75, tissueDamage: .65, suitDamage: .6, cadence: 1.3, drop: 3, extra: 0, repair: 1.3, turrets: 2,
  }),
  medium: Object.freeze({
    name: 'Medium',
    summary: 'The standard campaign balance. Every mission is tuned around this setting.',
    changes: [
      'Standard wave sizes and spawn timing',
      'Standard pathogen health and damage',
      'Standard tactical reactions and at most four ordinary high-pressure attacks',
      'One auto-turret placement per mission',
    ],
    enemyHealth: 1, tissueDamage: 1, suitDamage: 1, cadence: 1, drop: 0, extra: 0, repair: 1, turrets: 1,
  }),
  hard: Object.freeze({
    name: 'Hard',
    summary: 'For veterans. Bigger, tougher waves arrive faster and hit harder, and repairs are slower.',
    changes: [
      'One extra pathogen for every seven (none in Gastric Chamber), arriving 10% faster',
      'Pathogens and the Mega Virus have 15% more health',
      'Tissue takes 10% more damage in two-node arenas, your suit 15% more everywhere (hazards included)',
      'Repair pulses restore 15% less tissue',
      'Faster tactical reactions, stronger colony coordination and at most five ordinary high-pressure attacks',
      'One auto-turret placement per mission',
    ],
    enemyHealth: 1.15, tissueDamage: 1.1, suitDamage: 1.15, cadence: .9, drop: 0, extra: 7, repair: .85, turrets: 1,
  }),
});

export const DEFAULT_DIFFICULTY = 'medium';

// Per-mission exceptions layered on a mode, checked with tools/balance/balance-bot.mjs. Three-node
// arenas already stretch one suit thin, so applyDifficulty never raises their tissue damage.
export const MISSION_TUNING = Object.freeze({
  medium: Object.freeze({
    // The longest final wave in the campaign, and the Biofilm Colossus arrives at the end of it.
    colon: Object.freeze({ cadence: 1.2 }),
  }),
  hard: Object.freeze({
    // The drained basin already sends six flankers and two counterattacks into the final wave.
    stomach: Object.freeze({ extra: 0, tissueDamage: 1, cadence: 1.05 }),
    // The Rogue Macrophage punishes a suit that is caught; Hard's extra suit damage made it a one-mistake fight.
    lymph: Object.freeze({ suitDamage: 1 }),
    // Three nodes more than fifty metres apart and a squeeze that sweeps the whole chamber.
    colon: Object.freeze({ extra: 0, cadence: 1.1, suitDamage: 1 }),
  }),
});

// Gap between a Hard reinforcement and the pathogen it follows in a Capillary Junction surge.
const EXTRA_ARRIVAL_GAP = .34;

export function normalizeDifficulty(id) {
  return Object.hasOwn(DIFFICULTIES, id) ? id : DEFAULT_DIFFICULTY;
}

const reinforcement = type => type === 'guard' ? 'virus' : type;

// Thins out (Easy) or reinforces (Hard) a spawn list, keeping each pathogen's lane letter with it.
function reshapeWave(wave, { cadence, drop, extra }) {
  const species = [];
  let lanes = wave.lanes === undefined ? undefined : '';
  wave.species.forEach((type, index) => {
    const lane = wave.lanes?.[index];
    if (drop && index % drop === drop - 1) return;
    species.push(type);
    if (lanes !== undefined) lanes += lane;
    if (extra && index % extra === extra - 1) {
      species.push(reinforcement(type));
      if (lanes !== undefined) lanes += lane;
    }
  });
  return { ...wave, cadence: wave.cadence * cadence, species, ...(lanes === undefined ? {} : { lanes }) };
}

// Capillary Junction waves are timed surges. The first pathogen of each surge carries its forecast,
// so it always stays; the rest are thinned or reinforced like any other wave.
function reshapeArrivals(wave, { cadence, drop, extra }) {
  const surges = wave.surges.map(surge => ({ ...surge, at: surge.at * cadence }));
  const arrivals = [];
  wave.arrivals.forEach((arrival, index) => {
    const surge = arrival.surge ? surges[wave.surges.indexOf(arrival.surge)] : null;
    const at = arrival.at * cadence;
    if (drop && !surge && index % drop === drop - 1) return;
    arrivals.push({ ...arrival, at, surge });
    if (extra && index % extra === extra - 1) {
      arrivals.push({ ...arrival, at: at + EXTRA_ARRIVAL_GAP * cadence, type: reinforcement(arrival.type), surge: null });
    }
  });
  arrivals.sort((a, b) => a.at - b.at);
  return { ...wave, arrivals, surges };
}

function reshapeMission(wave, level) {
  if (wave.boss) return wave;
  if (wave.arrivals) return reshapeArrivals(wave, level);
  // The heart colony wave is a single boss organism; only its health and damage scale.
  if (wave.species.length === 1 && wave.species[0] === 'colony') return wave;
  return reshapeWave(wave, level);
}

// Applies a difficulty to a freshly constructed solo Simulation before it starts.
export function applyDifficulty(sim, id) {
  sim.difficulty = normalizeDifficulty(id);
  if (sim.difficulty === DEFAULT_DIFFICULTY) return sim;
  const level = { ...DIFFICULTIES[sim.difficulty], ...MISSION_TUNING[sim.difficulty]?.[sim.area] };

  // Reshaped waves are cached so the Capillary Junction overtime wave, appended mid-mission,
  // gets the same treatment when it begins.
  const reshaped = new WeakMap();
  const outputs = new WeakSet();
  const shape = wave => {
    if (outputs.has(wave)) return wave;
    if (!reshaped.has(wave)) {
      const result = reshapeMission(wave, level);
      outputs.add(result);
      reshaped.set(wave, result);
    }
    return reshaped.get(wave);
  };
  const shapeMissions = () => {
    sim.missions = sim.missions.map(shape);
    sim.waves = sim.missions.length;
  };
  shapeMissions();
  const beginWave = sim.beginWave.bind(sim);
  sim.beginWave = () => {
    shapeMissions();
    return beginWave();
  };

  const tissueDamage = sim.nodes.length > 2 ? Math.min(1, level.tissueDamage) : level.tissueDamage;
  sim.repairAmount = Math.round(sim.repairAmount * level.repair);
  // The Mega Virus loses a fixed amount per hit, so its health scales through the hit size.
  sim.enemyHealthScale = level.enemyHealth;

  const createEnemy = sim.createEnemy.bind(sim);
  sim.createEnemy = (...args) => {
    const enemy = createEnemy(...args);
    enemy.health = enemy.maxHealth = Math.max(1, Math.round(enemy.maxHealth * level.enemyHealth));
    return enemy;
  };
  // Every tissue loss, including the Capillary Junction gash drain, goes through damageNode.
  const damageNode = sim.damageNode.bind(sim);
  sim.damageNode = (node, amount) => damageNode(node, amount * tissueDamage);
  const damageTarget = sim.damageTarget.bind(sim);
  sim.damageTarget = (enemy, target, amount, ...rest) =>
    damageTarget(enemy, target, target === 'player' ? amount * level.suitDamage : amount, ...rest);
  const reset = sim.reset.bind(sim);
  sim.reset = () => {
    reset();
    sim.turretCharges = level.turrets;
  };
  sim.turretCharges = level.turrets;
  return sim;
}
