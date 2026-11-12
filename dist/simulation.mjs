export const OBJECTIVE = Object.freeze({ x: 0, y: 1.25, z: -8 });

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
  bacillus: { radius: 1.12, y: 1.13, health: 68, speed: 1.32, suitDamage: 14, tissueDamage: 9, period: 1.75, score: 180 },
  spore: { radius: 0.73, y: 2.10, health: 18, speed: 3.28, suitDamage: 7, tissueDamage: 3, period: 0.97, score: 130 },
};

const MISSIONS = [
  { cadence: 1.85, species: ['virus', 'virus', 'virus', 'spore', 'virus', 'virus'] },
  { cadence: 1.44, species: ['virus', 'spore', 'virus', 'bacillus', 'virus', 'spore', 'bacillus', 'virus'] },
  { cadence: 1.12, species: ['spore', 'virus', 'bacillus', 'virus', 'spore', 'spore', 'bacillus', 'virus', 'bacillus', 'spore'] },
  { cadence: 0.90, species: ['virus', 'bacillus', 'spore', 'spore', 'bacillus', 'virus', 'virus', 'bacillus', 'spore', 'bacillus', 'spore', 'virus'] },
  { cadence: 0.72, species: ['bacillus', 'spore', 'virus', 'bacillus', 'spore', 'virus', 'bacillus', 'spore', 'bacillus', 'virus', 'spore', 'bacillus', 'spore', 'bacillus', 'virus'] },
];

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
const INTERMISSION_TIME = 6.5;

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
  constructor() {
    this.reset();
  }

  reset() {
    this.player = {
      x: 0, y: 1.7, z: 18, yaw: 0, pitch: 0,
      health: RULES.health, ammo: RULES.magazine, reserve: RULES.initialReserve,
    };
    this.phase = 'ready';
    this.tissue = RULES.tissue;
    this.wave = 0;
    this.waves = MISSIONS.length;
    this.clock = 0;
    this.score = 0;
    this.kills = 0;
    this.remaining = 0;
    this.repairProgress = 0;
    this.repairing = false;
    this.nearTissue = false;
    this.canRepair = false;
    this.intermission = 0;
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
  }

  beginWave() {
    this.wave += 1;
    this.phase = 'combat';
    this.intermission = 0;
    this.spawnIndex = 0;
    this.spawnCountdown = this.wave === 1 ? 0.8 : 0.65;
    this.remaining = MISSIONS[this.wave - 1].species.length;
    this.events.push({ type: 'wave', wave: this.wave, stage: 'start' });
  }

  clearWave() {
    this.score += 250 * this.wave;
    this.events.push({ type: 'wave', wave: this.wave, stage: 'clear' });
    if (this.wave === this.waves) {
      this.endMission('won');
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
    this.movePlayer(dt, input);
    const repairing = this.updateRepair(dt, input.repair);
    this.updateRifle(dt, input, repairing);

    if (this.phase === 'intermission') {
      this.intermission = Math.max(0, this.intermission - dt);
      if (this.intermission === 0) this.beginWave();
      return;
    }

    const mission = MISSIONS[this.wave - 1];
    this.spawnCountdown -= dt;
    if (this.spawnIndex < mission.species.length && this.spawnCountdown <= 0) {
      this.spawn(mission.species[this.spawnIndex]);
      this.spawnCountdown += mission.cadence;
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
    confineToChamber(player);
  }

  updateRepair(dt, held) {
    const distance = Math.hypot(this.player.x - OBJECTIVE.x, this.player.z - OBJECTIVE.z);
    this.nearTissue = distance <= RULES.repairRadius;
    this.canRepair = this.nearTissue && this.tissue < RULES.tissue;

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
      const amount = Math.min(REPAIR_PER_CYCLE, RULES.tissue - this.tissue);
      this.tissue += amount;
      this.score += amount * 8;
      this.repairProgress -= 1;
      this.canRepair = this.tissue < RULES.tissue;
      this.events.push({ type: 'repair', amount, ...OBJECTIVE });
    }
    return true;
  }

  updateRifle(dt, input, repairing) {
    const { player } = this;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.reloading > 0) {
      this.reloading = Math.max(0, this.reloading - dt);
      if (this.reloading === 0) {
        const rounds = Math.min(RULES.magazine - player.ammo, player.reserve);
        player.ammo += rounds;
        player.reserve -= rounds;
        this.events.push({ type: 'reload', stage: 'complete' });
      }
    }

    const reloadPressed = input.reload && !this.reloadHeld;
    this.reloadHeld = Boolean(input.reload);
    if (repairing || this.reloading > 0) return;
    if (reloadPressed || (input.fire && player.ammo === 0)) {
      if (player.ammo < RULES.magazine && player.reserve > 0) {
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

    this.events.push({
      type: 'shot', hit: Boolean(target), crit: critical,
      x: player.x + dx * distance, y: player.y + dy * distance, z: player.z + dz * distance,
    });
    if (!target) return;

    const damage = critical ? 42 : 23;
    target.health -= damage;
    this.events.push({ type: 'hit', id: target.id, damage, crit: critical });
    if (target.health > 0) return;

    this.enemies.splice(this.enemies.indexOf(target), 1);
    this.kills += 1;
    this.score += SPECIES[target.type].score + (critical ? 35 : 0);
    this.events.push({
      type: 'kill', id: target.id, enemyType: target.type, x: target.x, y: target.y, z: target.z,
    });
  }

  spawn(type) {
    const index = this.spawnIndex++;
    const entranceCount = Math.min(ENTRANCES.length, 5 + this.wave);
    const [x, z] = ENTRANCES[index % entranceCount];
    const spawnX = index === 0 ? x : x + Math.sin(index * 2.4 + this.wave) * 1.35;
    const spawnZ = z + Math.cos(index * 1.9 + this.wave) * 0.85;
    const spec = SPECIES[type];
    this.enemies.push({
      id: this.nextEnemyId++,
      type, x: spawnX, y: spec.y, z: spawnZ,
      radius: spec.radius,
      health: spec.health,
      maxHealth: spec.health,
      attackCooldown: 0.65,
    });
  }

  advanceEnemies(dt) {
    const { player } = this;
    for (const enemy of this.enemies) {
      const spec = SPECIES[enemy.type];
      const distanceToSuit = Math.hypot(player.x - enemy.x, player.z - enemy.z);
      const distanceToTissue = Math.hypot(OBJECTIVE.x - enemy.x, OBJECTIVE.z - enemy.z);
      const aggro = enemy.type === 'spore' ? 12 : 7.4;
      const attacksSuit = distanceToSuit < aggro && distanceToSuit < distanceToTissue + 0.6;
      const target = attacksSuit ? player : OBJECTIVE;
      const distance = attacksSuit ? distanceToSuit : distanceToTissue;
      const range = enemy.radius + (attacksSuit ? 0.75 : 1.25);
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      if (distance > range + 0.04) {
        const weave = enemy.type === 'bacillus' ? 0.10 : 0.30;
        const heading = Math.atan2(target.z - enemy.z, target.x - enemy.x);
        const course = heading + Math.sin(this.clock * 2.2 + enemy.id * 2.9) * weave * Math.min(1, distance / 4);
        const travel = Math.min(distance - range, (spec.speed + (this.wave - 1) * 0.13) * dt);
        enemy.x += Math.cos(course) * travel;
        enemy.z += Math.sin(course) * travel;
      } else if (enemy.attackCooldown === 0) {
        enemy.attackCooldown = spec.period;
        const amount = attacksSuit ? spec.suitDamage : spec.tissueDamage;
        if (attacksSuit) {
          player.health = Math.max(0, player.health - amount);
        } else {
          this.tissue = Math.max(0, this.tissue - amount);
        }
        this.events.push({
          type: 'damage', target: attacksSuit ? 'player' : 'tissue', amount,
          id: enemy.id, x: enemy.x, y: enemy.y, z: enemy.z,
        });
      }

      const hover = enemy.type === 'bacillus' ? 0.08 : 0.24;
      enemy.y = spec.y + Math.sin(this.clock * 3.2 + enemy.id * 1.7) * hover;
    }
  }
}

