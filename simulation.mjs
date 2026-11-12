export const OBJECTIVE = Object.freeze({ x: 0, y: 1.25, z: -8 });
export const JUNCTION_INLETS = Object.freeze({
  left: Object.freeze({ x: -12.3, y: 1.42, z: -15.6 }),
  right: Object.freeze({ x: 12.3, y: 1.42, z: -15.6 }),
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
  virus: { radius: 0.92, y: 1.63, health: 34, speed: 2.05, suitDamage: 9, tissueDamage: 5, period: 1.22, score: 100 },
  bacillus: { radius: 1.12, y: 1.13, health: 68, speed: 1.32, tissueDamage: 9, period: 1.75, score: 180 },
  spore: { radius: 0.73, y: 2.10, health: 18, speed: 3.28, suitDamage: 7, tissueDamage: 3, period: 0.97, score: 130 },
  colony: { radius: 1.10, y: 3.35, health: 1100, tissueDamage: 11, period: 1.57, score: 900 },
};

const MISSIONS = [
  { cadence: 1.85, species: ['virus', 'virus', 'virus', 'spore', 'virus', 'virus'] },
  { cadence: 1.44, species: ['virus', 'spore', 'virus', 'bacillus', 'virus', 'spore', 'bacillus', 'virus'] },
  { cadence: 1.12, species: ['spore', 'virus', 'bacillus', 'virus', 'spore', 'spore', 'bacillus', 'virus', 'bacillus', 'spore'] },
  { cadence: 0.90, species: ['virus', 'bacillus', 'spore', 'spore', 'bacillus', 'virus', 'virus', 'bacillus', 'spore', 'bacillus', 'spore', 'virus'] },
  { cadence: 0.72, species: ['bacillus', 'spore', 'virus', 'bacillus', 'spore', 'virus', 'bacillus', 'spore', 'bacillus', 'virus', 'spore', 'bacillus', 'spore', 'bacillus', 'virus'] },
];

const JUNCTION_MISSIONS = [{
  species: ['virus', 'spore', 'bacillus', 'virus', 'virus', 'spore', 'bacillus', 'spore', 'virus', 'spore', 'virus', 'virus'],
  branches: ['left', 'left', 'right', 'right', 'left', 'left', 'left', 'right', 'right', 'right', 'left', 'right'],
  // Stagger the fast attackers so they arrive from the opposite inlet as a bacillus attaches.
  delays: [.62, .83, .90, 2.30, 4.15, .55, 2.55, 1.10, 3.65, .70, .75],
}];

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
const JUNCTION_REPAIR_TIME = 9;
const JUNCTION_EXTRACT_DELAY = 1.25;
const LATCH_RANGE = 1.9;
const LATCH_WINDUP = 0.45;

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

  reset() {
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
    this.nearTissue = false;
    this.canRepair = false;
    this.intermission = 0;
    this.settling = false;
    this.reloading = 0;
    this.fireCooldown = 0;
    this.reloadHeld = false;
    this.spawnIndex = 0;
    this.spawnCountdown = 0;
    this.nextEnemyId = 1;
    this.enemies = [];
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
    this.events.push({ type: 'wave', wave: this.wave, stage: 'start' });
  }

  clearWave() {
    this.score += 250 * this.wave;
    this.events.push({ type: 'wave', wave: this.wave, stage: 'clear' });
    if (this.wave === this.waves) {
      if (this.area === 'junction' && this.tissue < RULES.tissue) {
        this.settling = true;
        this.phase = 'intermission';
        this.intermission = JUNCTION_REPAIR_TIME;
      } else {
        this.endMission('won');
      }
      return;
    }
    this.phase = 'intermission';
    this.intermission = INTERMISSION_TIME;
    this.player.reserve = Math.min(RULES.reserveCap, this.player.reserve + 55);
    this.player.health = Math.min(RULES.health, this.player.health + 18);
  }

  endMission(outcome, reason) {
    this.phase = outcome;
    this.events.push({ type: 'mission', outcome, reason });
  }

  step(dt, input = {}) {
    this.events = [];
    if (this.phase !== 'combat' && this.phase !== 'intermission') return;
    dt = clamp(dt, 0, 0.1);
    this.clock += dt;
    if (this.valve) {
      this.updateValve();
      this.advanceColony(dt);
      if (this.phase === 'lost') return;
    }
    this.movePlayer(dt, input);
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
      if (this.settling && this.tissue === RULES.tissue) {
        this.intermission = Math.min(this.intermission, JUNCTION_EXTRACT_DELAY);
      }
      this.intermission = Math.max(0, this.intermission - dt);
      if (this.intermission === 0) {
        if (this.settling) this.endMission('won');
        else this.beginWave();
      }
      return;
    }

    const mission = this.missions[this.wave - 1];
    this.spawnCountdown -= dt;
    if (this.spawnIndex < mission.species.length && this.spawnCountdown <= 0) {
      this.spawn(mission.species[this.spawnIndex]);
      this.spawnCountdown += mission.delays?.[this.spawnIndex - 1] ?? mission.cadence ?? 0;
    }
    this.advanceEnemies(dt);
    this.remaining = mission.species.length - this.spawnIndex + this.enemies.length;

    if (this.tissue === 0) {
      this.endMission('lost', 'tissue');
    } else if (this.player.health === 0) {
      this.endMission('lost', 'suit');
    } else if (this.remaining === 0) {
      this.clearWave();
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
    const mayRepair = this.valve ? this.valve.phase === 'closed' : !this.tutorial || this.tutorial === 'repair';
    this.canRepair = mayRepair && this.nearTissue && this.tissue < RULES.tissue;

    const active = Boolean(held && this.canRepair);
    if (active !== this.repairing) {
      this.repairing = active;
      this.events.push({ type: active ? 'repairStart' : 'repairStop' });
    }
    if (!active) {
      this.repairProgress = 0;
      return false;
    }

    this.repairProgress += dt / REPAIR_TIME;
    if (this.repairProgress >= 1) {
      const amount = Math.min(this.repairAmount, RULES.tissue - this.tissue);
      this.tissue += amount;
      if (!this.tutorial) this.score += amount * 8;
      this.repairProgress -= 1;
      this.canRepair = this.tissue < RULES.tissue;
      this.events.push({ type: 'repair', amount, complete: this.tissue === RULES.tissue, ...this.objective });
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
    if (this.area === 'junction') {
      branch = this.missions[this.wave - 1].branches[index];
      spawnX = Math.sign(JUNCTION_INLETS[branch].x) * (15.25 + Math.sin(index * 1.7) * .47);
      spawnZ = -18.5 + Math.cos(index * 2.2) * .47;
    }
    const enemy = this.createEnemy(type, spawnX, spawnZ);
    if (branch) {
      enemy.branch = branch;
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
    };
  }

  advanceBacillus(enemy, dt, spec) {
    if (!enemy.latched) {
      const dx = this.objective.x - enemy.x;
      const dz = this.objective.z - enemy.z;
      const distance = Math.hypot(dx, dz);
      const speed = enemy.tutorial ? 2.7 : spec.speed + (this.wave - 1) * 0.13;
      const travel = Math.min(Math.max(0, distance - LATCH_RANGE), speed * dt);
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
      enemy.y = this.objective.y + 0.13;
      enemy.attackCooldown = LATCH_WINDUP;
      return;
    }

    if (enemy.tutorial && this.tutorial !== 'observe') return;
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
    if (enemy.attackCooldown > 0) return;
    enemy.attackCooldown = spec.period;
    this.damageTarget(enemy, 'tissue', enemy.tutorial ? REPAIR_PER_CYCLE : spec.tissueDamage);
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
    this.events.push(impact);
  }

  advanceEnemies(dt) {
    const { player } = this;
    for (const enemy of this.enemies) {
      const spec = SPECIES[enemy.type];
      if (enemy.type === 'bacillus') {
        this.advanceBacillus(enemy, dt, spec);
        continue;
      }
      const distanceToSuit = Math.hypot(player.x - enemy.x, player.z - enemy.z);
      const distanceToTissue = Math.hypot(this.objective.x - enemy.x, this.objective.z - enemy.z);
      const aggro = enemy.type === 'spore' ? 12 : 7.4;
      const attacksSuit = distanceToSuit < aggro && distanceToSuit < distanceToTissue + 0.6;
      const target = attacksSuit ? player : this.objective;
      const distance = attacksSuit ? distanceToSuit : distanceToTissue;
      const range = enemy.radius + (attacksSuit ? 0.75 : 1.25);
      enemy.attackingTissue = !attacksSuit && distance <= range + 0.04;
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      if (distance > range + 0.04) {
        const heading = Math.atan2(target.z - enemy.z, target.x - enemy.x);
        const course = heading + Math.sin(this.clock * 2.2 + enemy.id * 2.9) * 0.30 * Math.min(1, distance / 4);
        const travel = Math.min(distance - range, (spec.speed + (this.wave - 1) * 0.13) * dt);
        enemy.x += Math.cos(course) * travel;
        enemy.z += Math.sin(course) * travel;
      } else if (enemy.attackCooldown === 0) {
        enemy.attackCooldown = spec.period;
        this.damageTarget(enemy, attacksSuit ? 'player' : 'tissue', attacksSuit ? spec.suitDamage : spec.tissueDamage);
      }

      enemy.y = spec.y + Math.sin(this.clock * 3.2 + enemy.id * 1.7) * 0.24;
    }
  }
}

