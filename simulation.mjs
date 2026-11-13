export const OBJECTIVE = Object.freeze({ x: 0, y: 1.25, z: -8 });
export const JUNCTION_INLETS = Object.freeze({
  left: Object.freeze({ x: -12.3, y: 1.42, z: -15.6 }),
  right: Object.freeze({ x: 12.3, y: 1.42, z: -15.6 }),
});
export const JUNCTION_GASH_SITES = Object.freeze({
  left: Object.freeze({ x: -4.8, y: 0.95, z: -7.4 }),
  right: Object.freeze({ x: 4.8, y: 0.95, z: -7.4 }),
});
export const HEART_VALVE = Object.freeze({ x: 0, y: 2, z: -10.7, radius: 3.65 });

export const RULES = Object.freeze({
  health: 100,
  tissue: 100,
  magazine: 30,
  initialReserve: 150,
  reserveCap: 240,
  repairRadius: 5.4,
  arenaX: 21,
  arenaZ: 32,
});

const SPECIES = {
  virus: { radius: 0.92, y: 1.63, health: 34, speed: 2.05, suitDamage: 9, tissueDamage: 5, score: 100 },
  bacillus: { radius: 1.12, y: 1.13, health: 68, speed: 1.32, tissueDamage: 9, period: 1.75, score: 180 },
  spore: { radius: 0.73, y: 2.10, health: 18, speed: 3.28, suitDamage: 7, tissueDamage: 3, score: 130 },
  colony: { radius: 1.10, y: 3.35, health: 1100, tissueDamage: 11, period: 1.57, score: 900 },
};

const MISSIONS = [
  { cadence: 1.85, species: ['virus', 'virus', 'virus', 'spore', 'virus', 'virus'] },
  { cadence: 1.44, species: ['virus', 'spore', 'virus', 'bacillus', 'virus', 'spore', 'bacillus', 'virus'] },
  { cadence: 1.12, species: ['spore', 'virus', 'bacillus', 'virus', 'spore', 'spore', 'bacillus', 'virus', 'bacillus', 'spore'] },
  { cadence: 0.90, species: ['virus', 'bacillus', 'spore', 'spore', 'bacillus', 'virus', 'virus', 'bacillus', 'spore', 'bacillus', 'spore', 'virus'] },
  { cadence: 0.72, species: ['bacillus', 'spore', 'virus', 'bacillus', 'spore', 'virus', 'bacillus', 'spore', 'bacillus', 'virus', 'spore', 'bacillus', 'spore', 'bacillus', 'virus'] },
];

const JUNCTION_MISSIONS = [
  {
    name: 'Virus Rush', lane: 'left',
    species: ['virus', 'virus', 'virus', 'virus'],
    branches: ['left', 'left', 'right', 'left'],
    delays: [.64, 1.45, .95],
  },
  {
    name: 'Spore Crossfire', lane: 'both',
    species: ['spore', 'spore', 'virus', 'spore'],
    branches: ['left', 'right', 'right', 'left'],
    delays: [.44, 1.42, 1.6],
  },
  {
    name: 'Breach', lane: 'left', breach: true,
    species: ['bacillus', 'virus', 'spore', 'spore', 'virus'],
    branches: ['left', 'left', 'right', 'right', 'left'],
    // Teal spores enter as the slower amber bacillus closes on the tissue.
    delays: [1.0, 3.75, 1.35, 2.0],
  },
];

const JUNCTION_OVERTIME = {
  name: 'Overtime', lane: 'both', breach: true, bonus: 2000,
  species: ['bacillus', 'virus', 'spore', 'spore', 'virus', 'spore', 'virus'],
  branches: ['right', 'right', 'left', 'left', 'right', 'left', 'right'],
  // Amber spore volleys start before the teal bacillus can latch.
  delays: [.68, .85, .73, 1.2, .95, 1.2],
};

const HEART_MISSIONS = [{ species: ['colony'] }];
const HEART_CLOSED_TIME = 3.8;
const HEART_OPEN_TIME = 3.4;
const HEART_LEAFLET_TIME = 0.42;
const HEART_MIN_PLAYER_Z = -9.8;

const ENTRANCES = [
  [0, -27], [-9, -23], [9, -23], [-16, -13], [16, -14], [3, -28],
  [-17, 6], [16, 10], [-10, 22], [10, 24],
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function confineToChamber(player) {
  const insetX = RULES.arenaX - 1.2;
  const insetZ = RULES.arenaZ - 1.4;
  const radius = Math.hypot(player.x / insetX, player.z / insetZ);
  if (radius > 1) {
    player.x /= radius;
    player.z /= radius;
  }
}

export class Simulation {
  constructor(area = 'artery', { tutorial = false, upgrades = [] } = {}) {
    this.area = area === 'heart' || area === 'junction' ? area : 'artery';
    this.missions = this.area === 'heart' ? HEART_MISSIONS : this.area === 'junction' ? JUNCTION_MISSIONS : MISSIONS;
    this.objective = OBJECTIVE;
    this.hasTutorial = tutorial && this.area === 'artery';
    const activeUpgrades = !this.hasTutorial && Array.isArray(upgrades) ? upgrades : [];
    this.magazineSize = activeUpgrades.includes('deep-magazine') ? DEEP_MAGAZINE_CAPACITY : RULES.magazine;
    this.repairAmount = activeUpgrades.includes('fast-sealer') ? FAST_SEALER_REPAIR : REPAIR_PER_CYCLE;
    this.reset();
  }

  get reloadProgress() {
    return this.reloading > 0 ? 1 - this.reloading / RELOAD_TIME : 0;
  }

  get junctionWave() {
    return this.area === 'junction' ? this.missions[this.wave - 1] ?? null : null;
  }

  get junctionForecast() {
    return this.area === 'junction' ? this.missions[this.wave] ?? null : null;
  }

  get overtimeForecast() {
    return this.area === 'junction' && !this.overtime ? JUNCTION_OVERTIME : null;
  }

  selectJunctionSupply(choice) {
    if (this.phase !== 'intermission' || !this.junctionForecast || !['left', 'right', 'ammo'].includes(choice)) return false;
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
    this.phase = 'ready';
    this.tutorial = null;
    this.tissue = RULES.tissue;
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
    this.nearGash = false;
    this.canRepair = false;
    this.gash = null;
    this.junctionGashOpened = false;
    this.junctionSupply = null;
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
    this.events = [];
  }

  start() {
    this.reset();
    this.beginWave();
    if (this.valve) {
      this.tissue = RULES.tissue - 2 * REPAIR_PER_CYCLE;
      this.enemies.push(this.createEnemy('colony', HEART_VALVE.x, -13.25));
      return;
    }
    if (this.hasTutorial) {
      this.tutorial = 'observe';
      this.player.z = 2.5;
      const attacker = this.createEnemy('bacillus', this.objective.x - 3.25, this.objective.z + 5.6);
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
    this.spawnCountdown = this.wave === 1 ? 0.8 : 0.65;
    this.remaining = this.missions[this.wave - 1].species.length;
    this.applyJunctionSupply();
    this.events.push({ type: 'wave', wave: this.wave, stage: 'start' });
  }

  applyJunctionSupply() {
    const choice = this.junctionSupply;
    this.junctionSupply = null;
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
    } else if (choice) {
      this.reinforcement = { branch: choice, remaining: REINFORCEMENT_TIME, duration: REINFORCEMENT_TIME };
      this.events.push({ type: 'junctionSupply', choice, ...JUNCTION_INLETS[choice] });
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
    this.events.push({ type: 'mission', outcome, reason });
  }

  step(dt, input = {}) {
    this.events = [];
    if (this.extractionPending || (this.phase !== 'combat' && this.phase !== 'intermission')) return;
    dt = clamp(dt, 0, 0.1);
    this.clock += dt;
    if (this.valve) {
      this.updateValve();
      this.advanceColony(dt);
      if (this.phase === 'lost') return;
    }
    this.movePlayer(dt, input);
    if (this.gash) {
      this.tissue = Math.max(0, this.tissue - this.gash.drainPerSecond * dt);
      if (this.tissue === 0) {
        this.endMission('lost', 'tissue');
        return;
      }
    }
    const repairing = this.updateRepair(dt, input.repair);
    this.updateRifle(dt, input, repairing);

    if (this.valve) {
      if (this.enemies.length === 0) {
        this.remaining = 0;
        this.settling = true;
        this.valve.colonyDefeated = true;
        if (this.tissue === RULES.tissue) {
          this.score += 250;
          this.endMission('won');
        }
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
    if (this.reinforcement) {
      this.reinforcement.remaining = Math.max(0, this.reinforcement.remaining - dt);
      if (this.reinforcement.remaining === 0) this.reinforcement = null;
    }
    this.spawnCountdown -= dt;
    if (this.spawnIndex < mission.species.length && this.spawnCountdown <= 0) {
      this.spawn(mission.species[this.spawnIndex]);
      this.spawnCountdown += mission.delays?.[this.spawnIndex - 1] ?? mission.cadence ?? 0;
    }
    this.advanceEnemies(dt);
    this.advanceProjectiles(dt);
    this.remaining = mission.species.length - this.spawnIndex + this.enemies.length;

    if (this.tissue === 0) {
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
    const colony = this.enemies[0];
    if (!colony) return;
    if (open) colony.attackCooldown = 0;
    else if (this.player.ammo + this.player.reserve < this.magazineSize) this.player.reserve += this.magazineSize;
  }

  advanceColony(dt) {
    const colony = this.enemies[0];
    if (!colony) return;

    colony.attackingTissue = this.valve.exposed;
    if (!colony.attackingTissue) return;
    colony.attackCooldown = Math.max(0, colony.attackCooldown - dt);
    if (colony.attackCooldown > 0) return;
    colony.attackCooldown = SPECIES.colony.period;
    this.damageTarget(colony, 'tissue', SPECIES.colony.tissueDamage, HEART_VALVE);
    if (this.tissue === 0) this.endMission('lost', 'tissue');
  }

  movePlayer(dt, input) {
    const { player } = this;
    const sensitivity = input.aim ? TURN_SENSITIVITY * 0.68 : TURN_SENSITIVITY;
    player.yaw -= (input.lookX || 0) * sensitivity;
    player.pitch = clamp(player.pitch - (input.lookY || 0) * sensitivity, -1.46, 1.46);

    const strafe = input.moveX || 0;
    const forward = input.moveZ || 0;
    const diagonal = Math.max(1, Math.hypot(strafe, forward));
    const speed = input.aim ? 3.3 : input.sprint && !input.fire ? 8.8 : 5.8;
    const travel = speed * dt / diagonal;
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    player.x += (strafe * cos - forward * sin) * travel;
    player.z -= (strafe * sin + forward * cos) * travel;
    if (this.valve) {
      player.x = clamp(player.x, -6, 6);
      player.z = clamp(player.z, HEART_MIN_PLAYER_Z, 9);
    } else confineToChamber(player);
  }

  updateRepair(dt, held) {
    const distance = Math.hypot(this.player.x - this.objective.x, this.player.z - this.objective.z);
    this.nearTissue = distance <= RULES.repairRadius;
    const gash = this.gash;
    this.nearGash = !!gash && Math.hypot(this.player.x - gash.x, this.player.z - gash.z) <= JUNCTION_GASH_REPAIR_RADIUS;
    const mayRepair = this.valve ? this.valve.phase === 'closed' : !this.tutorial || this.tutorial === 'repair';
    const target = gash ? (this.nearGash ? gash : null) : (this.nearTissue && this.tissue < RULES.tissue ? this.objective : null);
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
      const amount = Math.min(this.repairAmount, RULES.tissue - this.tissue);
      this.tissue += amount;
      if (!this.tutorial) this.score += amount * 8;
      this.repairProgress -= 1;
      if (gash) {
        gash.sealRemaining = Math.max(0, gash.sealRemaining - this.repairAmount);
        if (gash.sealRemaining === 0) {
          this.gash = null;
          this.events.push({ type: 'gash', stage: 'closed', branch: gash.branch, x: gash.x, y: gash.y, z: gash.z });
        }
      }
      this.canRepair = this.gash ? this.nearGash : this.nearTissue && this.tissue < RULES.tissue;
      const complete = !this.gash && this.tissue === RULES.tissue;
      this.events.push({ type: 'repair', amount, complete, gash: !!gash, x: target.x, y: target.y, z: target.z });
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
    this.events.push({ type: 'shot', hit: Boolean(target), crit: critical, ...impact });
    if (!target) return;

    const damage = critical ? 42 : 23;
    target.health -= damage;
    const lethal = target.health <= 0;
    this.events.push({ type: 'hit', id: target.id, damage, crit: critical, lethal, ...impact });
    if (!lethal) return;

    this.enemies.splice(this.enemies.indexOf(target), 1);
    this.kills += 1;
    const score = target.tutorial ? SPECIES.virus.score : SPECIES[target.type].score;
    this.score += score + (critical ? 35 : 0);
    this.events.push({
      type: 'kill', id: target.id, enemyType: target.type, x: target.x, y: target.y, z: target.z,
    });
    if (target.tutorial) {
      this.tutorial = 'repair';
      this.events.push({ type: 'tutorial', stage: 'repair' });
    }
  }

  spawn(type) {
    const index = this.spawnIndex++;
    const entranceCount = Math.min(ENTRANCES.length, 5 + this.wave);
    const [x, z] = ENTRANCES[index % entranceCount];
    let spawnX = index === 0 ? x : x + Math.sin(index * 2.4 + this.wave) * 1.35;
    let spawnZ = z + Math.cos(index * 1.9 + this.wave) * 0.85;
    let branch;
    const junctionWave = this.junctionWave;
    if (junctionWave) {
      branch = junctionWave.branches[index];
      spawnX = Math.sign(JUNCTION_INLETS[branch].x) * (15.25 + Math.sin(index * 1.7) * .47);
      spawnZ = -18.5 + Math.cos(index * 2.2) * .47;
    }
    const enemy = this.createEnemy(type, spawnX, spawnZ);
    if (branch) {
      enemy.branch = branch;
      if (junctionWave.breach && type === 'bacillus') enemy.attackAnchor = JUNCTION_GASH_SITES[branch];
      if (this.reinforcement?.branch === branch) enemy.inletHold = REINFORCEMENT_HOLD;
      this.events.push({ type: 'branch', branch, x: enemy.x, y: enemy.y, z: enemy.z });
    }
    this.enemies.push(enemy);
  }

  createEnemy(type, x, z) {
    const spec = SPECIES[type];
    return {
      id: this.nextEnemyId++,
      type, x, y: spec.y, z,
      radius: spec.radius,
      health: spec.health,
      maxHealth: spec.health,
      attackCooldown: 0.65,
      attackingTissue: false,
      latched: false,
      heading: 0,
      action: 'idle',
      actionProgress: 0,
      actionElapsed: 0,
      actionTarget: null,
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
    if (enemy.branch) event.branch = enemy.branch;
    this.events.push(event);
  }

  advanceBacillus(enemy, dt, spec, speedFactor) {
    const anchor = enemy.attackAnchor ?? this.objective;
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
    if (enemy.attackAnchor && !this.junctionGashOpened && this.tissue > 0) {
      this.junctionGashOpened = true;
      this.gash = {
        ...anchor, branch: enemy.branch, drainPerSecond: JUNCTION_GASH_DRAIN,
        sealRemaining: JUNCTION_GASH_SEAL_POINTS, sealRequired: JUNCTION_GASH_SEAL_POINTS,
      };
      this.events.push({ type: 'gash', stage: 'open', branch: enemy.branch, ...anchor });
    }
    if (enemy.tutorial) {
      this.tutorial = 'intercept';
      this.events.push({ type: 'tutorial', stage: 'intercept' });
    }
  }

  damageTarget(enemy, target, amount, origin = enemy) {
    if (target === 'player') this.player.health = Math.max(0, this.player.health - amount);
    else this.tissue = Math.max(0, this.tissue - amount);
    const impact = { type: 'damage', target, amount, id: enemy.id, x: origin.x, y: origin.y, z: origin.z };
    if (enemy.branch) impact.branch = enemy.branch;
    if (enemy.attackAnchor === origin) impact.anchor = 'gash';
    this.events.push(impact);
  }

  advanceEnemies(dt) {
    const { player } = this;
    for (const enemy of this.enemies) {
      const spec = SPECIES[enemy.type];
      const reinforced = !!this.reinforcement && this.reinforcement.branch === enemy.branch;
      const speedFactor = reinforced ? REINFORCED_SPEED : 1;
      if (reinforced && enemy.inletHold > 0) {
        enemy.inletHold -= dt;
        continue;
      }
      if (enemy.type === 'bacillus') {
        this.advanceBacillus(enemy, dt, spec, speedFactor);
        continue;
      }
      if (enemy.action !== 'idle') {
        if (enemy.type === 'virus') this.advanceVirusAttack(enemy, dt, spec);
        else this.advanceSporeAttack(enemy, dt);
        continue;
      }

      const distanceToSuit = Math.hypot(player.x - enemy.x, player.z - enemy.z);
      const distanceToTissue = Math.hypot(this.objective.x - enemy.x, this.objective.z - enemy.z);
      const aggro = enemy.type === 'spore' ? 12 : 7.4;
      const attacksSuit = distanceToSuit < aggro && distanceToSuit < distanceToTissue + 0.6;
      const target = attacksSuit ? player : this.objective;
      const distance = attacksSuit ? distanceToSuit : distanceToTissue;
      const range = enemy.type === 'virus' ? (attacksSuit ? VIRUS_RANGE : 2.7) : (attacksSuit ? SPORE_RANGE : 3.4);
      enemy.attackingTissue = !attacksSuit && distance <= range + 0.04;
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      enemy.heading = Math.atan2(target.x - enemy.x, target.z - enemy.z);
      enemy.y = spec.y + Math.sin(this.clock * 3.2 + enemy.id * 1.7) * 0.24;
      if (enemy.type === 'spore' && attacksSuit && distance > 0.01 && distance < SPORE_STANDOFF - 0.04) {
        const retreat = Math.min(SPORE_STANDOFF - distance, 2.6 * dt);
        enemy.x -= Math.sin(enemy.heading) * retreat;
        enemy.z -= Math.cos(enemy.heading) * retreat;
        confineToChamber(enemy);
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
    if (enemy.type === 'virus') {
      // Leave the virus on the near side of what it strikes so it stays shootable.
      const dx = enemy.x - target.x;
      const dz = enemy.z - target.z;
      const distance = Math.max(0.01, Math.hypot(dx, dz));
      const offset = Math.min(distance, targetName === 'tissue' ? 1.3 : 0.44);
      enemy.attackPoint.x += dx * offset / distance;
      enemy.attackPoint.z += dz * offset / distance;
    }
    this.setEnemyAction(enemy, enemy.type + '-windup');
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
      const objective = target === 'player' ? this.player : this.objective;
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

