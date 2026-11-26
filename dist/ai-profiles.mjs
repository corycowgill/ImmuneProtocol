// Local, deterministic tuning. Attack damage, speed, windups and models remain in SPECIES.
export const AI_CONFIG = Object.freeze({
  perceptionInterval: .15, decisionInterval: .32, squadInterval: .7, directorInterval: .5,
  sightBudget: 24, pathsPerStep: 2, pathInterval: 1.1, memorySeconds: 6,
  maxPressure: 9, maxTissuePressure: 5, maxEvents: 64, separationRadius: 3,
});

const base = {
  aggression: .7, courage: .65, awareness: 1, reaction: .18, preferredDistance: 3,
  sophistication: .3, teamwork: .7, evasion: .25, accuracy: .72,
  playerPriority: 1, tissuePriority: 1, sight: 27, fov: 2.5, biologicalRange: 4,
  hearing: 35, territory: 22, commitment: .65, decisionInterval: .32,
  actions: ['objective', 'pursue', 'investigate', 'flank', 'evade', 'idle'],
};
const profile = values => Object.freeze({ ...base, ...values, actions: Object.freeze(values.actions ?? base.actions) });
export const AI_PROFILES = Object.freeze({
  swarm: profile({ family: 'swarm', name: 'Swarm hunter', aggression: .9, courage: .9, sight: 24, preferredDistance: 2.8 }),
  colony: profile({ family: 'colony', name: 'Colony tactician', tissuePriority: 1.6, playerPriority: 0,
    sophistication: .65, sight: 22, preferredDistance: 1.9,
    actions: ['objective', 'flank', 'regroup', 'idle'] }),
  harasser: profile({ family: 'spores', name: 'Spore harasser', courage: .35, preferredDistance: 7,
    sophistication: .7, evasion: .8, sight: 32,
    actions: ['objective', 'pursue', 'investigate', 'flank', 'strafe', 'retreat', 'cover', 'evade', 'idle'] }),
  fast: profile({ family: 'swarm', name: 'Fast harasser', courage: .4, preferredDistance: 3,
    aggression: .85, evasion: .7, sophistication: .55,
    actions: ['objective', 'pursue', 'investigate', 'flank', 'strafe', 'retreat', 'evade', 'idle'] }),
  tank: profile({ family: 'colony', name: 'Armoured tissue breaker', courage: 1, tissuePriority: 2,
    playerPriority: 0, sophistication: .25, evasion: 0,
    actions: ['objective', 'protect', 'idle'] }),
  territorial: profile({ family: 'mutated', name: 'Territorial defender', courage: .45, tissuePriority: 1.5,
    playerPriority: 0, sophistication: .6, territory: 16, sight: 23,
    actions: ['objective', 'retreat', 'cover', 'regroup', 'idle'] }),
  drone: profile({ family: 'mechanical', name: 'Hacked medical drone', courage: .55, tissuePriority: 0,
    playerPriority: 1.8, preferredDistance: 13, sight: 40, fov: 3.8, biologicalRange: 0,
    sophistication: .8, reaction: .28, evasion: .35, teamwork: .55, hearing: 30,
    actions: ['patrol', 'pursue', 'investigate', 'flank', 'strafe', 'retreat', 'cover', 'evade', 'idle'] }),
  // The Grip Phage hunts suits: it senses them all round (its tail fibres feel the suit's wake),
  // ignores tissue unless no suit is in reach, and closes fast.
  grappler: profile({ family: 'swarm', name: 'Suit grappler', aggression: .95, courage: .95, playerPriority: 2.4,
    tissuePriority: .35, preferredDistance: 2.6, sight: 30, fov: 6.3, awareness: 1.3, evasion: .35, sophistication: .5 }),
  // The Crawler skitters in close on the floor, circles its target and darts away after it fires.
  skitter: profile({ family: 'mechanical', name: 'Hacked crawler drone', courage: .8, aggression: .95, tissuePriority: 0,
    playerPriority: 2, preferredDistance: 5, sight: 34, fov: 4.2, biologicalRange: 0,
    sophistication: .75, reaction: .2, evasion: .75, teamwork: .45, hearing: 34, decisionInterval: .24,
    actions: ['patrol', 'pursue', 'investigate', 'flank', 'strafe', 'evade', 'idle'] }),
});

// Species map to a local tactical profile; attack execution remains in the simulation.
export const SPECIES_AI = Object.freeze({
  virus: 'swarm', phage: 'swarm', flagellate: 'fast', splitter: 'fast',
  spore: 'harasser', blister: 'harasser', bacillus: 'colony', filovirus: 'colony',
  guard: 'tank', amoeba: 'territorial', rogue: 'territorial',
  'rogue-bot': 'drone', crawler: 'skitter', latcher: 'grappler',
});
export const AI_DIFFICULTY = Object.freeze({
  easy: Object.freeze({ reaction: 1.5, decision: 1.25, pressure: 4, teamwork: .6, accuracy: .8 }),
  medium: Object.freeze({ reaction: 1, decision: 1, pressure: 6, teamwork: .85, accuracy: 1 }),
  hard: Object.freeze({ reaction: .8, decision: .85, pressure: 7, teamwork: 1, accuracy: 1.05 }),
});
