import { ORGAN_MISSIONS } from './organs.mjs';

export const OBJECTIVE = Object.freeze({ x: 0, y: 1.25, z: -8 });
export const TISSUE_NODES = Object.freeze({
  artery: Object.freeze([
    Object.freeze({ id: 'artery-core', name: 'Arterial Core', ...OBJECTIVE }),
    Object.freeze({ id: 'artery-flank', name: 'Lateral Branch', x: 13, y: 1.25, z: 5 }),
  ]),
  junction: Object.freeze([
    Object.freeze({ id: 'junction-amber', name: 'Amber Node', x: -9, y: 1.25, z: -7 }),
    Object.freeze({ id: 'junction-teal', name: 'Teal Node', x: 9, y: 1.25, z: -7 }),
  ]),
  heart: Object.freeze([
    Object.freeze({ id: 'heart-valve', name: 'Valve Wound', ...OBJECTIVE }),
    Object.freeze({ id: 'heart-flank', name: 'Septal Node', x: 13, y: 1.25, z: 7 }),
  ]),
  ...Object.fromEntries(Object.entries(ORGAN_MISSIONS).map(([area, mission]) =>
    [area, Object.freeze(mission.nodes.map(node => Object.freeze(node)))],
  )),
});
export const JUNCTION_INLETS = Object.freeze({
  left: Object.freeze({ x: -19.5, y: 1.42, z: -21.5 }),
  right: Object.freeze({ x: 19.5, y: 1.42, z: -21.5 }),
});
export const JUNCTION_GASH_SITES = Object.freeze({
  left: Object.freeze({ x: -11.8, y: 0.95, z: -10.7 }),
  right: Object.freeze({ x: 11.8, y: 0.95, z: -10.7 }),
});
export const HEART_VALVE = Object.freeze({ x: 0, y: 2, z: -10.7, radius: 3.65 });

export const RULES = Object.freeze({
  health: 100,
  tissue: 100,
  magazine: 30,
  initialReserve: 150,
  reserveCap: 240,
  repairRadius: 5.4,
  arenaX: 29,
  arenaZ: 41,
});

const SPECIES = {
  virus: { radius: 0.92, y: 1.63, health: 34, speed: 2.05, suitDamage: 9, tissueDamage: 5, score: 100 },
  bacillus: { radius: 1.12, y: 1.13, health: 68, speed: 1.32, tissueDamage: 9, period: 1.75, score: 180 },
  spore: { radius: 0.73, y: 2.10, health: 18, speed: 3.28, suitDamage: 7, tissueDamage: 3, score: 130 },
  guard: { behavior: 'bacillus', radius: 1.32, y: 1.33, health: 96, speed: 1.48, tissueDamage: 11, period: 1.9, score: 260 },
  splitter: { behavior: 'virus', radius: 1.07, y: 1.75, health: 55, speed: 3.08, suitDamage: 11, tissueDamage: 6, score: 200 },
  colony: { radius: 1.10, y: 3.35, health: 1100, tissueDamage: 11, period: 1.57, score: 900 },
};

const FRAGMENT = { radius: .55, y: 1.35, health: 18, speed: 3.85, suitDamage: 5, tissueDamage: 2, score: 55 };
const GUARD_FRONT_THRESHOLD = .55;

const MISSIONS = [
  { cadence: 1.65, species: ['virus', 'virus', 'virus', 'spore', 'virus', 'virus', 'spore'] },
  { cadence: 1.37, species: ['virus', 'spore', 'virus', 'bacillus', 'virus', 'spore', 'bacillus', 'virus', 'virus', 'spore'] },
  { cadence: 1.05, species: ['spore', 'virus', 'bacillus', 'virus', 'spore', 'spore', 'bacillus', 'virus', 'bacillus', 'spore', 'virus', 'bacillus'] },
  { cadence: 0.88, species: ['virus', 'bacillus', 'spore', 'spore', 'bacillus', 'virus', 'virus', 'bacillus', 'spore', 'bacillus', 'spore', 'virus', 'bacillus', 'spore', 'virus'] },
  { cadence: 0.72, species: ['bacillus', 'spore', 'virus', 'bacillus', 'spore', 'virus', 'bacillus', 'spore', 'bacillus', 'virus', 'spore', 'bacillus', 'spore', 'bacillus', 'virus', 'spore', 'virus', 'bacillus'] },
];

const SURGE_SPACING = .68;
const JUNCTION_NODE_INDEX = { left: 0, right: 1 };

function junctionMission(name, groups, bonus = 0) {
  const surges = [];
  const arrivals = [];
  for (const [at, branch, threat, species] of groups) {
    const nodeName = TISSUE_NODES.junction[JUNCTION_NODE_INDEX[branch]].name;
    const surge = { at, branch, nodeName, threat };
    surges.push(surge);
    for (const [index, type] of species.entries()) {
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
const HEART_MAX_PLAYER_Z = 21;
const HEART_MAX_PLAYER_X = 14;
const HEART_PATROL = ['virus', 'spore', 'bacillus', 'spore'];

const ENTRANCES = [
  [[-3, -34], [-14, -28], [-22, -18], [-25, 1], [-19, 23], [-6, 33]],
  [[21, -21], [25, -11], [26, 2], [23, 19], [13, 31], [5, 36]],
];

const TURN_SENSITIVITY = 0.00225;
const RIFLE_RANGE = 68;
const SHOT_INTERVAL = 0.118;
const RELOAD_TIME = 1.35;
const REPAIR_TIME = 0.82;
const REPAIR_PER_CYCLE = 13;
const FAST_SEALER_REPAIR = 18;
const DEEP_MAGAZINE_CAPACITY = 42;
const INTERMISSION_TIME = 6.5;
const JUNCTION_BREAK_TIME = 8;
const JUNCTION_REPAIR_TIME = 9;
const JUNCTION_EXTRACT_DELAY = 1.25;
const JUNCTION_GASH_REPAIR_RADIUS = 2.4;
const JUNCTION_GASH_SEAL_POINTS = 36;
const JUNCTION_GASH_DRAIN = .85;
const REINFORCEMENT_TIME = 12;
const REINFORCEMENT_HOLD = 2;
const REINFORCED_SPEED = .6;
const JUNCTION_SUPPLY_AMMO = 35;
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
const SPORE_STANDOFF = 2.4;
const SPORE_SPEED = 7.3;
const SPORE_RADIUS = 0.21;
const SPORE_ARM_TIME = 0.12;
const TURRET_RANGE = 10.5;
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

function confineToChamber(player) {
  const radius = chamberRadius(player.x, player.z);
  if (radius > 1) {
    player.x /= radius;
    player.z /= radius;
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
  constructor(area = 'artery', { tutorial = false, upgrades = [] } = {}) {
    this.organMission = Object.hasOwn(ORGAN_MISSIONS, area) ? ORGAN_MISSIONS[area] : null;
    this.area = this.organMission || area === 'heart' || area === 'junction' ? area : 'artery';
    this.missions = this.organMission?.waves ?? (this.area === 'heart' ? HEART_MISSIONS : this.area === 'junction' ? JUNCTION_MISSIONS : MISSIONS);
    this.hasTutorial = tutorial && this.area === 'artery';
    const activeUpgrades = !this.hasTutorial && Array.isArray(upgrades) ? upgrades : [];
    this.magazineSize = activeUpgrades.includes('deep-magazine') ? DEEP_MAGAZINE_CAPACITY : RULES.magazine;
    this.repairAmount = activeUpgrades.includes('fast-sealer') ? FAST_SEALER_REPAIR : REPAIR_PER_CYCLE;
    this.reset();
  }

  get reloadProgress() {
    return this.reloading > 0 ? 1 - this.reloading / RELOAD_TIME : 0;
  }

  get organWave() {
    return this.organMission?.waves[this.wave - 1]?.name ?? null;
  }

  get tissue() {
    return (this.nodes[0].health + this.nodes[1].health) / this.nodes.length;
  }

  get turretPlacement() {
    if ((!this.turretCharges && !this.canRedeployTurret) || this.tutorial || this.extractionPending ||
      (this.phase !== 'combat' && this.phase !== 'intermission')) return null;
    const { x, z, yaw } = this.player;
    const point = { x: x - Math.sin(yaw) * 2.2, y: 0, z: z - Math.cos(yaw) * 2.2 };
    if (this.valve && (Math.abs(point.x) > HEART_MAX_PLAYER_X - .65 ||
      point.z < HEART_MIN_PLAYER_Z + .65 || point.z > HEART_MAX_PLAYER_Z - .65)) return null;
    if (chamberRadius(point.x, point.z) > .975) return null;
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
    if (this.overtime) this.missions = JUNCTION_MISSIONS;
    this.valve = this.area === 'heart' ? {
      phase: 'closed', duration: HEART_CLOSED_TIME, remaining: HEART_CLOSED_TIME,
      openness: 0, exposed: false, colonyDefeated: false,
    } : null;
    this.player = {
      x: 0, y: 1.7, z: this.valve ? 2 : this.area === 'junction' ? 13 : 18, yaw: 0, pitch: 0,
      health: RULES.health, ammo: this.magazineSize, reserve: RULES.initialReserve,
    };
    if (this.organMission) [this.player.x, this.player.z] = this.organMission.entry;
    this.phase = 'ready';
    this.tutorial = null;
    this.nodes = TISSUE_NODES[this.area].map(node => ({ ...node, health: RULES.tissue, underAttack: false }));
    this.objective = this.nodes[0];
    this.failedNode = null;
    this.wave = 0;
    this.waves = this.missions.length;
    this.clock = 0;
    this.score = 0;
    this.kills = 0;
    this.remaining = 0;
    this.repairProgress = 0;
    this.repairing = false;
    this.repairTarget = null;
    this.nearTissue = false;
    this.nearNode = null;
    this.nearGash = false;
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
    this.reloading = 0;
    this.fireCooldown = 0;
    this.reloadHeld = false;
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
    this.organ = this.organMission ? this.createOrganPhase('recovery') : null;
  }

  start() {
    this.reset();
    this.beginWave();
    if (this.valve) {
      this.objective.health = RULES.tissue - 2 * REPAIR_PER_CYCLE;
      this.colony = this.createEnemy('colony', HEART_VALVE.x, -13.25, this.objective);
      this.enemies.push(this.colony);
      return;
    }
    if (this.hasTutorial) {
      this.tutorial = 'observe';
      this.player.z = 2.5;
      const attacker = this.createEnemy('bacillus', this.objective.x - 3.25, this.objective.z + 5.6, this.objective);
      attacker.tutorial = true;
      attacker.health = attacker.maxHealth = SPECIES.virus.health;
      this.enemies.push(attacker);
      this.spawnIndex = 1;
    }
  }

  beginWave() {
    this.wave += 1;
    this.phase = 'combat';
    this.intermission = 0;
    this.spawnIndex = 0;
    this.junctionSurgeIndex = 0;
    this.waveStartedAt = this.clock;
    if (this.organ) {
      this.organCycle = this.wave - 1;
      this.organ = this.createOrganPhase('recovery');
    }
    this.spawnCountdown = this.wave === 1 ? 0.8 : 0.65;
    const mission = this.missions[this.wave - 1];
    this.remaining = (mission.arrivals ?? mission.species).length;
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
      const player = this.player;
      const amount = Math.min(JUNCTION_SUPPLY_AMMO, RULES.reserveCap - player.reserve);
      player.reserve += amount;
      const rounds = Math.min(this.magazineSize - player.ammo, player.reserve);
      player.ammo += rounds;
      player.reserve -= rounds;
      this.reloading = 0;
      this.events.push({ type: 'junctionSupply', choice, amount });
    } else if (choice === 'left' || choice === 'right') {
      this.reinforcement = { branch: choice, remaining: REINFORCEMENT_TIME, duration: REINFORCEMENT_TIME, started: false };
      this.events.push({ type: 'junctionSupply', choice, ...JUNCTION_INLETS[choice] });
    } else if (movedTurret) {
      this.events.push({ type: 'junctionSupply', choice });
    }
  }

  clearWave() {
    this.projectiles.length = 0;
    this.reinforcement = null;
    this.score += 250 * this.wave;
    this.events.push({ type: 'wave', wave: this.wave, stage: 'clear' });
    if (this.wave === this.waves) {
      if (this.area === 'junction') {
        this.settling = true;
        this.phase = 'intermission';
        this.intermission = JUNCTION_REPAIR_TIME;
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
    this.player.reserve = Math.min(RULES.reserveCap, this.player.reserve + (junction ? 12 : 55));
    this.player.health = Math.min(RULES.health, this.player.health + (junction ? 12 : 18));
  }

  endMission(outcome, reason) {
    if (outcome === 'won' && this.overtime && !this.overtimeBonus) {
      this.overtimeBonus = JUNCTION_OVERTIME.bonus;
      this.score += this.overtimeBonus;
    }
    this.phase = outcome;
    this.projectiles.length = 0;
    this.events.push({ type: 'mission', outcome, reason, nodeId: this.failedNode?.id });
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
    if (this.organ) this.updateOrgan(dt);
    this.movePlayer(dt, input);
    if (this.organ?.phase === 'active') this.applyOrganHazard(dt);
    if (this.gash) {
      this.damageNode(this.gash.node, this.gash.drainPerSecond * dt);
    }
    if (this.failedNode) {
      this.endMission('lost', 'tissue');
      return;
    }
    if (this.organ && this.player.health === 0) {
      this.endMission('lost', 'suit');
      return;
    }
    if (input.deploy) this.deployTurret();
    const repairing = this.updateRepair(dt, input.repair);
    this.updateRifle(dt, input, repairing);
    this.updateTurret(dt);

    if (this.valve) {
      this.advanceEnemies(dt);
      this.advanceProjectiles(dt);
      this.remaining = this.enemies.length + HEART_PATROL.length - this.patrolIndex;
      this.settling = this.valve.colonyDefeated;
      if (this.failedNode) this.endMission('lost', 'tissue');
      else if (this.player.health === 0) this.endMission('lost', 'suit');
      else if (this.settling && this.remaining === 0 && this.projectiles.length === 0 && this.tissue === RULES.tissue) {
        this.score += 250;
        this.endMission('won');
      }
      return;
    }

    if (this.tutorial) {
      this.advanceEnemies(dt);
      this.remaining = this.missions[0].species.length - this.spawnIndex + this.enemies.length;
      if (this.tutorial === 'repair' && this.tissue === RULES.tissue) {
        this.tutorial = null;
        this.player.ammo = this.magazineSize;
        this.player.reserve = RULES.initialReserve;
        this.reloading = 0;
        this.spawnCountdown = 1.35;
        this.events.push({ type: 'tutorial', stage: 'complete' });
      }
      return;
    }

    if (this.phase === 'intermission') {
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

    const mission = this.missions[this.wave - 1];
    if (this.reinforcement?.started) {
      this.reinforcement.remaining = Math.max(0, this.reinforcement.remaining - dt);
      if (this.reinforcement.remaining === 0) this.reinforcement = null;
    }
    if (mission.arrivals) {
      const elapsed = this.clock - this.waveStartedAt;
      let arrival = mission.arrivals[this.spawnIndex];
      while (arrival && arrival.at <= elapsed + 1e-9) {
        this.spawnJunctionEnemy(arrival);
        arrival = mission.arrivals[this.spawnIndex];
      }
    } else {
      this.spawnCountdown -= dt;
      if (this.spawnIndex < mission.species.length && this.spawnCountdown <= 0) {
        this.spawn(mission.species[this.spawnIndex]);
        this.spawnCountdown += mission.cadence;
      }
    }
    this.advanceEnemies(dt);
    this.advanceProjectiles(dt);
    this.remaining = (mission.arrivals ?? mission.species).length - this.spawnIndex + this.enemies.length;

    if (this.failedNode) {
      this.endMission('lost', 'tissue');
    } else if (this.player.health === 0) {
      this.endMission('lost', 'suit');
    } else if (this.remaining === 0 && this.projectiles.length === 0) {
      this.clearWave();
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
    const target = node ? ' · ' + node.name : '';
    return {
      phase,
      label: phase === 'recovery' ? hazard.name + ' in' : hazard.name + target,
      detail: phase === 'active' ? hazard.effect : hazard.instruction + (phase === 'recovery' ? target : ''),
      remaining: hazard[phase],
      x: node?.x ?? hazard.x,
      z: node?.z ?? hazard.z,
      nodeId: node?.id ?? null,
      repairBlocked: phase === 'active' && Boolean(hazard.repairBlocked),
      width: hazard.width,
      depth: hazard.depth,
      radius: hazard.radius,
    };
  }

  updateOrgan(dt) {
    if (this.phase !== 'combat') {
      this.organ.remaining = this.intermission + this.organMission.hazard.recovery;
      return;
    }
    let state = this.organ;
    state.remaining = Math.max(0, state.remaining - dt);
    if (state.remaining <= 1e-9) {
      if (state.phase === 'active') this.organCycle += 1;
      const next = state.phase === 'recovery' ? 'warning' : state.phase === 'warning' ? 'active' : 'recovery';
      state = this.organ = this.createOrganPhase(next);
      this.organNextDamage = this.clock;
      this.events.push({ type: 'organ', stage: next, area: this.area, x: state.x, y: .8, z: state.z });
    }
    const { hazard } = this.organMission;
    if (state.phase === 'active' && hazard.endZ !== undefined) {
      state.z = hazard.z + (hazard.endZ - hazard.z) * (1 - state.remaining / hazard.active);
    }
  }

  applyOrganHazard(dt) {
    const { player, organ } = this;
    if (!withinHazard(player, organ)) return;
    const { push, damage } = this.organMission.hazard;
    if (push) {
      player.z += push * dt;
      this.confineToArena(player);
    }
    if (damage && this.clock >= this.organNextDamage) {
      this.organNextDamage = this.clock + .65;
      this.damageTarget(player, 'player', damage);
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
    const colony = this.colony;
    if (!colony) return;
    if (open) colony.attackCooldown = 0;
    else if (this.player.ammo + this.player.reserve < this.magazineSize) this.player.reserve += this.magazineSize;
  }

  advanceColony(dt) {
    const colony = this.colony;
    if (!colony) return;

    colony.attackingTissue = this.valve.exposed;
    if (!colony.attackingTissue) return;
    colony.node.underAttack = true;
    colony.attackCooldown = Math.max(0, colony.attackCooldown - dt);
    if (colony.attackCooldown > 0) return;
    colony.attackCooldown = SPECIES.colony.period;
    this.damageTarget(colony, 'tissue', SPECIES.colony.tissueDamage, HEART_VALVE);
  }

  spawnHeartPatrol() {
    if (this.patrolIndex >= HEART_PATROL.length || this.clock < 2.3 + this.patrolIndex * 5.2) return;
    const index = this.patrolIndex++;
    const entry = index % 2 === 0 ? { x: 12.2, z: 19.3 } : { x: -10.8, z: 16.9 };
    this.enemies.push(this.createEnemy(HEART_PATROL[index], entry.x, entry.z, this.nodes[1]));
  }

  movePlayer(dt, input) {
    const { player } = this;
    const sensitivity = input.aim ? TURN_SENSITIVITY * 0.68 : TURN_SENSITIVITY;
    player.yaw -= (input.lookX || 0) * sensitivity;
    player.pitch = clamp(player.pitch - (input.lookY || 0) * sensitivity, -1.46, 1.46);

    const strafe = input.moveX || 0;
    const forward = input.moveZ || 0;
    const diagonal = Math.max(1, Math.hypot(strafe, forward));
    let speed = input.aim ? 3.3 : input.sprint && !input.fire ? 8.8 : 5.8;
    if (this.organ?.phase === 'active' && this.organMission.hazard.slow && withinHazard(player, this.organ)) {
      speed *= this.organMission.hazard.slow;
    }
    const travel = speed * dt / diagonal;
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    player.x += (strafe * cos - forward * sin) * travel;
    player.z -= (strafe * sin + forward * cos) * travel;
    this.confineToArena(player);
  }

  confineToArena(actor) {
    if (this.valve) {
      actor.x = clamp(actor.x, -HEART_MAX_PLAYER_X, HEART_MAX_PLAYER_X);
      actor.z = clamp(actor.z, HEART_MIN_PLAYER_Z, HEART_MAX_PLAYER_Z);
    } else confineToChamber(actor);
  }

  updateRepair(dt, held) {
    this.nearNode = null;
    let target = null;
    let nearestDistance = RULES.repairRadius;
    let repairDistance = RULES.repairRadius;
    for (const node of this.nodes) {
      const distance = Math.hypot(this.player.x - node.x, this.player.z - node.z);
      if (distance <= nearestDistance) {
        this.nearNode = node;
        nearestDistance = distance;
      }
      const overloaded = this.organ?.repairBlocked && this.organ.nodeId === node.id;
      if (node.health < RULES.tissue && distance <= repairDistance && !overloaded &&
        (!this.valve || node !== this.objective || this.valve.phase === 'closed')) {
        target = node;
        repairDistance = distance;
      }
    }
    this.nearTissue = Boolean(this.nearNode);
    const gash = this.gash;
    this.nearGash = !!gash && Math.hypot(this.player.x - gash.x, this.player.z - gash.z) <= JUNCTION_GASH_REPAIR_RADIUS;
    if (this.nearGash) target = gash;
    const mayRepair = !this.tutorial || this.tutorial === 'repair';
    this.canRepair = mayRepair && !!target;

    const active = Boolean(held && this.canRepair);
    if (!active || this.repairTarget !== target) this.repairProgress = 0;
    this.repairTarget = active ? target : null;
    if (active !== this.repairing) {
      this.repairing = active;
      this.events.push({ type: active ? 'repairStart' : 'repairStop' });
    }
    if (!active) return false;

    this.repairProgress += dt / REPAIR_TIME;
    if (this.repairProgress >= 1) {
      const sealing = target === gash;
      const node = sealing ? gash.node : target;
      const amount = Math.min(this.repairAmount, RULES.tissue - node.health);
      node.health += amount;
      if (!this.tutorial) this.score += amount * 8;
      this.repairProgress -= 1;
      if (sealing) {
        gash.sealRemaining = Math.max(0, gash.sealRemaining - this.repairAmount);
        if (gash.sealRemaining === 0) {
          this.gash = null;
          this.events.push({ type: 'gash', stage: 'closed', branch: gash.branch, nodeId: node.id, x: gash.x, y: gash.y, z: gash.z });
        }
      }
      const complete = this.gash?.node !== node && node.health === RULES.tissue;
      this.canRepair = sealing ? !!this.gash : node.health < RULES.tissue;
      this.events.push({ type: 'repair', amount, complete, gash: sealing, nodeId: node.id, x: target.x, y: target.y, z: target.z });
    }
    return true;
  }

  updateRifle(dt, input, repairing) {
    const { player } = this;
    if (this.tutorial && player.ammo === 0 && player.reserve === 0) player.reserve = this.magazineSize;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.reloading > 0) {
      this.reloading = Math.max(0, this.reloading - dt);
      if (this.reloading === 0) {
        const rounds = Math.min(this.magazineSize - player.ammo, player.reserve);
        player.ammo += rounds;
        player.reserve -= rounds;
        this.events.push({ type: 'reload', stage: 'complete' });
      }
    }

    const reloadPressed = input.reload && !this.reloadHeld;
    this.reloadHeld = Boolean(input.reload);
    if (repairing || this.reloading > 0) return;
    if (reloadPressed || (input.fire && player.ammo === 0)) {
      if (player.ammo < this.magazineSize && player.reserve > 0) {
        this.reloading = RELOAD_TIME;
        this.events.push({ type: 'reload', stage: 'start' });
        return;
      }
    }
    if (!input.fire || this.fireCooldown > 0) return;
    if (player.ammo === 0) {
      this.fireCooldown = 0.27;
      this.events.push({ type: 'dry' });
      return;
    }
    this.shoot(input.aim);
  }

  deployTurret() {
    if (this.tutorial) return false;
    const redeploying = this.canRedeployTurret;
    const point = this.turretPlacement;
    if (!point) {
      const { x, y, z } = this.player;
      this.events.push({ type: 'turret', stage: this.turretCharges || redeploying ? 'invalid' : 'empty', x, y, z });
      return false;
    }
    this.turret = { ...point, yaw: Math.PI + this.player.yaw, pitch: 0, cooldown: .6, targetId: null };
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
      if (enemy.type === 'colony' || enemy.tutorial) continue;
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
    target.slowRemaining = TURRET_SLOW_TIME;
    if (!target.latched && target.action.endsWith('-windup')) {
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

  shoot(aiming) {
    const { player } = this;
    player.ammo -= 1;
    this.fireCooldown = SHOT_INTERVAL;
    const pitchCos = Math.cos(player.pitch);
    const dx = -Math.sin(player.yaw) * pitchCos;
    const dy = Math.sin(player.pitch);
    const dz = -Math.cos(player.yaw) * pitchCos;
    let distance = RIFLE_RANGE;
    let target;
    let critical = false;
    for (const enemy of this.enemies) {
      if (enemy.tutorial && this.tutorial === 'observe') continue;
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
      critical = offsetSquared <= radiusSquared * (aiming ? 0.23 : 0.16);
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
          this.events.push({ type: 'valve', stage: 'blocked', x, y, z: HEART_VALVE.z });
        }
      }
    }

    const impact = {
      x: player.x + dx * distance, y: player.y + dy * distance, z: player.z + dz * distance,
    };
    if (target?.type === 'guard' && guardFaces(target, player)) {
      this.events.push({ type: 'shot', hit: false, crit: false, ...impact });
      this.blockGuardHit(target, impact, 'player');
      return;
    }
    this.events.push({ type: 'shot', hit: Boolean(target), crit: critical, ...impact });
    if (target) this.hitEnemy(target, critical ? 42 : 23, critical, impact, 'player');
  }

  blockGuardHit(guard, impact, source) {
    this.events.push({ type: 'guard', stage: 'block', id: guard.id, source, ...impact });
  }

  hitEnemy(target, damage, critical, impact, source) {
    target.health -= damage;
    const lethal = target.health <= 0;
    this.events.push({ type: 'hit', id: target.id, damage, crit: critical, lethal, source, ...impact });
    if (!lethal) return;

    this.enemies.splice(this.enemies.indexOf(target), 1);
    this.kills += 1;
    const score = target.fragment ? FRAGMENT.score : target.tutorial ? SPECIES.virus.score : SPECIES[target.type].score;
    this.score += score + (critical ? 35 : 0);
    this.events.push({
      type: 'kill', id: target.id, enemyType: target.type, source, x: target.x, y: target.y, z: target.z,
    });
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
      this.confineToArena(fragment);
      this.enemies.push(fragment);
    }
  }

  spawn(type) {
    const index = this.spawnIndex++;
    const lane = this.organMission ? Number(this.missions[this.wave - 1].lanes[index] === 'R') : (index + this.wave - 1) % this.nodes.length;
    const route = (this.organMission?.inlets ?? ENTRANCES)[lane];
    const [x, z] = route[(Math.floor(index / this.nodes.length) + this.wave - 1) % route.length];
    const spawnX = index === 0 ? x : x + Math.sin(index * 2.4 + this.wave) * 1.35;
    const spawnZ = z + Math.cos(index * 1.9 + this.wave) * 0.85;
    this.enemies.push(this.createEnemy(type, spawnX, spawnZ, this.nodes[lane]));
  }

  spawnJunctionEnemy({ type, branch, surge }) {
    const index = this.spawnIndex++;
    const inlet = JUNCTION_INLETS[branch];
    const node = this.nodes[JUNCTION_NODE_INDEX[branch]];
    const spawnX = Math.sign(inlet.x) * (22.6 + Math.sin(index * 1.7) * .47);
    const spawnZ = -24.9 + Math.cos(index * 2.2) * .47;
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
      heading: type === 'guard' ? Math.atan2(node.x - x, node.z - z) : 0,
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
    if (action === 'idle') enemy.actionTarget = null;
  }

  advanceAction(enemy, dt, duration) {
    enemy.actionElapsed += dt;
    enemy.actionProgress = Math.min(1, enemy.actionElapsed / duration);
    return enemy.actionProgress === 1;
  }

  attackEvent(enemy, stage, target, origin = enemy) {
    const event = {
      type: 'enemyAttack', enemyType: enemy.type, id: enemy.id, stage, target,
      x: origin.x, y: origin.y, z: origin.z,
    };
    if (target === 'tissue') event.nodeId = enemy.nodeId;
    if (enemy.branch) event.branch = enemy.branch;
    this.events.push(event);
  }

  advanceBacillus(enemy, dt, spec, speedFactor) {
    const anchor = enemy.attackAnchor ?? enemy.node;
    if (!enemy.latched) {
      const dx = anchor.x - enemy.x;
      const dz = anchor.z - enemy.z;
      const distance = Math.hypot(dx, dz);
      enemy.heading = Math.atan2(dx, dz);
      const speed = enemy.tutorial ? 2.7 : spec.speed + (this.wave - 1) * 0.13;
      const travel = Math.min(Math.max(0, distance - LATCH_RANGE), speed * speedFactor * dt);
      if (distance > LATCH_RANGE) {
        enemy.x += dx * travel / distance;
        enemy.z += dz * travel / distance;
      }
      if (distance - travel > LATCH_RANGE + 0.001) {
        enemy.y = spec.y + Math.sin(this.clock * 3.2 + enemy.id * 1.7) * 0.08;
        return;
      }
      enemy.latched = true;
      enemy.attackingTissue = true;
      enemy.node.underAttack = true;
      enemy.y = anchor.y + 0.13;
      enemy.attackCooldown = LATCH_WINDUP;
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
    node.underAttack = true;
    node.health = Math.max(0, node.health - amount);
    if (node.health === 0) this.failedNode ??= node;
  }

  damageTarget(enemy, target, amount, origin = enemy) {
    if (target === 'player') this.player.health = Math.max(0, this.player.health - amount);
    else {
      if (this.organ?.phase === 'active' && this.organ.nodeId === enemy.nodeId) {
        amount *= this.organMission.hazard.tissueDamage ?? 1;
      }
      this.damageNode(enemy.node, amount);
    }
    const impact = { type: 'damage', target, amount, id: enemy.id, x: origin.x, y: origin.y, z: origin.z };
    if (target === 'tissue') impact.nodeId = enemy.nodeId;
    if (enemy.branch) impact.branch = enemy.branch;
    if (enemy.attackAnchor === origin) impact.anchor = 'gash';
    this.events.push(impact);
  }

  advanceEnemies(dt) {
    const { player } = this;
    for (const enemy of this.enemies) {
      if (enemy.type === 'colony') continue;
      const spec = enemy.fragment ? FRAGMENT : SPECIES[enemy.type];
      const { behavior } = enemy;
      const reinforced = !!this.reinforcement && this.reinforcement.branch === enemy.branch;
      const speedFactor = (reinforced ? REINFORCED_SPEED : 1) * (enemy.slowRemaining > 0 ? TURRET_SLOW_FACTOR : 1);
      enemy.slowRemaining = Math.max(0, enemy.slowRemaining - dt);
      if (reinforced && enemy.inletHold > 0) {
        enemy.inletHold -= dt;
        continue;
      }
      if (behavior === 'bacillus') {
        this.advanceBacillus(enemy, dt, spec, speedFactor);
        continue;
      }
      if (enemy.action !== 'idle') {
        enemy.node.underAttack ||= enemy.attackingTissue;
        if (behavior === 'virus') this.advanceVirusAttack(enemy, dt, spec);
        else this.advanceSporeAttack(enemy, dt);
        continue;
      }

      const distanceToSuit = Math.hypot(player.x - enemy.x, player.z - enemy.z);
      const distanceToTissue = Math.hypot(enemy.node.x - enemy.x, enemy.node.z - enemy.z);
      const aggro = behavior === 'spore' ? 12 : 7.4;
      const attacksSuit = distanceToSuit < aggro && distanceToSuit < distanceToTissue + 0.6;
      const target = attacksSuit ? player : enemy.node;
      const distance = attacksSuit ? distanceToSuit : distanceToTissue;
      const range = behavior === 'virus' ? (attacksSuit ? VIRUS_RANGE : 2.7) : (attacksSuit ? SPORE_RANGE : 3.4);
      enemy.attackingTissue = !attacksSuit && distance <= range + 0.04;
      enemy.node.underAttack ||= enemy.attackingTissue;
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      enemy.heading = Math.atan2(target.x - enemy.x, target.z - enemy.z);
      enemy.y = spec.y + Math.sin(this.clock * 3.2 + enemy.id * 1.7) * 0.24;
      if (behavior === 'spore' && attacksSuit && distance > 0.01 && distance < SPORE_STANDOFF - 0.04) {
        const retreat = Math.min(SPORE_STANDOFF - distance, 2.6 * speedFactor * dt);
        enemy.x -= Math.sin(enemy.heading) * retreat;
        enemy.z -= Math.cos(enemy.heading) * retreat;
        this.confineToArena(enemy);
        if (Math.hypot(player.x - enemy.x, player.z - enemy.z) > distance + retreat * .3) continue;
      }
      if (distance > range + 0.04) {
        const heading = Math.atan2(target.z - enemy.z, target.x - enemy.x);
        const course = heading + Math.sin(this.clock * 2.2 + enemy.id * 2.9) * 0.30 * Math.min(1, distance / 4);
        const travel = Math.min(distance - range, (spec.speed + (this.wave - 1) * 0.13) * speedFactor * dt);
        enemy.x += Math.cos(course) * travel;
        enemy.z += Math.sin(course) * travel;
      } else if (enemy.attackCooldown === 0) {
        this.startEnemyAttack(enemy, target, attacksSuit ? 'player' : 'tissue');
      }
    }
  }

  startEnemyAttack(enemy, target, targetName) {
    enemy.actionTarget = targetName;
    enemy.attackOrigin = { x: enemy.x, y: enemy.y, z: enemy.z };
    enemy.attackPoint = { x: target.x, y: target.y, z: target.z };
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

      const hitsSuit = enemy.actionTarget === 'player' && Math.hypot(enemy.x - this.player.x, enemy.z - this.player.z) < 1.06;
      const hitsTissue = enemy.actionTarget === 'tissue';
      if (hitsSuit || hitsTissue) this.damageTarget(enemy, enemy.actionTarget, hitsSuit ? spec.suitDamage : spec.tissueDamage);
      this.attackEvent(enemy, hitsSuit || hitsTissue ? 'impact' : 'miss', enemy.actionTarget);
      this.setEnemyAction(enemy, 'virus-recover');
      return;
    }
    if (this.advanceAction(enemy, dt, VIRUS_RECOVERY)) {
      enemy.attackCooldown = enemy.actionTarget === 'tissue' ? 0.12 : 0.34;
      this.setEnemyAction(enemy, 'idle');
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
      this.setEnemyAction(enemy, 'idle');
    }
  }

  launchSpore(enemy) {
    const aim = enemy.attackPoint;
    const dx = aim.x - enemy.x;
    const dy = aim.y - enemy.y;
    const dz = aim.z - enemy.z;
    const distance = Math.hypot(dx, dy, dz);
    const scale = SPORE_SPEED / Math.max(0.01, distance);
    this.projectiles.push({
      id: this.nextProjectileId++, owner: enemy,
      target: enemy.actionTarget, x: enemy.x, y: enemy.y, z: enemy.z,
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
      const objective = target === 'player' ? this.player : owner.node;
      const tx = objective.x - from.x;
      const ty = objective.y - from.y;
      const tz = objective.z - from.z;
      const lengthSquared = dx * dx + dy * dy + dz * dz;
      const armed = projectile.arming <= travel;
      const armedStart = travel > 0 ? Math.min(1, projectile.arming / travel) : 0;
      const nearest = lengthSquared ? clamp((tx * dx + ty * dy + tz * dz) / lengthSquared, armedStart, 1) : 0;
      const radius = projectile.radius + (target === 'player' ? 0.61 : 1.08);
      if (armed && Math.hypot(tx - dx * nearest, ty - dy * nearest, tz - dz * nearest) <= radius) {
        const impact = { x: from.x + dx * nearest, y: from.y + dy * nearest, z: from.z + dz * nearest };
        const spec = SPECIES.spore;
        this.damageTarget(owner, target, target === 'player' ? spec.suitDamage : spec.tissueDamage, impact);
        this.attackEvent(owner, 'impact', target, impact);
        continue;
      }

      projectile.x += dx;
      projectile.y += dy;
      projectile.z += dz;
      projectile.arming = Math.max(0, projectile.arming - travel);
      projectile.lifetime -= travel;
      if (projectile.lifetime <= 0) {
        this.attackEvent(owner, 'miss', target, projectile);
      } else {
        this.projectiles[active++] = projectile;
      }
    }
    this.projectiles.length = active;
  }
}

