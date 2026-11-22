import { ORGAN_MISSIONS } from './organs.mjs';
import { grow, growPoint } from './arena-scale.mjs';
import { AIWorld } from './tactical-ai.mjs';
import { clearSegment } from './ai-navigation.mjs';
import { bossDamageThreat, telegraph } from './boss-tactics.mjs';
import { planEncounters, stepEncounters, ENCOUNTER_RULES } from './encounters.mjs';
import { advanceNest, planFieldObjectives, stepFieldObjectives } from './field-objectives.mjs';
import { stepBossArrival, stepLevelBoss } from './level-bosses.mjs';
import { createBrainBoss, stepBrainBoss, traceBrainBoss, hitBrainBoss } from './brain-boss.mjs';
import { FIELD_UPGRADES } from './loadouts.mjs';
import {
  DEFAULT_WEAPON_STATS, WEAPON_SLOTS, legacyWeaponLoadout, loadoutInSlot, magazineCapacity, normalizeWeaponLoadout,
  otherSlot, weaponStats,
} from './weapon-mods.mjs';
import {
  GASTRIC_REPAIR_RADIUS, advanceGastric, createGastric, gastricValve, pendingGastricEnemies, repairGastricValve, shapeGastricHazard, startGastric,
} from './gastric.mjs';

export const OBJECTIVE = Object.freeze({ x: 0, y: 1.25, z: -8 });
// Every arena is an ellipse this many metres wide (x) and deep (z) from its centre.
export const ARENA = Object.freeze({ x: 55, z: 77 });
export const TISSUE_NODES = Object.freeze({
  artery: Object.freeze([
    Object.freeze({ id: 'artery-core', name: 'Arterial Core', x: 0, y: 1.25, z: grow(-16) }),
    Object.freeze({ id: 'artery-flank', name: 'Lateral Branch', x: grow(21), y: 1.25, z: grow(9) }),
    Object.freeze({ id: 'artery-venous', name: 'Venous Wall', x: grow(-20), y: 1.25, z: grow(12) }),
  ]),
  junction: Object.freeze([
    Object.freeze({ id: 'junction-amber', name: 'Amber Node', x: grow(-15), y: 1.25, z: grow(-9) }),
    Object.freeze({ id: 'junction-teal', name: 'Teal Node', x: grow(15), y: 1.25, z: grow(-9) }),
  ]),
  heart: Object.freeze([
    Object.freeze({ id: 'heart-valve', name: 'Valve Wound', ...OBJECTIVE }),
    Object.freeze({ id: 'heart-flank', name: 'Septal Node', x: 17, y: 1.25, z: 11 }),
  ]),
  ...Object.fromEntries(Object.entries(ORGAN_MISSIONS).map(([area, mission]) =>
    [area, Object.freeze(mission.nodes.map(node => Object.freeze(node)))],
  )),
});
// Clots that break up the open artery floor: cover between the nodes, a splitter in front of the
// main inlet, and blockers on the long flanks. [x, z, radius], authored like the organ obstacles.
const ARTERY_OBSTACLES = [
  [-11, -4, 3.4], [11, -5, 3], [0, 10, 3.6], [-27, -11, 3.2], [28, -13, 3.2],
  [-9, 33, 3], [15, 35, 3.2], [0, -37, 3.4], [-30, 20, 2.8], [33, 20, 2.8],
].map(growPoint);

// Solid scenery a suit cannot walk through, for any arena.
export function arenaObstacles(area) {
  return ORGAN_MISSIONS[area]?.obstacles ?? (area === 'artery' ? ARTERY_OBSTACLES : []);
}

export const JUNCTION_INLETS = Object.freeze({
  left: Object.freeze({ x: grow(-29), y: 1.42, z: grow(-33) }),
  right: Object.freeze({ x: grow(29), y: 1.42, z: grow(-33) }),
});
export const JUNCTION_GASH_SITES = Object.freeze({
  // Each gash opens on the inlet side of its node, at a fixed offset from it.
  left: Object.freeze({ x: grow(-15) - 3.4, y: 0.95, z: grow(-9) - 4.6 }),
  right: Object.freeze({ x: grow(15) + 3.4, y: 0.95, z: grow(-9) - 4.6 }),
});
export const HEART_VALVE = Object.freeze({ x: 0, y: 2, z: -10.7, radius: 3.65 });

export const RULES = Object.freeze({
  health: 100,
  tissue: 100,
  magazine: 30,
  repairRadius: 5.4,
  arenaX: ARENA.x,
  arenaZ: ARENA.z,
});

// Every species fights with one of three behaviors: virus (coil and lunge), bacillus
// (latch onto tissue and tear) or spore (keep distance and spit). Variants stand in
// for a base species in later waves and stay close to its numbers.
export const SPECIES = {
  virus: { radius: 0.92, y: 1.63, health: 60, speed: 2.28, suitDamage: 11, tissueDamage: 6, score: 100 },
  bacillus: { radius: 1.12, y: 1.13, health: 115, speed: 1.47, tissueDamage: 10, period: 1.75, score: 180 },
  spore: { radius: 0.73, y: 2.10, health: 36, speed: 3.55, suitDamage: 9, tissueDamage: 4, score: 130 },
  guard: { behavior: 'bacillus', radius: 1.32, y: 1.33, health: 144, speed: 1.62, tissueDamage: 12, period: 1.9, score: 260 },
  splitter: { behavior: 'virus', radius: 1.07, y: 1.75, health: 84, speed: 3.35, suitDamage: 13, tissueDamage: 7, score: 200 },
  colony: { radius: 1.10, y: 3.35, health: 1100, tissueDamage: 11, period: 1.57, score: 900 },
  phage: { behavior: 'virus', radius: 0.88, y: 1.85, health: 52, speed: 2.6, suitDamage: 10, tissueDamage: 5, score: 115 },
  flagellate: { behavior: 'virus', radius: 0.95, y: 1.5, health: 66, speed: 2.45, suitDamage: 12, tissueDamage: 6, score: 125 },
  blister: { behavior: 'spore', radius: 0.84, y: 2.2, health: 44, speed: 3.2, suitDamage: 10, tissueDamage: 5, score: 150 },
  filovirus: { behavior: 'bacillus', radius: 1.15, y: 1.2, health: 118, speed: 1.55, tissueDamage: 10, period: 1.7, score: 195 },
  amoeba: { behavior: 'bacillus', radius: 1.2, y: 1.25, health: 126, speed: 1.22, tissueDamage: 9, period: 1.95, score: 205 },
  rogue: { behavior: 'bacillus', radius: 1.2, y: 1.3, health: 128, speed: 1.5, tissueDamage: 11, period: 1.8, score: 225 },
};

const FRAGMENT = { radius: .55, y: 1.35, health: 24, speed: 4.05, suitDamage: 5, tissueDamage: 2, score: 55 };
const TUTORIAL_ATTACKER_HEALTH = 34;
const GUARD_FRONT_THRESHOLD = .55;

// Every wave fields three times its authored roster; encounters can regroup ordinary arrivals.
export const WAVE_SCALE = 3;
export const extendRoster = roster => Array.from({ length: WAVE_SCALE }, () => roster).flat();

const MISSIONS = [
  { cadence: 1.55, species: ['virus', 'virus', 'virus', 'spore', 'virus', 'virus', 'spore', 'virus', 'virus'] },
  { cadence: 1.30, species: ['virus', 'spore', 'virus', 'bacillus', 'virus', 'spore', 'bacillus', 'virus', 'virus', 'spore', 'virus', 'bacillus', 'spore'] },
  { cadence: 1.05, species: ['spore', 'virus', 'bacillus', 'virus', 'spore', 'spore', 'bacillus', 'virus', 'bacillus', 'spore', 'virus', 'bacillus', 'virus', 'spore', 'virus', 'bacillus'] },
  { cadence: 0.90, species: ['virus', 'bacillus', 'spore', 'spore', 'bacillus', 'virus', 'phage', 'bacillus', 'spore', 'filovirus', 'spore', 'virus', 'bacillus', 'spore', 'virus', 'phage', 'spore', 'bacillus', 'virus'] },
  { cadence: 0.76, species: ['bacillus', 'spore', 'virus', 'filovirus', 'spore', 'phage', 'bacillus', 'blister', 'bacillus', 'virus', 'spore', 'filovirus', 'spore', 'bacillus', 'phage', 'spore', 'virus', 'bacillus', 'virus', 'blister', 'bacillus', 'virus'] },
];

for (const mission of MISSIONS) mission.species = extendRoster(mission.species);

const SURGE_SPACING = .68;
const JUNCTION_NODE_INDEX = { left: 0, right: 1 };

function junctionMission(name, groups, bonus = 0) {
  const surges = [];
  const arrivals = [];
  for (const [at, branch, threat, species] of groups) {
    const nodeName = TISSUE_NODES.junction[JUNCTION_NODE_INDEX[branch]].name;
    const surge = { at, branch, nodeName, threat };
    surges.push(surge);
    for (const [index, type] of extendRoster(species).entries()) {
      arrivals.push({ at: at + index * SURGE_SPACING, type, branch, surge: index === 0 ? surge : null });
    }
  }
  return { name, lane: surges[0].branch, bonus, surges, arrivals };
}

const JUNCTION_MISSIONS = [
  junctionMission('Virus Rush', [
    [2, 'left', 'Virus rush', ['virus', 'virus', 'virus', 'virus']],
    [6.4, 'right', 'Virus rush', ['virus', 'virus']],
  ]),
  junctionMission('Spore Crossfire', [
    [1.2, 'left', 'Spore volley', ['spore', 'virus', 'spore']],
    [5.8, 'right', 'Spore volley', ['spore', 'virus', 'spore']],
  ]),
  junctionMission('Breach', [
    [1.2, 'left', 'Virus rush', ['virus', 'virus', 'virus']],
    [7.2, 'right', 'Bacillus breach', ['bacillus', 'spore']],
    [11.8, 'left', 'Spore volley', ['spore', 'spore']],
  ]),
];

const JUNCTION_OVERTIME = junctionMission('Overtime', [
  [2, 'right', 'Bacillus breach', ['bacillus', 'virus', 'virus']],
  [4.7, 'left', 'Spore volley', ['spore', 'spore', 'spore', 'spore']],
  [8.8, 'right', 'Bacillus breach', ['bacillus', 'virus']],
], 2000);

const HEART_MISSIONS = [{ species: ['colony'] }];
const HEART_CLOSED_TIME = 3.8;
const HEART_OPEN_TIME = 3.4;
const HEART_LEAFLET_TIME = 0.42;
const HEART_MIN_PLAYER_Z = -9.8;
const HEART_MAX_PLAYER_Z = 28;
const HEART_MAX_PLAYER_X = 20;
const HEART_PATROL = extendRoster(['virus', 'spore', 'bacillus', 'spore', 'virus', 'virus', 'bacillus', 'spore', 'virus', 'bacillus']);
// Seconds between patrol arrivals.
const HEART_PATROL_PACE = 3.2;
const HEART_PATROL_ENTRIES = [{ x: 19, z: 27 }, { x: -18, z: 24 }, { x: 22, z: -4 }];
// Which areas each species attacks in, for the disease guide. Gastric
// counterattacks and Mega Virus broods only use species already in their waves.
export function speciesHabitats() {
  const rosters = {
    artery: MISSIONS.flatMap(wave => wave.species),
    junction: [...JUNCTION_MISSIONS, JUNCTION_OVERTIME].flatMap(wave => wave.arrivals.map(arrival => arrival.type)),
    heart: [...HEART_MISSIONS.flatMap(wave => wave.species), ...HEART_PATROL],
    ...Object.fromEntries(Object.entries(ORGAN_MISSIONS).map(([area, mission]) => [area, mission.waves.flatMap(wave => wave.species)])),
  };
  rosters.lungs.push(...AIRWAY_ATTACKS.flatMap(attack => attack.species));
  const habitats = Object.fromEntries(Object.keys(SPECIES).map(type => [type, []]));
  for (const [area, species] of Object.entries(rosters)) {
    for (const type of new Set(species)) habitats[type].push(area);
  }
  return habitats;
}

const AIRWAY_SEAL_POINTS = 36;
const AIRWAY_MINIMUM_INTEGRITY = 45;
const AIRWAY_ATTACK_WARNING = 2.4;
const AIRWAY_ATTACKS = [
  { lane: 1, delay: 4.6, species: ['spore'] },
  { lane: 0, delay: 3.4, species: ['bacillus', 'virus'] },
  { lane: 1, delay: 6.8, species: ['spore', 'virus'] },
];

// Spawn routes per tissue node, kept 20 m or more from the node they attack.
export const ENTRANCES = [
  [[-6, -54], [9, -53], [-20, -48], [20, -47]],
  [[38, -15], [40, -4], [30, 36], [36, 24]],
  [[-38, -14], [-40, -6], [-27, 40], [-34, 28]],
].map(route => route.map(growPoint));

const TURN_SENSITIVITY = 0.00225;
const RIFLE_RANGE = 68;
// Rockets fly no farther than this before they burst.
const ROCKET_RANGE = 60;
const REPAIR_TIME = 0.82;
const REPAIR_PER_CYCLE = 13;
const INTERMISSION_TIME = 6.5;
// Pause between the final kill of a wave and the wave-clear / armory screen.
export const WAVE_OUTRO_TIME = 4;
// Nodes sit much farther apart in the enlarged arenas, so each one soaks a little more punishment.
// Waves field three times the pathogens, so each strike on tissue or suit takes proportionally
// less. Pathogens also arrive a little further apart so the longer waves do not pile up faster than they can be shot.
const WAVE_CADENCE = 1.35;
const WAVE_SUIT_DAMAGE = .4;
const WAVE_TISSUE_DAMAGE = .25;
const THREE_NODE_TISSUE_DAMAGE = .5;
const ORGAN_TISSUE_DAMAGE = .72;
const JUNCTION_BREAK_TIME = 8;
const JUNCTION_REPAIR_TIME = 9;
const JUNCTION_EXTRACT_DELAY = 1.25;
const JUNCTION_GASH_REPAIR_RADIUS = 2.4;
const JUNCTION_GASH_SEAL_POINTS = 36;
const JUNCTION_GASH_DRAIN = .85;
const REINFORCEMENT_TIME = 12;
const REINFORCEMENT_HOLD = 2;
const REINFORCED_SPEED = .6;
const LATCH_RANGE = 1.9;
const LATCH_WINDUP = 0.45;
const LATCH_TEAR = 0.27;
const VIRUS_WINDUP = 0.5;
const VIRUS_POUNCE = 0.22;
const VIRUS_RECOVERY = 0.42;
const VIRUS_RANGE = 3.6;
const SPORE_WINDUP = 0.55;
const SPORE_RECOVERY = 0.55;
const SPORE_RANGE = 8.2;
const SPORE_SPEED = 7.3;
const SPORE_RADIUS = 0.21;
const SPORE_ARM_TIME = 0.12;
const TURRET_RANGE = 12.5;
const TURRET_INTERVAL = 2.6;
const TURRET_DAMAGE = 20;
const TURRET_SLOW_TIME = 1.4;
const TURRET_SLOW_FACTOR = .48;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function chamberRadius(x, z) {
  return Math.hypot(x / RULES.arenaX, z / RULES.arenaZ);
}

function confineToChamber(player, obstacles) {
  const radius = chamberRadius(player.x, player.z);
  if (radius > 1) {
    player.x /= radius;
    player.z /= radius;
  }
  if (!obstacles) return;
  for (const [x, z, size] of obstacles) {
    const dx = player.x - x;
    const dz = player.z - z;
    const distance = Math.hypot(dx, dz);
    if (distance >= size || distance < 1e-6) continue;
    player.x = x + dx / distance * size;
    player.z = z + dz / distance * size;
  }
}

function withinHazard(actor, hazard) {
  const dx = actor.x - hazard.x;
  const dz = actor.z - hazard.z;
  return hazard.radius ? Math.hypot(dx, dz) <= hazard.radius
    : Math.abs(dx) <= hazard.width / 2 && Math.abs(dz) <= hazard.depth / 2;
}

function guardFaces(enemy, source) {
  const dx = source.x - enemy.x;
  const dz = source.z - enemy.z;
  return dx * Math.sin(enemy.heading) + dz * Math.cos(enemy.heading) > GUARD_FRONT_THRESHOLD * Math.hypot(dx, dz);
}

export class Simulation {
  constructor(area = 'artery', {
    tutorial = false, upgrades = [], bossPractice = false, weaponLoadout, weaponMod = 'standard', ai = {}, encounterSeed,
  } = {}) {
    this.organMission = Object.hasOwn(ORGAN_MISSIONS, area) ? ORGAN_MISSIONS[area] : null;
    this.area = this.organMission || area === 'heart' || area === 'junction' ? area : 'artery';
    this.obstacles = arenaObstacles(this.area);
    this.missions = this.organMission?.waves ?? (this.area === 'heart' ? HEART_MISSIONS : this.area === 'junction' ? JUNCTION_MISSIONS : MISSIONS);
    this.hasTutorial = tutorial && this.area === 'artery';
    this.bossPractice = bossPractice && this.area === 'brain';
    const activeUpgrades = !this.hasTutorial && Array.isArray(upgrades) ? upgrades : [];
    this.baseMagazineSize = activeUpgrades.includes('deep-magazine') ? FIELD_UPGRADES['deep-magazine'].magazineSize : RULES.magazine;
    this.repairAmount = activeUpgrades.includes('fast-sealer') ? FIELD_UPGRADES['fast-sealer'].repairAmount : REPAIR_PER_CYCLE;
    this.hazardDamageMultiplier = activeUpgrades.includes('insulated-suit') ? FIELD_UPGRADES['insulated-suit'].damageMultiplier : 1;
    this.turretSlowDuration = activeUpgrades.includes('turret-stabilizer') ? FIELD_UPGRADES['turret-stabilizer'].slowDuration : TURRET_SLOW_TIME;
    this.weaponLoadout = Object.freeze(normalizeWeaponLoadout(weaponLoadout ?? legacyWeaponLoadout(weaponMod)));
    this.configuredWeapon = weaponStats(this.weaponLoadout);
    this.aiOptions = ai;
    this.encounterSeed = (encounterSeed ?? ai.seed ?? Math.floor(Math.random() * 4294967296)) >>> 0;
    this.reset();
  }

  setWeaponLoadout(value, suit = this) {
    const previous = suit.weaponLoadout;
    const previousReload = suit.weapon.reloadSeconds;
    suit.weaponLoadout = Object.freeze(normalizeWeaponLoadout(value));
    suit.configuredWeapon = weaponStats(suit.weaponLoadout);
    const { player, magazineSize } = suit;
    suit.slotAmmo ??= {};
    if (previous.slot !== suit.weaponLoadout.slot || previous.weapon !== suit.weaponLoadout.weapon) {
      // Each carried weapon keeps its own magazine; a reload in progress is abandoned.
      suit.slotAmmo[previous.slot] = { weapon: previous.weapon, ammo: player.ammo };
      const stored = suit.slotAmmo[suit.weaponLoadout.slot];
      player.ammo = stored?.weapon === suit.weaponLoadout.weapon ? Math.min(stored.ammo, magazineSize) : magazineSize;
      suit.reloading = 0;
      return;
    }
    player.ammo = Math.min(player.ammo, magazineSize);
    if (player.ammo === magazineSize) suit.reloading = 0;
    else if (suit.reloading > 0) suit.reloading *= suit.weapon.reloadSeconds / previousReload;
  }

  // Brings out the other carried weapon. It can't fire until the swap finishes.
  swapWeapon(suit = this) {
    if (this.tutorial || suit.repairing) return false;
    this.setWeaponLoadout(loadoutInSlot(suit.weaponLoadout, otherSlot(suit.weaponLoadout.slot)), suit);
    suit.switching = suit.weapon.switchSeconds;
    suit.fireCooldown = Math.max(suit.fireCooldown, suit.switching);
    const event = { type: 'swap', weapon: suit.weaponLoadout.weapon, slot: suit.weaponLoadout.slot };
    if (suit.player.id != null) event.playerId = suit.player.id;
    this.events.push(event);
    return true;
  }

  get switchProgress() {
    return this.switching > 0 ? 1 - this.switching / this.weapon.switchSeconds : 0;
  }

  setWeaponMod(id) {
    const loadout = legacyWeaponLoadout(id, this.weaponLoadout.finish);
    if (!Object.keys(WEAPON_SLOTS).some(slot => loadout[slot] === id)) return false;
    this.setWeaponLoadout({ ...loadout, accent: this.weaponLoadout.accent });
    return true;
  }

  get weapon() {
    return this.tutorial || (this.phase === 'ready' && this.hasTutorial) ? DEFAULT_WEAPON_STATS : this.configuredWeapon;
  }

  get magazineSize() {
    return magazineCapacity(this.weapon, this.baseMagazineSize);
  }

  get reloadProgress() {
    return this.reloading > 0 ? 1 - this.reloading / this.weapon.reloadSeconds : 0;
  }

  get organWave() {
    return this.organMission?.waves[this.wave - 1]?.name ?? null;
  }

  get tissue() {
    return this.nodes.reduce((sum, node) => sum + node.health, 0) / this.nodes.length;
  }

  get turretPlacement() {
    return this.turretPlacementFor(this.player);
  }

  turretPlacementFor(player) {
    if ((!this.turretCharges && !this.canRedeployTurret) || this.tutorial || this.extractionPending ||
      (this.phase !== 'combat' && this.phase !== 'intermission')) return null;
    const { x, z, yaw } = player;
    const point = { x: x - Math.sin(yaw) * 2.2, y: 0, z: z - Math.cos(yaw) * 2.2 };
    if (this.valve && (Math.abs(point.x) > HEART_MAX_PLAYER_X - .65 ||
      point.z < HEART_MIN_PLAYER_Z + .65 || point.z > HEART_MAX_PLAYER_Z - .65)) return null;
    if (chamberRadius(point.x, point.z) > .975) return null;
    if (this.obstacles.some(([x, z, size]) => Math.hypot(point.x - x, point.z - z) < size)) return null;
    if (this.nodes.some(node => Math.hypot(point.x - node.x, point.z - node.z) < 1.9)) return null;
    if (this.gash && Math.hypot(point.x - this.gash.x, point.z - this.gash.z) < 1.6) return null;
    return point;
  }

  get junctionWave() {
    return this.area === 'junction' ? this.missions[this.wave - 1] ?? null : null;
  }

  get junctionForecast() {
    return this.area === 'junction' ? this.missions[this.wave] ?? null : null;
  }

  get junctionSurge() {
    if (this.phase === 'intermission' && !this.settling) {
      const surge = this.junctionForecast?.surges[0];
      return surge ? { ...surge, remaining: this.intermission + surge.at } : null;
    }
    if (this.phase !== 'combat') return null;
    const surge = this.junctionWave?.surges[this.junctionSurgeIndex];
    return surge ? { ...surge, remaining: Math.max(0, surge.at - (this.clock - this.waveStartedAt)) } : null;
  }

  get overtimeForecast() {
    return this.area === 'junction' && !this.overtime ? JUNCTION_OVERTIME : null;
  }

  get canRedeployTurret() {
    return !!this.turret && this.junctionSupply === 'turret' && !this.junctionSupplyLocked &&
      this.phase === 'intermission' && !!this.junctionForecast;
  }

  selectJunctionSupply(choice) {
    if (this.phase !== 'intermission' || !this.junctionForecast || this.junctionSupplyLocked ||
      !['left', 'right', 'ammo', 'turret'].includes(choice) || (choice === 'turret' && !this.turret)) return false;
    this.junctionSupply = choice;
    return true;
  }

  chooseExtraction(choice) {
    if (!this.extractionPending || (choice !== 'extract' && choice !== 'stay')) return false;
    this.extractionPending = false;
    this.events = [];
    if (choice === 'extract') {
      this.endMission('won');
    } else {
      this.overtime = true;
      this.settling = false;
      this.junctionGashOpened = false;
      this.missions = [...JUNCTION_MISSIONS, JUNCTION_OVERTIME];
      this.waves = this.missions.length;
      this.beginWave();
    }
    return true;
  }

  reset() {
    this.ai?.dispose();
    if (this.overtime) this.missions = JUNCTION_MISSIONS;
    this.valve = this.area === 'heart' ? {
      phase: 'closed', duration: HEART_CLOSED_TIME, remaining: HEART_CLOSED_TIME,
      openness: 0, exposed: false, colonyDefeated: false,
    } : null;
    this.phase = 'ready';
    this.tutorial = null;
    this.player = {
      x: 0, y: 1.7, z: this.valve ? 4 : grow(this.area === 'junction' ? 20 : 26), yaw: 0, pitch: 0,
      health: RULES.health, ammo: this.magazineSize, score: 0, kills: 0,
    };
    if (this.organMission) [this.player.x, this.player.z] = this.organMission.entry;
    this.nodes = TISSUE_NODES[this.area].map(node => ({ ...node, health: RULES.tissue, underAttack: false }));
    this.objective = this.nodes[0];
    this.failedNode = null;
    this.wave = 0;
    this.waves = this.missions.length;
    this.clock = 0;
    this.score = 0;
    this.kills = 0;
    this.pickups = [];
    this.field = null;
    this.encounter = null;
    this.encounterPlan = null;
    this.nextPickupId = 1;
    this.bossArrived = false;
    this.bossTrail = null;
    this.checkpoint = null;
    this.remaining = 0;
    this.repairProgress = 0;
    this.repairing = false;
    this.repairTarget = null;
    this.nearTissue = false;
    this.nearNode = null;
    this.nearGash = false;
    this.nearGastricValve = null;
    this.canRepair = false;
    this.gash = null;
    this.junctionGashOpened = false;
    this.junctionSupply = null;
    this.junctionSupplyLocked = false;
    this.junctionSurgeIndex = 0;
    this.waveStartedAt = 0;
    this.reinforcement = null;
    this.intermission = 0;
    this.settling = false;
    this.extractionPending = false;
    this.overtime = false;
    this.overtimeBonus = 0;
    this.outro = null;
    this.reloading = 0;
    this.fireCooldown = 0;
    this.reloadHeld = false;
    this.switching = 0;
    this.slotAmmo = {};
    this.rockets = [];
    this.spawnIndex = 0;
    this.spawnCountdown = 0;
    this.nextEnemyId = 1;
    this.enemies = [];
    this.nextProjectileId = 1;
    this.projectiles = [];
    this.turretCharges = 1;
    this.turret = null;
    this.patrolIndex = 0;
    this.colony = null;
    this.events = [];
    this.organCycle = 0;
    this.organNextDamage = 0;
    this.boss = null;
    this.airway = null;
    this.gastric = this.area === 'stomach' ? createGastric() : null;
    this.organ = this.organMission ? this.createOrganPhase('recovery') : null;
    this.ai = new AIWorld(this, this.aiOptions);
  }

  // checkpoint: resume at the start of a wave recorded by an earlier run of this mission
  // (see captureCheckpoint) instead of from the beginning.
  start(checkpoint = null) {
    this.reset();
    if (checkpoint) {
      this.restoreCheckpoint(checkpoint);
      return;
    }
    if (this.bossPractice) this.wave = this.missions.findIndex(mission => mission.boss);
    this.beginWave();
    if (this.valve) {
      this.objective.health = RULES.tissue - 2 * REPAIR_PER_CYCLE;
      this.colony = this.createEnemy('colony', HEART_VALVE.x, -13.25, this.objective);
      this.enemies.push(this.colony);
      return;
    }
    if (this.hasTutorial) {
      this.tutorial = 'observe';
      this.player.z = this.objective.z + 10.5;
      const attacker = this.createEnemy('bacillus', this.objective.x - 3.25, this.objective.z + 5.6, this.objective);
      attacker.tutorial = true;
      attacker.health = attacker.maxHealth = TUTORIAL_ATTACKER_HEALTH;
      this.enemies.push(attacker);
      this.spawnIndex = 1;
    }
  }

  beginWave() {
    this.checkpoint = this.captureCheckpoint();
    this.wave += 1;
    this.phase = 'combat';
    this.intermission = 0;
    this.spawnIndex = 0;
    this.junctionSurgeIndex = 0;
    this.outro = null;
    this.waveStartedAt = this.clock;
    if (this.organ) {
      this.organCycle = this.wave - 1;
      this.organ = this.createOrganPhase('recovery');
    }
    this.spawnCountdown = this.wave === 1 ? 0.8 : 0.65;
    const mission = this.missions[this.wave - 1];
    if (mission.boss) createBrainBoss(this);
    this.remaining = mission.boss ? 1 : (mission.arrivals ?? mission.species).length;
    planFieldObjectives(this);
    planEncounters(this);
    this.applyJunctionSupply();
    this.events.push({ type: 'wave', wave: this.wave, stage: 'start' });
  }

  applyJunctionSupply() {
    const choice = this.junctionSupply;
    const movedTurret = this.junctionSupplyLocked;
    this.junctionSupply = null;
    this.junctionSupplyLocked = false;
    this.reinforcement = null;
    if (choice === 'ammo') {
      for (const suit of this.activeSuits()) {
        suit.player.ammo = suit.magazineSize;
        suit.reloading = 0;
      }
      this.events.push({ type: 'junctionSupply', choice });
    } else if (choice === 'left' || choice === 'right') {
      this.reinforcement = { branch: choice, remaining: REINFORCEMENT_TIME, duration: REINFORCEMENT_TIME, started: false };
      this.events.push({ type: 'junctionSupply', choice, ...JUNCTION_INLETS[choice] });
    } else if (movedTurret) {
      this.events.push({ type: 'junctionSupply', choice });
    }
  }

  clearWave() {
    this.encounter = null;
    this.encounterPlan = null;
    this.projectiles.length = 0;
    this.pickups = [];
    this.reinforcement = null;
    this.score += 250 * this.wave;
    this.events.push({ type: 'wave', wave: this.wave, stage: 'clear' });
    if (this.wave === this.waves) {
      if (this.area === 'junction') {
        this.settling = true;
        this.phase = 'intermission';
        this.intermission = JUNCTION_REPAIR_TIME;
      } else if (this.area === 'lungs') {
        this.startAirwayObjective();
      } else {
        this.endMission('won');
      }
      return;
    }
    this.phase = 'intermission';
    if (this.organ) {
      this.organCycle = this.wave;
      this.organ = this.createOrganPhase('recovery');
    }
    const junction = this.area === 'junction';
    this.intermission = junction ? JUNCTION_BREAK_TIME : INTERMISSION_TIME;
    this.restoreSuitHealthAfterWave(junction ? 12 : 18);
    if (this.gastric) startGastric(this);
  }

  // Everything a retry needs to resume at the start of the wave about to begin (or of the
  // lungs' final airway objective): what carries from wave to wave. Pathogens, shots and the
  // suits' positions start fresh. Plain data, so the co-op server can keep it between matches.
  captureCheckpoint(stage = 'wave') {
    return {
      stage,
      wave: stage === 'airway' ? this.wave : this.wave + 1,
      clock: this.clock,
      encounterSeed: this.encounterSeed,
      score: this.score,
      kills: this.kills,
      nodes: Object.fromEntries(this.nodes.map(node => [node.id, node.health])),
      suits: this.activeSuits().map(({ player }) => ({
        id: player.id ?? null, health: player.health, score: player.score ?? 0, kills: player.kills ?? 0,
      })),
      turretCharges: this.turretCharges,
      turret: this.turret ? { x: this.turret.x, y: this.turret.y, z: this.turret.z, yaw: this.turret.yaw, pitch: this.turret.pitch } : null,
      junctionSupply: this.junctionSupply,
      junctionSupplyLocked: this.junctionSupplyLocked,
      overtime: this.overtime,
      hazard: !!this.organ,
      gastric: this.gastric ? structuredClone(this.gastric) : null,
    };
  }

  restoreCheckpoint(checkpoint) {
    if (Number.isInteger(checkpoint.encounterSeed)) this.encounterSeed = checkpoint.encounterSeed >>> 0;
    this.clock = checkpoint.clock;
    this.score = checkpoint.score;
    this.kills = checkpoint.kills;
    for (const node of this.nodes) node.health = checkpoint.nodes[node.id] ?? node.health;
    this.turretCharges = checkpoint.turretCharges;
    this.turret = checkpoint.turret ? { ...checkpoint.turret, cooldown: .6, targetId: null } : null;
    this.junctionSupply = checkpoint.junctionSupply;
    this.junctionSupplyLocked = checkpoint.junctionSupplyLocked;
    if (checkpoint.overtime) {
      this.overtime = true;
      this.missions = [...JUNCTION_MISSIONS, JUNCTION_OVERTIME];
      this.waves = this.missions.length;
    }
    if (checkpoint.gastric) this.gastric = structuredClone(checkpoint.gastric);
    if (!checkpoint.hazard) this.organ = null;
    this.restoreSuits(checkpoint.suits);
    if (checkpoint.stage === 'airway') {
      this.wave = this.waves;
      this.phase = 'combat';
      this.startAirwayObjective();
    } else {
      this.wave = checkpoint.wave - 1;
      this.beginWave();
    }
    if (this.gastric) shapeGastricHazard(this);
    this.events.push({ type: 'checkpoint', stage: 'restored', wave: checkpoint.wave, airway: checkpoint.stage === 'airway' });
  }

  // A suit brought back at a checkpoint has at least half its integrity, so a retry is not lost
  // before it starts. Score and kills are as they were.
  restoreSuits(saved = []) {
    this.activeSuits().forEach(({ player }, index) => {
      const record = saved.find(entry => entry.id !== null && entry.id === (player.id ?? null)) ?? (player.id == null ? saved[index] : null);
      if (!record) return;
      player.health = Math.max(RULES.health / 2, record.health);
      player.score = record.score;
      player.kills = record.kills;
    });
  }

  // Holds the wave open for a short countdown after the last pathogen dies, then runs finish().
  advanceOutro(dt, ready, finish) {
    if (!ready) {
      this.outro = null;
      return;
    }
    if (!this.outro) {
      this.outro = { remaining: WAVE_OUTRO_TIME, duration: WAVE_OUTRO_TIME, final: this.wave >= this.waves };
      this.events.push({ type: 'outro', stage: 'start', wave: this.wave, final: this.outro.final });
      return;
    }
    this.outro.remaining = Math.max(0, this.outro.remaining - dt);
    if (this.outro.remaining > 1e-9) return;
    this.outro = null;
    finish();
  }

  restoreSuitHealthAfterWave(health, player = this.player) {
    player.health = Math.min(RULES.health, player.health + health);
  }

  endMission(outcome, reason) {
    this.encounter = null;
    this.encounterPlan = null;
    if (outcome === 'won' && this.overtime && !this.overtimeBonus) {
      this.overtimeBonus = JUNCTION_OVERTIME.bonus;
      this.score += this.overtimeBonus;
    }
    this.phase = outcome;
    this.projectiles.length = 0;
    this.events.push({ type: 'mission', outcome, reason, nodeId: this.failedNode?.id });
  }

  activeSuits() {
    return [this];
  }

  moveSuits(dt, input) {
    this.movePlayer(dt, input);
    if (this.organ?.phase === 'active') this.applyOrganHazard(dt);
  }

  actSuits(dt, input) {
    if (input.deploy) this.deployTurret();
    const repairing = this.updateRepair(dt, input.repair);
    this.updateRifle(dt, input, repairing);
  }

  updateSuitStatus() {}

  suitsDefeated() {
    return this.player.health === 0;
  }

  step(dt, input = {}) {
    this.events = [];
    if (this.extractionPending || (this.phase !== 'combat' && this.phase !== 'intermission')) return;
    dt = clamp(dt, 0, 0.1);
    this.clock += dt;
    for (const node of this.nodes) node.underAttack = false;
    if (this.valve) {
      this.updateValve();
      this.advanceColony(dt);
      this.spawnHeartPatrol();
    }
    if (this.boss) stepBrainBoss(this, dt);
    else if (this.organ) this.updateOrgan(dt);
    this.moveSuits(dt, input);
    if (this.gash) {
      this.damageNode(this.gash.node, this.gash.drainPerSecond * dt);
    }
    if (this.failedNode) {
      this.endMission('lost', 'tissue');
      return;
    }
    this.updateSuitStatus();
    if ((this.organ || this.gastric) && this.suitsDefeated()) {
      this.endMission('lost', 'suit');
      return;
    }
    this.actSuits(dt, input);
    this.updateTurret(dt);

    if (this.valve) {
      this.advanceEnemies(dt);
      this.advanceProjectiles(dt);
      this.updateSuitStatus();
      this.remaining = this.enemies.length + Math.max(0, HEART_PATROL.length - this.patrolIndex);
      this.settling = this.valve.colonyDefeated;
      if (this.failedNode) this.endMission('lost', 'tissue');
      else if (this.suitsDefeated()) this.endMission('lost', 'suit');
      else {
        this.advanceOutro(dt, this.settling && this.remaining === 0 && this.projectiles.length === 0 && this.tissue === RULES.tissue, () => {
          this.score += 250;
          this.endMission('won');
        });
      }
      return;
    }

    if (this.tutorial) {
      this.advanceEnemies(dt);
      this.remaining = this.missions[0].species.length - this.spawnIndex + this.enemies.length;
      if (this.tutorial === 'repair' && this.tissue === RULES.tissue) {
        this.tutorial = null;
        this.player.ammo = this.magazineSize;
        this.reloading = 0;
        this.spawnCountdown = 1.35;
        this.events.push({ type: 'tutorial', stage: 'complete' });
      }
      return;
    }

    if (this.phase === 'intermission' && !this.gastric) {
      if (this.settling && this.gash) return;
      if (this.settling && this.tissue === RULES.tissue) {
        this.intermission = Math.min(this.intermission, JUNCTION_EXTRACT_DELAY);
      }
      this.intermission = Math.max(0, this.intermission - dt);
      if (this.intermission === 0) {
        if (!this.settling) this.beginWave();
        else if (this.overtime) this.endMission('won');
        else this.openExtractionChoice();
      }
      return;
    }

    if (this.gastric && this.gastric.stage !== 'flooded') advanceGastric(this, dt);
    const mission = this.missions[this.wave - 1];
    if (this.reinforcement?.started) {
      this.reinforcement.remaining = Math.max(0, this.reinforcement.remaining - dt);
      if (this.reinforcement.remaining === 0) this.reinforcement = null;
    }
    if (this.airway) {
      this.advanceAirwayAttacks();
    } else if (mission.arrivals) {
      const elapsed = this.clock - this.waveStartedAt;
      let arrival = mission.arrivals[this.spawnIndex];
      while (arrival && arrival.at <= elapsed + 1e-9) {
        this.spawnJunctionEnemy(arrival);
        arrival = mission.arrivals[this.spawnIndex];
      }
    } else if (this.phase === 'combat') {
      if (!stepEncounters(this, dt)) {
        this.spawnCountdown -= dt;
        if (this.spawnIndex < mission.species.length && this.spawnCountdown <= 0) {
          this.spawn(mission.species[this.spawnIndex]);
          this.spawnCountdown += mission.cadence * WAVE_CADENCE;
        }
      }
      stepFieldObjectives(this, dt, ARENA);
    }
    if (this.phase === 'combat' && !this.airway) stepBossArrival(this);
    this.advanceEnemies(dt);
    this.advanceProjectiles(dt);
    this.updateSuitStatus();
    this.remaining = (mission.arrivals ?? mission.species).length - this.spawnIndex + this.enemies.length +
      pendingGastricEnemies(this.gastric) +
      Number(!!this.boss && this.boss.state !== 'defeated');

    if (this.failedNode) {
      this.endMission('lost', 'tissue');
    } else if (this.suitsDefeated()) {
      this.endMission('lost', 'suit');
    } else if (this.airway) {
      this.advanceAirwayObjective(dt);
    } else if (this.phase === 'combat') {
      this.advanceOutro(dt, this.remaining === 0 && this.projectiles.length === 0 && !(this.boss?.remaining > 0), () => this.clearWave());
    }
  }

  startAirwayObjective() {
    const { recovery, warning, active } = this.organMission.hazard;
    const duration = recovery + warning + active;
    this.checkpoint = this.captureCheckpoint('airway');
    this.airway = {
      state: 'reopen', duration, remaining: duration, sealPoints: AIRWAY_SEAL_POINTS,
      minimumIntegrity: AIRWAY_MINIMUM_INTEGRITY, exhaled: false, incoming: null,
      ports: this.nodes.map((node, index) => ({
        nodeId: node.id, name: index === 0 ? 'Left bronchus' : 'Right bronchus', open: false, progress: 0,
      })),
      arrivals: AIRWAY_ATTACKS.map((attack, index) => ({
        ...attack, at: index === 0 ? this.clock + attack.delay : null, warned: false, spawned: false,
      })),
    };
    this.events.push({ type: 'airway', stage: 'start' });
  }

  emitAirwayPort(stage, lane) {
    const { name, nodeId } = this.airway.ports[lane];
    const { x, y, z } = this.nodes[lane];
    this.events.push({ type: 'airway', stage, nodeId, name, x, y, z });
  }

  sealAirwayPort(node) {
    const port = this.airway?.ports.find(item => item.nodeId === node.id);
    if (!port || port.open) return;
    port.progress = Math.min(1, port.progress + this.repairAmount / this.airway.sealPoints);
    if (port.progress === 1 && node.health >= this.airway.minimumIntegrity) {
      port.open = true;
      this.emitAirwayPort('opened', this.nodes.indexOf(node));
    }
  }

  advanceAirwayAttacks() {
    const { airway, clock } = this;
    airway.incoming = null;
    for (const attack of airway.arrivals) {
      if (attack.at === null || attack.spawned) continue;
      const remaining = attack.at - clock;
      if (remaining <= AIRWAY_ATTACK_WARNING && !attack.warned) {
        attack.warned = true;
        this.emitAirwayPort('incoming', attack.lane);
      }
      if (remaining <= 0) {
        attack.spawned = true;
        const node = this.nodes[attack.lane];
        const direction = Math.sign(node.x);
        for (const [index, type] of attack.species.entries()) {
          this.enemies.push(this.createEnemy(type, node.x + direction * (3.5 + index), node.z - 12 + index * 2, node));
        }
        this.emitAirwayPort('reinforcements', attack.lane);
      } else if (attack.warned && (!airway.incoming || remaining < airway.incoming.remaining)) {
        const { nodeId, name } = airway.ports[attack.lane];
        airway.incoming = { remaining, nodeIds: [nodeId], names: [name] };
      }
    }
  }

  advanceAirwayObjective(dt = 0) {
    const { airway } = this;
    for (const [lane, port] of airway.ports.entries()) {
      if (port.open && this.nodes[lane].health < airway.minimumIntegrity) {
        port.open = false;
        port.progress = 0;
        this.emitAirwayPort('blocked', lane);
      }
    }
    if (airway.ports.some(port => !port.open)) {
      airway.state = 'reopen';
      airway.remaining = airway.duration;
      return;
    }
    if (airway.state === 'reopen') {
      airway.state = 'holding';
      airway.exhaled = false;
      this.organ = this.createOrganPhase('recovery');
      for (const attack of airway.arrivals) {
        if (attack.at === null) attack.at = this.clock + attack.delay;
      }
      this.events.push({ type: 'airway', stage: 'hold' });
    } else if (airway.state === 'holding') {
      const { phase, remaining } = this.organ;
      const { warning, active } = this.organMission.hazard;
      if (phase === 'active') airway.exhaled = true;
      if (phase === 'recovery' && airway.exhaled) {
        airway.state = 'secured';
        airway.remaining = 0;
        this.events.push({ type: 'airway', stage: 'secured' });
      } else {
        airway.remaining = remaining + (phase === 'recovery' ? warning + active : phase === 'warning' ? active : 0);
      }
    }
    if (airway.state === 'secured') {
      this.advanceOutro(dt, this.remaining === 0 && this.projectiles.length === 0, () => {
        this.score += 600;
        this.endMission('won');
      });
    }
  }

  openExtractionChoice() {
    this.extractionPending = true;
    this.canRepair = false;
    this.repairProgress = 0;
    this.repairTarget = null;
    if (this.repairing) {
      this.repairing = false;
      this.events.push({ type: 'repairStop' });
    }
    this.events.push({ type: 'extraction', stage: 'ready' });
  }

  createOrganPhase(phase) {
    const { hazard } = this.organMission;
    const node = hazard.alternateNodes ? this.nodes[this.organCycle % this.nodes.length] : null;
    const stop = hazard.patrol?.[this.organCycle % hazard.patrol.length];
    const target = node ? ' · ' + node.name : stop ? ' · ' + stop[2] : '';
    return {
      phase,
      label: phase === 'recovery' ? hazard.name + ' in' : hazard.name + target,
      detail: phase === 'active' ? hazard.effect : hazard.instruction + (phase === 'recovery' ? target : ''),
      remaining: hazard[phase],
      x: node?.x ?? stop?.[0] ?? hazard.x,
      z: node?.z ?? stop?.[1] ?? hazard.z,
      nodeId: node?.id ?? null,
      repairBlocked: phase === 'active' && Boolean(hazard.repairBlocked),
      width: hazard.width,
      depth: hazard.depth,
      radius: hazard.radius,
    };
  }

  updateOrgan(dt) {
    if (this.phase !== 'combat' && !this.gastric) {
      this.organ.remaining = this.intermission + this.organMission.hazard.recovery;
      return;
    }
    let state = this.organ;
    state.remaining = Math.max(0, state.remaining - dt);
    if (state.remaining <= 1e-9) {
      if (state.phase === 'active') this.organCycle += 1;
      const next = state.phase === 'recovery' ? 'warning' : state.phase === 'warning' ? 'active' : 'recovery';
      state = this.organ = this.createOrganPhase(next);
      shapeGastricHazard(this);
      for (const suit of this.activeSuits()) suit.organNextDamage = this.clock;
      this.events.push({ type: 'organ', stage: next, area: this.area, x: state.x, y: .8, z: state.z });
    }
    const { hazard } = this.organMission;
    if (state.phase === 'active' && hazard.endZ !== undefined) {
      state.z = hazard.z + (hazard.endZ - hazard.z) * (1 - state.remaining / hazard.active);
    }
    if (state.phase === 'active' && hazard.endX !== undefined) {
      const direction = this.organCycle % 2 ? -1 : 1;
      state.x = direction * (hazard.x + (hazard.endX - hazard.x) * (1 - state.remaining / hazard.active));
    }
    if (state.phase === 'active' && hazard.engulf) this.engulfPathogens(dt, state, hazard.engulf);
  }

  // Patrolling immune cells digest any pathogen caught inside the hazard zone.
  engulfPathogens(dt, zone, damagePerSecond) {
    for (const enemy of [...this.enemies]) {
      if (enemy.type === 'colony' || enemy.hidden || !withinHazard(enemy, zone)) continue;
      enemy.health -= damagePerSecond * dt;
      if (enemy.health <= 0) {
        enemy.health = .001;
        this.hitEnemy(enemy, 1, false, { x: enemy.x, y: enemy.y, z: enemy.z }, 'immune');
      }
    }
  }

  applyOrganHazard(dt, suit = this) {
    const { player } = suit;
    const { organ } = this;
    if (!withinHazard(player, organ)) return;
    const { push, pushX, damage } = this.organMission.hazard;
    if (push) {
      player.z += push * dt;
      this.confineToArena(player, true);
    }
    if (pushX) {
      player.x += Math.sign(player.x - organ.x || 1) * pushX * dt;
      this.confineToArena(player, true);
    }
    if (damage && this.clock >= suit.organNextDamage) {
      suit.organNextDamage = this.clock + .65;
      const insulated = this.area === 'stomach' || this.area === 'intestines' || this.area === 'colon';
      this.damageTarget(player, 'player', insulated ? damage * this.hazardDamageMultiplier : damage, player, player.id);
    }
  }

  updateValve() {
    const valve = this.valve;
    const elapsed = this.clock % (HEART_CLOSED_TIME + HEART_OPEN_TIME);
    const open = elapsed >= HEART_CLOSED_TIME;
    const phase = open ? 'open' : 'closed';
    const duration = open ? HEART_OPEN_TIME : HEART_CLOSED_TIME;
    const phaseElapsed = open ? elapsed - HEART_CLOSED_TIME : elapsed;
    const transition = open ? clamp(Math.min(phaseElapsed, duration - phaseElapsed) / HEART_LEAFLET_TIME, 0, 1) : 0;
    valve.remaining = duration - phaseElapsed;
    valve.duration = duration;
    valve.openness = transition * transition * (3 - 2 * transition);
    valve.exposed = open && valve.openness >= .72;
    if (phase === valve.phase) return;

    valve.phase = phase;
    this.events.push({ type: 'valve', stage: phase, x: HEART_VALVE.x, y: HEART_VALVE.y, z: HEART_VALVE.z });
    if (open && this.colony) this.colony.attackCooldown = .65;
  }

  advanceColony(dt) {
    const colony = this.colony;
    if (!colony) return;

    colony.attackingTissue = this.valve.exposed;
    if (!colony.attackingTissue) {
      colony.telegraph = null; colony.warning = ''; this.setEnemyAction(colony, 'idle'); return;
    }
    colony.node.underAttack = true;
    colony.attackCooldown = Math.max(0, colony.attackCooldown - dt);
    if (colony.attackCooldown <= .65 && !colony.telegraph) {
      telegraph(colony, 'tear', colony.attackCooldown, 3.5, { x: HEART_VALVE.x, z: HEART_VALVE.z });
      colony.warning = 'COLONY TEAR · FIRE THROUGH THE OPEN VALVE';
      this.attackEvent(colony, 'windup', 'tissue', HEART_VALVE);
    }
    if (colony.telegraph) colony.telegraph.remaining = colony.attackCooldown;
    if (colony.attackCooldown > 0) return;
    colony.attackCooldown = SPECIES.colony.period;
    colony.telegraph = null; colony.warning = ''; this.setEnemyAction(colony, 'idle');
    this.damageTarget(colony, 'tissue', SPECIES.colony.tissueDamage, HEART_VALVE);
  }

  spawnHeartPatrol() {
    if (this.patrolIndex >= HEART_PATROL.length || this.clock < 2.3 + this.patrolIndex * HEART_PATROL_PACE) return;
    const index = this.patrolIndex++;
    const entry = HEART_PATROL_ENTRIES[index % HEART_PATROL_ENTRIES.length];
    this.enemies.push(this.createEnemy(HEART_PATROL[index], entry.x, entry.z, this.nodes[1]));
  }

  movePlayer(dt, input, suit = this) {
    const { player, weapon } = suit;
    const sensitivity = input.aim ? TURN_SENSITIVITY * weapon.aimSensitivity : TURN_SENSITIVITY;
    player.yaw -= (input.lookX || 0) * sensitivity;
    player.pitch = clamp(player.pitch - (input.lookY || 0) * sensitivity, -1.46, 1.46);

    const strafe = input.moveX || 0;
    const forward = input.moveZ || 0;
    const diagonal = Math.max(1, Math.hypot(strafe, forward));
    // The arenas grew by a third, so suits cover ground a little faster than they used to.
    let speed = (input.aim ? 3.6 : input.sprint && !input.fire ? 10.8 : 6.9) * (weapon.moveSpeed ?? 1);
    if (this.organ?.phase === 'active' && this.organMission.hazard.slow && withinHazard(player, this.organ)) {
      speed *= this.organMission.hazard.slow;
    }
    const travel = speed * dt / diagonal;
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    player.x += (strafe * cos - forward * sin) * travel;
    player.z -= (strafe * sin + forward * cos) * travel;
    this.confineToArena(player, true);
  }

  confineToArena(actor, solid = false) {
    if (this.valve) {
      actor.x = clamp(actor.x, -HEART_MAX_PLAYER_X, HEART_MAX_PLAYER_X);
      actor.z = clamp(actor.z, HEART_MIN_PLAYER_Z, HEART_MAX_PLAYER_Z);
    } else confineToChamber(actor, solid ? this.obstacles : null);
  }

  updateRepair(dt, held, suit = this) {
    const { player } = suit;
    suit.nearNode = null;
    let target = null;
    let nearestDistance = RULES.repairRadius;
    let repairDistance = RULES.repairRadius;
    for (const node of this.nodes) {
      const distance = Math.hypot(player.x - node.x, player.z - node.z);
      if (distance <= nearestDistance) {
        suit.nearNode = node;
        nearestDistance = distance;
      }
      const overloaded = this.organ?.repairBlocked && this.organ.nodeId === node.id;
      const port = this.airway?.ports.find(item => item.nodeId === node.id);
      if ((node.health < RULES.tissue || port?.open === false) && distance <= repairDistance && !overloaded &&
        (!this.valve || node !== this.objective || this.valve.phase === 'closed')) {
        target = node;
        repairDistance = distance;
      }
    }
    suit.nearTissue = Boolean(suit.nearNode);
    const gash = this.gash;
    suit.nearGash = !!gash && Math.hypot(player.x - gash.x, player.z - gash.z) <= JUNCTION_GASH_REPAIR_RADIUS;
    if (suit.nearGash) target = gash;
    if (this.gastric) {
      const { intake, drain } = this.gastric;
      const { x, z } = player;
      suit.nearGastricValve = [intake, drain].find(valve =>
        Math.hypot(x - valve.x, z - valve.z) <= GASTRIC_REPAIR_RADIUS) ?? null;
      const valve = gastricValve(this.gastric);
      if (valve && valve === suit.nearGastricValve) target = valve;
    }
    const mayRepair = !this.tutorial || this.tutorial === 'repair';
    suit.canRepair = mayRepair && !!target;

    const active = Boolean(held && suit.canRepair);
    if (!active || suit.repairTarget !== target) suit.repairProgress = 0;
    suit.repairTarget = active ? target : null;
    if (active !== suit.repairing) {
      suit.repairing = active;
      this.events.push({ type: active ? 'repairStart' : 'repairStop' });
    }
    if (!active) return false;

    suit.repairProgress += dt / REPAIR_TIME;
    if (suit.repairProgress >= 1) {
      if (target === suit.nearGastricValve) {
        const complete = repairGastricValve(this, target);
        suit.repairProgress -= 1;
        suit.canRepair = !complete;
        this.events.push({ type: 'repair', valveId: target.id, complete, x: target.x, y: target.y, z: target.z });
        return true;
      }
      const sealing = target === gash;
      const node = sealing ? gash.node : target;
      const amount = Math.min(suit.repairAmount, RULES.tissue - node.health);
      node.health += amount;
      this.sealAirwayPort(node);
      if (!this.tutorial) {
        this.score += amount * 8;
        this.creditPlayer(suit, amount * 8);
      }
      suit.repairProgress -= 1;
      if (sealing) {
        gash.sealRemaining = Math.max(0, gash.sealRemaining - suit.repairAmount);
        if (gash.sealRemaining === 0) {
          this.gash = null;
          this.events.push({ type: 'gash', stage: 'closed', branch: gash.branch, nodeId: node.id, x: gash.x, y: gash.y, z: gash.z });
        }
      }
      const port = this.airway?.ports.find(item => item.nodeId === node.id);
      const needsRepair = node.health < RULES.tissue || port?.open === false;
      const complete = this.gash?.node !== node && !needsRepair;
      suit.canRepair = sealing ? !!this.gash : needsRepair;
      this.events.push({ type: 'repair', amount, complete, gash: sealing, nodeId: node.id, x: target.x, y: target.y, z: target.z });
    }
    return true;
  }

  updateRifle(dt, input, repairing, suit = this) {
    this.advanceRockets(suit);
    if (input.swap) this.swapWeapon(suit);
    const { player, magazineSize, weapon } = suit;
    suit.fireCooldown = Math.max(0, suit.fireCooldown - dt);
    if (suit.switching > 0) {
      suit.switching = Math.max(0, suit.switching - dt);
      suit.reloadHeld = Boolean(input.reload);
      return;
    }
    if (suit.reloading > 0) {
      suit.reloading = Math.max(0, suit.reloading - dt);
      if (suit.reloading === 0) {
        player.ammo = magazineSize;
        this.events.push({ type: 'reload', stage: 'complete' });
      }
    }

    const reloadPressed = input.reload && !suit.reloadHeld;
    suit.reloadHeld = Boolean(input.reload);
    if (repairing || suit.reloading > 0) return;
    if (player.ammo < magazineSize && (reloadPressed || (input.fire && player.ammo === 0))) {
      suit.reloading = weapon.reloadSeconds;
      this.events.push({ type: 'reload', stage: 'start' });
      return;
    }
    if (!input.fire || suit.fireCooldown > 0) return;
    this.shoot(input.aim, suit);
  }

  deployTurret(suit = this) {
    if (this.tutorial) return false;
    const redeploying = this.canRedeployTurret;
    const { player } = suit;
    const point = this.turretPlacementFor(player);
    if (!point) {
      const { x, y, z } = player;
      this.events.push({ type: 'turret', stage: this.turretCharges || redeploying ? 'invalid' : 'empty', x, y, z });
      return false;
    }
    this.turret = { ...point, yaw: Math.PI + player.yaw, pitch: 0, cooldown: .6, targetId: null };
    if (redeploying) this.junctionSupplyLocked = true;
    else this.turretCharges -= 1;
    this.events.push({ type: 'turret', stage: redeploying ? 'redeployed' : 'deployed', ...point });
    return true;
  }

  updateTurret(dt) {
    const turret = this.turret;
    if (!turret) return;
    turret.cooldown = Math.max(0, turret.cooldown - dt);
    if (this.area === 'ear') {
      turret.jammed = this.organ.phase === 'active' && withinHazard(turret, this.organ);
      if (turret.jammed) {
        turret.targetId = null;
        return;
      }
    }
    const origin = { x: turret.x, y: turret.y + 1.18, z: turret.z };
    let target = null;
    let targetScore = -Infinity;
    for (const enemy of this.enemies) {
      if (enemy.type === 'colony' || enemy.tutorial || enemy.hidden) continue;
      const distance = Math.hypot(enemy.x - origin.x, enemy.y - origin.y, enemy.z - origin.z);
      if (distance > TURRET_RANGE) continue;
      const score = TURRET_RANGE - distance + (enemy.latched ? 6 : enemy.attackingTissue ? 3 : 0);
      if (score > targetScore) {
        targetScore = score;
        target = enemy;
      }
    }
    turret.targetId = target?.id ?? null;
    if (!target) return;
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dz = target.z - origin.z;
    turret.yaw = Math.atan2(dx, dz);
    turret.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    if (turret.cooldown > 0) return;

    turret.cooldown = TURRET_INTERVAL;
    target.slowRemaining = this.turretSlowDuration;
    if (target.boss || target.segmentOf) {
      // A boss is too big to stagger; the turret only chips at it.
    } else if (!target.latched && target.action.endsWith('-windup')) {
      this.setEnemyAction(target, 'idle');
      target.attackCooldown = TURRET_SLOW_TIME * .6;
    } else if (target.latched) {
      this.setEnemyAction(target, 'idle');
      target.attackCooldown = Math.max(target.attackCooldown, .85);
    }
    const impact = { x: target.x, y: target.y, z: target.z };
    this.events.push({ type: 'turret', stage: 'fire', id: target.id, ...origin, impact });
    if (target.type === 'guard' && guardFaces(target, origin)) this.blockGuardHit(target, impact, 'turret');
    else this.hitEnemy(target, TURRET_DAMAGE, false, impact, 'turret');
  }

  shoot(aiming, suit = this) {
    const { player, weapon } = suit;
    this.ai.emit('gunfire', player, { key: 'player:' + (player.id ?? 'solo'), radius: 38 });
    player.ammo -= 1;
    suit.fireCooldown = weapon.interval;
    const spread = aiming ? weapon.aimSpread : weapon.hipSpread;
    for (let pellet = 0; pellet < weapon.pellets; pellet++) {
      const ray = this.aimRay(player, this.tutorial ? 0 : spread);
      if (weapon.projectileSpeed) this.launchRocket(suit, ray);
      else this.fireRay(suit, ray, aiming, pellet);
    }
  }

  // A direction inside a cone of `spread` radians around the crosshair.
  aimRay(player, spread) {
    const angle = Math.random() * Math.PI * 2;
    const offset = spread * Math.sqrt(Math.random());
    const yaw = player.yaw + Math.cos(angle) * offset / Math.max(.25, Math.cos(player.pitch));
    const pitch = player.pitch + Math.sin(angle) * offset;
    const pitchCos = Math.cos(pitch);
    return { x: -Math.sin(yaw) * pitchCos, y: Math.sin(pitch), z: -Math.cos(yaw) * pitchCos };
  }

  // Finds what a ray from the player meets first: a pathogen, the closed heart valve or the boss.
  traceRay(player, ray, aiming, weapon, range = RIFLE_RANGE) {
    const { x: dx, y: dy, z: dz } = ray;
    let distance = range;
    let target;
    let critical = false;
    let blocked = false;
    for (const enemy of this.enemies) {
      if ((enemy.tutorial && this.tutorial === 'observe') || enemy.hidden) continue;
      const x = enemy.x - player.x;
      const y = enemy.y - player.y;
      const z = enemy.z - player.z;
      const forward = x * dx + y * dy + z * dz;
      const offsetSquared = x * x + y * y + z * z - forward * forward;
      const radiusSquared = enemy.radius * enemy.radius;
      if (forward <= 0 || offsetSquared > radiusSquared) continue;
      const entry = Math.max(0, forward - Math.sqrt(radiusSquared - offsetSquared));
      if (entry >= distance) continue;
      distance = entry;
      target = enemy;
      critical = offsetSquared <= radiusSquared * (aiming ? weapon.aimCritical : weapon.hipCritical);
    }

    if (this.valve && dz < 0) {
      const crossing = (HEART_VALVE.z - player.z) / dz;
      if (crossing < distance) {
        const x = player.x + dx * crossing;
        const y = player.y + dy * crossing;
        // The ray must fit inside the moving aperture as well as the hit window.
        const aperture = .035 + 2.35 * this.valve.openness ** .6;
        if (!this.valve.exposed || Math.hypot(x - HEART_VALVE.x, y - HEART_VALVE.y) > aperture) {
          distance = crossing;
          target = undefined;
          critical = false;
          blocked = true;
        }
      }
    }

    const bossHit = traceBrainBoss(this.boss, player, ray, distance);
    if (bossHit) distance = bossHit.distance;
    const impact = { x: player.x + dx * distance, y: player.y + dy * distance, z: player.z + dz * distance };
    return { target, critical, distance, impact, bossHit, blocked };
  }

  fireRay(suit, ray, aiming, pellet) {
    const { player, weapon } = suit;
    const { target, critical, distance, impact, bossHit, blocked } = this.traceRay(player, ray, aiming, weapon);
    const kind = weapon.weapon ?? 'carbine';
    // Shotgun pellets lose punch with range.
    const span = weapon.falloffEnd - weapon.falloffStart;
    const reach = distance <= weapon.falloffStart ? 1 : distance >= weapon.falloffEnd ? 0 : 1 - (distance - weapon.falloffStart) / span;
    const falloff = weapon.falloffMinimum + (1 - weapon.falloffMinimum) * reach;
    if (blocked) this.events.push({ type: 'valve', stage: 'blocked', ...impact });
    if (bossHit) {
      if (bossHit.vulnerable) {
        // Preserve multiple core openings even with the fastest receiver.
        suit.fireCooldown = Math.max(suit.fireCooldown, DEFAULT_WEAPON_STATS.interval);
      }
      this.events.push({ type: 'shot', weapon: kind, pellet, hit: bossHit.vulnerable, crit: bossHit.vulnerable, ...impact });
      hitBrainBoss(this, bossHit, impact, weapon.bodyDamage * falloff / DEFAULT_WEAPON_STATS.bodyDamage, suit);
      return;
    }
    if (target?.type === 'guard' && guardFaces(target, player)) {
      this.events.push({ type: 'shot', weapon: kind, pellet, hit: false, crit: false, ...impact });
      this.blockGuardHit(target, impact, 'player');
      return;
    }
    this.events.push({ type: 'shot', weapon: kind, pellet, hit: Boolean(target), crit: critical, ...impact });
    if (target) this.hitEnemy(target, (critical ? weapon.criticalDamage : weapon.bodyDamage) * falloff, critical, impact, 'player', suit);
  }

  // Rockets travel visibly and burst where the ray ends; damage lands when they arrive.
  launchRocket(suit, ray) {
    const { player, weapon } = suit;
    const { target, distance, impact, bossHit } = this.traceRay(player, ray, true, weapon, ROCKET_RANGE);
    const travel = distance / weapon.projectileSpeed;
    this.rockets.push({ owner: suit, target, bossHit, impact, at: this.clock + travel, weapon });
    this.events.push({
      type: 'shot', weapon: 'launcher', rocket: true, travel, hit: false, crit: false, ...impact,
    });
  }

  advanceRockets(suit) {
    if (!this.rockets?.length) return;
    let count = 0;
    for (const rocket of this.rockets) {
      if (rocket.owner === suit && rocket.at <= this.clock + 1e-9) this.detonate(rocket);
      else this.rockets[count++] = rocket;
    }
    this.rockets.length = count;
  }

  detonate({ owner, target, bossHit, impact, weapon }) {
    this.ai.emit('explosion', impact, { radius: 46 });
    const radius = weapon.splashRadius;
    this.events.push({ type: 'explosion', radius, ...impact });
    if (bossHit?.vulnerable && this.boss) {
      const accepted = hitBrainBoss(this, bossHit, impact, (weapon.bodyDamage + weapon.splashDamage) / DEFAULT_WEAPON_STATS.bodyDamage, owner);
      if (accepted) this.events.push({ type: 'shot', weapon: 'launcher', blast: true, hit: true, crit: true, ...impact });
    }
    // Splash ignores Shellback armour; the pathogen it struck takes the direct hit too.
    for (const enemy of [...this.enemies]) {
      if (!this.enemies.includes(enemy) || enemy.hidden || (enemy.tutorial && this.tutorial === 'observe')) continue;
      const gap = Math.max(0, Math.hypot(enemy.x - impact.x, enemy.y - impact.y, enemy.z - impact.z) - enemy.radius);
      const direct = enemy === target;
      if (gap > radius && !direct) continue;
      const splash = gap > radius ? 0 : weapon.splashDamage * (1 - .55 * gap / radius);
      const point = { x: enemy.x, y: enemy.y, z: enemy.z };
      this.hitEnemy(enemy, splash + (direct ? weapon.bodyDamage : 0), direct, point, 'player', owner);
    }
  }

  blockGuardHit(guard, impact, source) {
    this.events.push({ type: 'guard', stage: 'block', id: guard.id, source, ...impact });
  }

  // Kills and repairs count toward the player who made them; wave bonuses and turret kills
  // only count toward the team score.
  creditPlayer(suit, points, kill = false) {
    const player = suit?.player;
    if (!player) return;
    player.score = (player.score ?? 0) + points;
    if (kill) player.kills = (player.kills ?? 0) + 1;
  }

  hitEnemy(target, damage, critical, impact, source, suit = null) {
    if (target.health <= 0 || target.hidden) return;
    // Bosses shrug off or soak up fire depending on what they are doing.
    damage *= target.damageScale ?? 1;
    if (target.boss) target.damageTaken += damage;
    if (target.boss) bossDamageThreat(target, suit?.player, damage, this.clock);
    target.health -= damage;
    this.ai.damage(target, suit?.player);
    const lethal = target.health <= 0;
    this.events.push({ type: 'hit', id: target.id, damage, crit: critical, lethal, source, ...impact });
    if (!lethal) return;

    this.ai.emit('death', target, { owner: target.id, radius: 22 });
    this.ai.remove(target.id);
    this.enemies.splice(this.enemies.indexOf(target), 1);
    this.kills += 1;
    const score = target.score ?? (target.fragment ? FRAGMENT.score : target.tutorial ? SPECIES.virus.score : SPECIES[target.type].score);
    this.score += score + (critical ? 35 : 0);
    this.creditPlayer(suit, score + (critical ? 35 : 0), true);
    this.events.push({
      type: 'kill', id: target.id, enemyType: target.type, source, x: target.x, y: target.y, z: target.z,
    });
    if (target.boss) {
      this.events.push({ type: 'levelBoss', stage: 'defeated', boss: target.boss, name: target.name, id: target.id, x: target.x, y: target.y, z: target.z });
      // A chain dies with its head.
      this.enemies = this.enemies.filter(enemy => enemy.segmentOf !== target.id);
    }
    if (target.nest) this.events.push({ type: 'nest', stage: 'destroyed', id: target.id, x: target.x, y: target.y, z: target.z });
    if (target === this.colony) {
      this.colony = null;
      this.valve.colonyDefeated = true;
    }
    if (target.type === 'splitter') this.splitEnemy(target);
    if (target.tutorial) {
      this.tutorial = 'repair';
      this.events.push({ type: 'tutorial', stage: 'repair' });
    }
  }

  splitEnemy(enemy) {
    for (const direction of [-1, 1]) {
      const fragment = this.createEnemy('virus', enemy.x + direction * Math.cos(enemy.heading) * .85,
        enemy.z - direction * Math.sin(enemy.heading) * .85, enemy.node, FRAGMENT);
      fragment.fragment = true;
      if (enemy.encounterOrder) fragment.encounterOrder = { ...enemy.encounterOrder,
        approach: { ...enemy.encounterOrder.approach }, reached: true, fragment: true };
      this.confineToArena(fragment);
      this.enemies.push(fragment);
    }
  }

  spawn(type, encounter = null) {
    const index = this.spawnIndex++;
    const lane = encounter?.nodeIndex ?? (this.organMission ? Math.min(this.nodes.length - 1, 'LRC'.indexOf(this.missions[this.wave - 1].lanes[index]))
      : (index + this.wave - 1) % this.nodes.length);
    const route = (this.organMission?.inlets ?? ENTRANCES)[lane];
    const [x, z] = route[(Math.floor(index / this.nodes.length) + this.wave - 1) % route.length];
    const spawnX = index === 0 ? x : x + Math.sin(index * 2.4 + this.wave) * 1.35;
    const spawnZ = z + Math.cos(index * 1.9 + this.wave) * 0.85;
    const enemy = this.createEnemy(type, encounter?.x ?? spawnX, encounter?.z ?? spawnZ, this.nodes[lane]);
    if (encounter?.packId) enemy.encounterOrder = {
      id: encounter.packId, role: encounter.role, until: this.clock + ENCOUNTER_RULES.orderSeconds,
      approach: encounter.approach, reached: false,
    };
    this.enemies.push(enemy);
  }

  spawnJunctionEnemy({ type, branch, surge }) {
    const index = this.spawnIndex++;
    const inlet = JUNCTION_INLETS[branch];
    const node = this.nodes[JUNCTION_NODE_INDEX[branch]];
    const spawnX = inlet.x + Math.sign(inlet.x) * (3.1 + Math.sin(index * 1.7) * .47);
    const spawnZ = inlet.z - 3.4 + Math.cos(index * 2.2) * .47;
    const enemy = this.createEnemy(type, spawnX, spawnZ, node);
    enemy.branch = branch;
    if (type === 'bacillus') enemy.attackAnchor = JUNCTION_GASH_SITES[branch];
    if (this.reinforcement?.branch === branch) {
      this.reinforcement.started = true;
      enemy.inletHold = REINFORCEMENT_HOLD;
    }
    if (surge) {
      this.junctionSurgeIndex += 1;
      this.events.push({ type: 'surge', stage: 'arrival', ...surge, ...inlet });
    }
    this.events.push({ type: 'branch', branch, x: enemy.x, y: enemy.y, z: enemy.z });
    this.enemies.push(enemy);
  }

  createEnemy(type, x, z, node = this.objective, spec = SPECIES[type]) {
    return {
      id: this.nextEnemyId++,
      type, behavior: spec.behavior ?? type, x, y: spec.y, z, node, nodeId: node.id,
      radius: spec.radius,
      health: spec.health,
      maxHealth: spec.health,
      attackCooldown: 0.65,
      attackingTissue: false,
      latched: false,
      heading: Math.atan2(node.x - x, node.z - z),
      action: 'idle',
      actionProgress: 0,
      actionElapsed: 0,
      actionTarget: null,
      slowRemaining: 0,
    };
  }

  setEnemyAction(enemy, action) {
    enemy.action = action;
    enemy.actionProgress = 0;
    enemy.actionElapsed = 0;
    if (action === 'idle') {
      enemy.actionTarget = null;
      enemy.actionPlayerId = null;
    }
  }

  advanceAction(enemy, dt, duration) {
    enemy.actionElapsed += dt;
    enemy.actionProgress = Math.min(1, enemy.actionElapsed / duration);
    return enemy.actionProgress === 1;
  }

  attackEvent(enemy, stage, target, origin = enemy, playerId = enemy.actionPlayerId) {
    const event = {
      type: 'enemyAttack', enemyType: enemy.type, behavior: enemy.behavior, id: enemy.id, stage, target,
      x: origin.x, y: origin.y, z: origin.z,
    };
    if (target === 'tissue') event.nodeId = enemy.nodeId;
    if (target === 'player' && playerId != null) event.targetPlayerId = playerId;
    if (enemy.branch) event.branch = enemy.branch;
    this.events.push(event);
  }

  advanceBacillus(enemy, dt, spec, speedFactor, controller = null) {
    const anchor = enemy.attackAnchor ?? enemy.node;
    if (enemy.node.health <= 0) { enemy.latched = false; this.setEnemyAction(enemy, 'idle'); return; }
    if (!enemy.latched) {
      const dx = anchor.x - enemy.x;
      const dz = anchor.z - enemy.z;
      const distance = Math.hypot(dx, dz);
      enemy.heading = Math.atan2(dx, dz);
      const speed = enemy.tutorial ? 2.7 : spec.speed + (this.wave - 1) * 0.13;
      const travel = Math.min(Math.max(0, distance - LATCH_RANGE), speed * speedFactor * dt);
      if (distance > LATCH_RANGE) {
        if (controller) controller.move(dt, speed * speedFactor, 0);
        else {
          enemy.x += dx * travel / distance;
          enemy.z += dz * travel / distance;
          this.skirtObstacles(enemy);
        }
      }
      if (Math.hypot(anchor.x - enemy.x, anchor.z - enemy.z) > LATCH_RANGE + .04 ||
          !clearSegment(this.obstacles, enemy, anchor)) {
        enemy.y = spec.y + Math.sin(this.clock * 3.2 + enemy.id * 1.7) * 0.08;
        return;
      }
      enemy.latched = true;
      enemy.attackingTissue = true;
      enemy.node.underAttack = true;
      enemy.y = anchor.y + 0.13;
      enemy.attackCooldown = LATCH_WINDUP;
      if (controller && !this.ai.director.acquire(enemy, 'tissue', spec.period + .7)) {
        this.setEnemyAction(enemy, 'idle');
        return;
      }
      enemy.actionTarget = 'tissue';
      this.setEnemyAction(enemy, 'bacillus-windup');
      this.attackEvent(enemy, 'windup', 'tissue');
      return;
    }

    if (enemy.action === 'bacillus-tear' && this.advanceAction(enemy, dt, LATCH_TEAR)) {
      this.setEnemyAction(enemy, 'idle');
    }
    enemy.node.underAttack = true;
    if (enemy.tutorial && this.tutorial !== 'observe') return;
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
    if (enemy.action === 'bacillus-windup') {
      enemy.actionProgress = 1 - enemy.attackCooldown / LATCH_WINDUP;
    } else if (enemy.attackCooldown <= LATCH_WINDUP) {
      if (controller && !this.ai.director.acquire(enemy, 'tissue', spec.period + .7)) {
        enemy.attackCooldown = LATCH_WINDUP;
        return;
      }
      enemy.attackCooldown = LATCH_WINDUP;
      enemy.actionTarget = 'tissue';
      this.setEnemyAction(enemy, 'bacillus-windup');
      this.attackEvent(enemy, 'windup', 'tissue');
    }
    if (enemy.attackCooldown > 0) return;
    enemy.attackCooldown = spec.period;
    this.setEnemyAction(enemy, 'bacillus-tear');
    this.damageTarget(enemy, 'tissue', enemy.tutorial ? REPAIR_PER_CYCLE : spec.tissueDamage, enemy.attackAnchor ?? enemy);
    this.attackEvent(enemy, 'impact', 'tissue', enemy.attackAnchor ?? enemy);
    if (enemy.attackAnchor && !this.junctionGashOpened && !this.failedNode) {
      this.junctionGashOpened = true;
      this.gash = {
        ...anchor, branch: enemy.branch, node: enemy.node, nodeId: enemy.nodeId, drainPerSecond: JUNCTION_GASH_DRAIN,
        sealRemaining: JUNCTION_GASH_SEAL_POINTS, sealRequired: JUNCTION_GASH_SEAL_POINTS,
      };
      this.events.push({ type: 'gash', stage: 'open', branch: enemy.branch, nodeId: enemy.nodeId, ...anchor });
    }
    if (enemy.tutorial) {
      this.tutorial = 'intercept';
      this.events.push({ type: 'tutorial', stage: 'intercept' });
    }
  }

  damageNode(node, amount) {
    this.ai.emit('biological', node, { radius: 18 });
    node.underAttack = true;
    node.health = Math.max(0, node.health - amount);
    if (node.health === 0) this.failedNode ??= node;
  }

  damageTarget(enemy, target, amount, origin = enemy, playerId = enemy.actionPlayerId, node = enemy.node) {
    const player = target === 'player' ? this.attackPlayer(playerId) : null;
    if (target === 'player') {
      if (!player || player.health <= 0) return;
      player.health = Math.max(0, player.health - amount * WAVE_SUIT_DAMAGE);
      this.ai.director.recentDamage += amount * WAVE_SUIT_DAMAGE;
    } else {
      if (!node || node.health <= 0) return;
      if (this.organ?.phase === 'active' && this.organ.nodeId === node.id) {
        amount *= this.organMission.hazard.tissueDamage ?? 1;
      }
      amount *= this.nodes.length > 2 ? THREE_NODE_TISSUE_DAMAGE : this.organMission ? ORGAN_TISSUE_DAMAGE : 1;
      amount *= WAVE_TISSUE_DAMAGE;
      this.damageNode(node, amount);
    }
    const impact = { type: 'damage', target, amount, id: enemy.id, x: origin.x, y: origin.y, z: origin.z };
    if (player?.id != null) impact.playerId = player.id;
    if (target === 'tissue') impact.nodeId = node.id;
    if (enemy.branch) impact.branch = enemy.branch;
    if (enemy.attackAnchor === origin) impact.anchor = 'gash';
    this.events.push(impact);
    this.ai.emit('combat', origin, { owner: enemy.id, radius: 16 });
  }

  attackPlayer() {
    return this.player;
  }

  chooseAttackPlayer() {
    return this.player;
  }

  advanceEnemies(dt) {
    this.ai.begin(dt);
    for (const enemy of this.enemies) {
      if (enemy.type === 'colony') continue;
      if (enemy.nest) { advanceNest(this, enemy, dt, FRAGMENT); continue; }
      if (enemy.boss || enemy.segmentOf) { stepLevelBoss(this, enemy, dt); continue; }
      const spec = enemy.fragment ? FRAGMENT : SPECIES[enemy.type];
      const reinforced = !!this.reinforcement && this.reinforcement.branch === enemy.branch;
      const speedFactor = (reinforced ? REINFORCED_SPEED : 1) * (enemy.slowRemaining > 0 ? TURRET_SLOW_FACTOR : 1);
      enemy.slowRemaining = Math.max(0, enemy.slowRemaining - dt);
      if (reinforced && enemy.inletHold > 0) { enemy.inletHold -= dt; continue; }
      // The guided first breach retains its authored, guaranteed demonstration.
      if (enemy.tutorial) { this.advanceBacillus(enemy, dt, spec, speedFactor); continue; }
      const controller = this.ai.controllers.get(enemy.id);
      if (!controller) continue;
      controller.tick(dt);
      if (enemy.behavior === 'bacillus') {
        const defensive = ['retreat', 'cover', 'regroup', 'protect'].includes(controller.action) && !enemy.attackAnchor;
        if (defensive) {
          enemy.latched = false; enemy.attackingTissue = false;
          this.setEnemyAction(enemy, 'idle');
          controller.move(dt, spec.speed * speedFactor);
        } else this.advanceBacillus(enemy, dt, spec, speedFactor, controller);
        continue;
      }
      if (enemy.action !== 'idle') {
        enemy.node.underAttack ||= enemy.attackingTissue;
        if (enemy.behavior === 'virus') this.advanceVirusAttack(enemy, dt, spec);
        else this.advanceSporeAttack(enemy, dt);
        continue;
      }
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      enemy.y = spec.y + Math.sin(this.clock * 3.2 + enemy.id * 1.7) * .24;
      const target = controller.attackTarget();
      const attacksSuit = controller.targetKey?.startsWith('player:');
      const distance = target ? Math.hypot(target.x - enemy.x, target.z - enemy.z) : Infinity;
      const range = enemy.behavior === 'virus' ? (attacksSuit ? VIRUS_RANGE : 2.7) : (attacksSuit ? SPORE_RANGE : 3.4);
      if (target && distance <= range + .04) enemy.heading = Math.atan2(target.x - enemy.x, target.z - enemy.z);
      const defensive = ['retreat', 'cover', 'evade', 'regroup', 'investigate', 'idle'].includes(controller.action);
      const tooClose = attacksSuit && enemy.behavior === 'spore' && distance < controller.profile.preferredDistance * .65;
      enemy.attackingTissue = !defensive && !attacksSuit && distance <= range + .04;
      enemy.node.underAttack ||= enemy.attackingTissue;
      if (!defensive && !tooClose && target && distance <= range + .04 && enemy.attackCooldown === 0 &&
          clearSegment(this.obstacles, enemy, target) && this.ai.director.acquire(enemy, attacksSuit ? 'player' : 'tissue', enemy.behavior === 'spore' ? 3 : 1.6)) {
        this.startEnemyAttack(enemy, target, attacksSuit ? 'player' : 'tissue');
      } else {
        const stop = !defensive && !tooClose && target && !['flank', 'strafe'].includes(controller.action) ? Math.max(0, range - .2) : 0;
        controller.move(dt, (spec.speed + (this.wave - 1) * .13) * speedFactor, stop);
      }
    }
    this.ai.end();
  }

  // Pathogens flow around solid scenery instead of drifting through it.
  skirtObstacles(enemy) {
    for (const [x, z, size] of this.obstacles) {
      const dx = enemy.x - x;
      const dz = enemy.z - z;
      const gap = Math.hypot(dx, dz);
      const reach = size + enemy.radius * .5;
      if (gap >= reach || gap < 1e-4) continue;
      // Slide along the surface on the side it was already heading for.
      const side = dx * Math.cos(enemy.heading) - dz * Math.sin(enemy.heading) >= 0 ? -1 : 1;
      enemy.x = x + dx / gap * reach + dz / gap * side * .04;
      enemy.z = z + dz / gap * reach - dx / gap * side * .04;
    }
  }

  startEnemyAttack(enemy, target, targetName) {
    enemy.actionTarget = targetName;
    enemy.actionPlayerId = targetName === 'player' ? target.id : null;
    enemy.attackOrigin = { x: enemy.x, y: enemy.y, z: enemy.z };
    enemy.attackPoint = { x: target.x, y: target.y, z: target.z };
    const controller = this.ai.controllers.get(enemy.id);
    if (controller && enemy.behavior === 'spore') enemy.attackPoint = controller.aim(target, SPORE_SPEED);
    if (enemy.behavior === 'virus') {
      // Leave the virus on the near side of what it strikes so it stays shootable.
      const dx = enemy.x - target.x;
      const dz = enemy.z - target.z;
      const distance = Math.max(0.01, Math.hypot(dx, dz));
      const offset = Math.min(distance, targetName === 'tissue' ? 1.3 : 0.44);
      enemy.attackPoint.x += dx * offset / distance;
      enemy.attackPoint.z += dz * offset / distance;
    }
    this.setEnemyAction(enemy, enemy.behavior + '-windup');
    this.attackEvent(enemy, 'windup', targetName);
  }

  advanceVirusAttack(enemy, dt, spec) {
    if (enemy.action === 'virus-windup') {
      if (this.advanceAction(enemy, dt, VIRUS_WINDUP)) {
        const target = enemy.actionTarget === 'player' ? this.attackPlayer(enemy.actionPlayerId) : enemy.node;
        if (!target || target.health <= 0 || !clearSegment(this.obstacles, enemy.attackOrigin, enemy.attackPoint, enemy.radius * .5)) {
          this.ai.controllers.get(enemy.id)?.memory.fail('attack obstructed or target destroyed', this.clock);
          this.ai.director.release(enemy.id);
          enemy.attackCooldown = .4;
          this.setEnemyAction(enemy, 'idle');
          return;
        }
        this.setEnemyAction(enemy, 'virus-pounce');
        this.attackEvent(enemy, 'release', enemy.actionTarget);
      }
      return;
    }
    if (enemy.action === 'virus-pounce') {
      const landed = this.advanceAction(enemy, dt, VIRUS_POUNCE);
      const progress = enemy.actionProgress;
      const from = enemy.attackOrigin;
      const to = enemy.attackPoint;
      enemy.x = from.x + (to.x - from.x) * progress;
      enemy.y = from.y + (to.y - from.y) * progress + 0.52 * Math.sin(Math.PI * progress);
      enemy.z = from.z + (to.z - from.z) * progress;
      if (!landed) return;

      const player = enemy.actionTarget === 'player' ? this.attackPlayer(enemy.actionPlayerId) : null;
      const hitsSuit = !!player && player.health > 0 && Math.hypot(enemy.x - player.x, enemy.z - player.z) < 1.06 && clearSegment(this.obstacles, enemy.attackOrigin, player);
      const hitsTissue = enemy.actionTarget === 'tissue' && enemy.node.health > 0;
      if (hitsSuit || hitsTissue) this.damageTarget(enemy, enemy.actionTarget, hitsSuit ? spec.suitDamage : spec.tissueDamage);
      this.attackEvent(enemy, hitsSuit || hitsTissue ? 'impact' : 'miss', enemy.actionTarget);
      this.setEnemyAction(enemy, 'virus-recover');
      return;
    }
    if (this.advanceAction(enemy, dt, VIRUS_RECOVERY)) {
      enemy.attackCooldown = enemy.actionTarget === 'tissue' ? 0.12 : 0.34;
      this.setEnemyAction(enemy, 'idle');
      this.ai.director.release(enemy.id);
    }
  }

  advanceSporeAttack(enemy, dt) {
    if (enemy.action === 'spore-windup') {
      if (this.advanceAction(enemy, dt, SPORE_WINDUP)) {
        this.launchSpore(enemy);
        this.setEnemyAction(enemy, 'spore-recover');
      }
      return;
    }
    if (this.advanceAction(enemy, dt, SPORE_RECOVERY)) {
      enemy.attackCooldown = enemy.actionTarget === 'tissue' ? 0.12 : 0.38;
      const controller = this.ai.controllers.get(enemy.id);
      if (controller && enemy.actionTarget === 'player') {
        controller.cooldowns.pursue = this.clock + .8;
        controller.nextDecision = this.clock;
      }
      this.setEnemyAction(enemy, 'idle');
    }
  }

  launchSpore(enemy) {
    const aim = enemy.attackPoint;
    const controller = this.ai.controllers.get(enemy.id);
    const target = enemy.actionTarget === 'player' ? this.attackPlayer(enemy.actionPlayerId) : enemy.node;
    if (controller && (!target || target.health <= 0 || !clearSegment(this.obstacles, enemy, aim))) {
      controller.memory.fail('spit obstructed or target destroyed', this.clock);
      this.ai.director.release(enemy.id);
      this.attackEvent(enemy, 'miss', enemy.actionTarget);
      return;
    }
    const dx = aim.x - enemy.x;
    const dy = aim.y - enemy.y;
    const dz = aim.z - enemy.z;
    const distance = Math.hypot(dx, dy, dz);
    const scale = SPORE_SPEED / Math.max(0.01, distance);
    this.projectiles.push({
      id: this.nextProjectileId++, owner: enemy,
      target: enemy.actionTarget, targetPlayerId: enemy.actionPlayerId,
      targetNodeId: enemy.nodeId,
      x: enemy.x, y: enemy.y, z: enemy.z,
      vx: dx * scale, vy: dy * scale, vz: dz * scale, radius: SPORE_RADIUS,
      arming: SPORE_ARM_TIME,
      lifetime: Math.max(0.4, distance / SPORE_SPEED + 0.32),
    });
    this.attackEvent(enemy, 'release', enemy.actionTarget);
  }

  advanceProjectiles(dt) {
    let active = 0;
    for (const projectile of this.projectiles) {
      const { owner, target, vx, vy, vz } = projectile;
      const from = { x: projectile.x, y: projectile.y, z: projectile.z };
      const travel = Math.min(dt, projectile.lifetime);
      const dx = vx * travel;
      const dy = vy * travel;
      const dz = vz * travel;
      if (!clearSegment(this.obstacles, from, { x: from.x + dx, z: from.z + dz }, projectile.radius)) {
        this.attackEvent(owner, 'miss', target, from, projectile.targetPlayerId);
        continue;
      }
      const objective = target === 'player' ? this.attackPlayer(projectile.targetPlayerId)
        : this.nodes.find(node => node.id === projectile.targetNodeId) ?? owner.node;
      if (objective?.health > 0 && projectile.arming <= travel) {
        const tx = objective.x - from.x;
        const ty = objective.y - from.y;
        const tz = objective.z - from.z;
        const lengthSquared = dx * dx + dy * dy + dz * dz;
        const armedStart = travel > 0 ? Math.min(1, projectile.arming / travel) : 0;
        const nearest = lengthSquared ? clamp((tx * dx + ty * dy + tz * dz) / lengthSquared, armedStart, 1) : 0;
        const radius = projectile.radius + (target === 'player' ? 0.61 : 1.08);
        if (Math.hypot(tx - dx * nearest, ty - dy * nearest, tz - dz * nearest) <= radius) {
          const impact = { x: from.x + dx * nearest, y: from.y + dy * nearest, z: from.z + dz * nearest };
          const spec = SPECIES.spore;
          this.damageTarget(owner, target, target === 'player' ? spec.suitDamage : spec.tissueDamage, impact, projectile.targetPlayerId, objective);
          this.attackEvent(owner, 'impact', target, impact, projectile.targetPlayerId);
          continue;
        }
      }

      projectile.x += dx;
      projectile.y += dy;
      projectile.z += dz;
      projectile.arming = Math.max(0, projectile.arming - travel);
      projectile.lifetime -= travel;
      if (projectile.lifetime <= 0) {
        this.attackEvent(owner, 'miss', target, projectile, projectile.targetPlayerId);
      } else {
        this.projectiles[active++] = projectile;
      }
    }
    this.projectiles.length = active;
  }
}

// Layout the boss code needs without importing this module back.
Object.assign(Simulation, { arena: ARENA, entrances: ENTRANCES, junctionInlets: JUNCTION_INLETS, fragment: FRAGMENT });
