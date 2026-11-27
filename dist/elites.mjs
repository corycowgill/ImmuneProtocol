// Elite pathogens: now and then a pathogen arrives mutated, with a coloured glow that tells you
// which way, so later waves bring new threats rather than only more of the same.
//
//   armoured   gold glow    nearly twice the health, and a thickened coat that turns some of each
//              hit; slower.
//   swift      cyan glow    half again as fast, a little tougher, and recovers from its attacks sooner.
//   splitting  magenta glow tougher, and bursts into two fast fragments when it dies.
//
// None in the first waves or the scripted encounters. The chance grows through the campaign and
// with each wave (and through Endless); Easy halves it and Hard raises it. The choice is a
// deterministic hash of the run's seed, wave and spawn, so solo replays, co-op clients and tests
// agree. Elites are worth more score.
import { CAMPAIGN_AREAS } from './coop-protocol.mjs';

export const ELITES = Object.freeze({
  armoured: Object.freeze({ health: 1.9, damageScale: .72, speed: .85, score: 1.8, color: 0xffc24a }),
  swift: Object.freeze({ health: 1.25, speed: 1.5, cooldown: .6, score: 1.6, color: 0x5ff2ff }),
  splitting: Object.freeze({ health: 1.35, score: 1.7, splits: true, color: 0xff5ce1 }),
});
export const ELITE_KINDS = Object.freeze(Object.keys(ELITES));
// Drones and the Nanonaut can only come armoured (a splitting or regenerating soldier would make no sense).
const MACHINES = new Set(['rogue-bot', 'crawler', 'nanonaut']);
const NEVER = new Set(['colony']);

// Deterministic 0..1 from integers.
function hash(...values) {
  let n = 2166136261;
  for (const value of values) n = Math.imul(n ^ (value >>> 0), 16777619) ^ (n >>> 13);
  return ((n >>> 0) % 100000) / 100000;
}

// The chance that a pathogen spawned now is an elite.
export function eliteChance(sim) {
  if (sim.tutorial || sim.valve || sim.area === 'junction' || !sim.wave) return 0;
  const difficulty = sim.difficulty === 'easy' ? .5 : sim.difficulty === 'hard' ? 1.3 : 1;
  if (sim.endless) return Math.min(.25, .02 + .015 * sim.wave) * difficulty;
  const mission = Math.max(0, CAMPAIGN_AREAS.indexOf(sim.area));
  // The opening mission keeps its last waves for the first sightings.
  if (mission === 0 && sim.wave < 4) return 0;
  if (sim.wave < 2) return 0;
  return Math.min(.15, .03 + .01 * mission + .02 * (sim.wave - 2)) * difficulty;
}

// Picks whether (and how) a freshly spawned pathogen is an elite, and applies it.
export function maybeElite(sim, enemy, index) {
  if (enemy.boss || enemy.segmentOf || enemy.nest || enemy.fragment || enemy.tutorial || NEVER.has(enemy.type)) return null;
  const roll = hash(sim.encounterSeed ?? 0, sim.wave ?? 0, index, 7);
  if (roll >= eliteChance(sim)) return null;
  // Drones can only be armoured; everything else draws one of the three.
  const kind = MACHINES.has(enemy.type) ? 'armoured' : ELITE_KINDS[Math.floor(hash(sim.encounterSeed ?? 0, index, 31) * ELITE_KINDS.length)];
  return makeElite(enemy, kind);
}

export function makeElite(enemy, kind) {
  const trait = ELITES[kind];
  if (!trait) return null;
  enemy.elite = kind;
  enemy.maxHealth = enemy.health = Math.round(enemy.maxHealth * trait.health);
  if (trait.damageScale) enemy.damageScale = trait.damageScale;
  if (trait.speed) enemy.speedScale = trait.speed;
  if (trait.cooldown) enemy.cooldownScale = trait.cooldown;
  enemy.scoreScale = trait.score;
  return kind;
}
