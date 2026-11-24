import { AI_CONFIG, AI_DIFFICULTY, AI_PROFILES, SPECIES_AI } from './ai-profiles.mjs';
import { NavigationSystem, clearSegment } from './ai-navigation.mjs';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const playerKey = player => 'player:' + (player.id ?? 'solo');
const point = p => ({ x: p.x, y: p.y ?? 1.7, z: p.z });
const majorBossAttacks = new Set(['charge', 'slam', 'eruption', 'pull', 'pulse']);
const ordinary = e => !e.boss && !e.segmentOf && !e.nest && !e.tutorial && e.type !== 'colony';

export class EnemyMemory {
  constructor(seconds = 6) { this.seconds = seconds; this.targets = new Map(); this.allies = []; this.failures = []; }
  observe(key, position, now, { kind = 'player', source = 'sight', confidence = 1, visible = false, health = 100 } = {}) {
    const previous = this.targets.get(key);
    const elapsed = previous ? now - previous.seenAt : 0;
    const velocity = previous && elapsed > .05 && source === 'sight' && previous.source === 'sight'
      ? { x: clamp((position.x - previous.x) / elapsed, -12, 12), z: clamp((position.z - previous.z) / elapsed, -12, 12) }
      : { x: 0, z: 0 };
    const record = { ...point(position), key, kind, source, confidence, visible, health, seenAt: now,
      acquiredAt: previous?.acquiredAt ?? now, velocity };
    this.targets.set(key, record);
    return record;
  }
  decay(now) {
    for (const [key, record] of this.targets) if (now - record.seenAt > this.seconds) this.targets.delete(key);
    this.failures = this.failures.filter(f => now - f.time < 8);
  }
  fail(reason, now) { this.failures.push({ reason, time: now }); if (this.failures.length > 8) this.failures.shift(); }
  clear() { this.targets.clear(); this.allies.length = 0; this.failures.length = 0; }
}

export class EncounterDirector {
  constructor(world) {
    this.world = world; this.next = 0; this.intensity = 0; this.recentDamage = 0;
    this.lastMajorEvent = 0; this.deaths = 0; this.active = 0; this.composition = {};
    this.pressure = new Map(); this.nextAttack = 0; this.limit = 4; this.tissueLimit = 3;
  }
  update(dt) {
    const { sim, config, difficulty } = this.world, now = sim.clock;
    this.recentDamage = Math.max(0, this.recentDamage - dt * 3);
    for (const [id, slot] of this.pressure) if (slot.until <= now || !sim.enemies.some(e => e.id === id)) this.pressure.delete(id);
    if (now < this.next) return;
    this.next = now + config.directorInterval;
    const suits = this.world.players;
    const health = suits.length ? Math.min(...suits.map(p => p.health)) : 0;
    const tissue = Math.min(...sim.nodes.map(n => n.health));
    const relief = health < 30 || tissue < 22 || this.recentDamage > 18;
    // Health and damage are never changed here. Only attack opportunities are paced.
    this.limit = Math.min(config.maxPressure, Math.max(2, difficulty.pressure - Number(relief)));
    this.tissueLimit = Math.min(config.maxTissuePressure, tissue < 22 ? 2 : 5);
    this.active = sim.enemies.length;
    this.composition = {};
    for (const enemy of sim.enemies) this.composition[enemy.type] = (this.composition[enemy.type] ?? 0) + 1;
    this.intensity = clamp(this.pressure.size / Math.max(1, this.limit) * .65 + this.recentDamage / 50);
    this.aggression = relief ? .72 : 1;
  }
  acquire(enemy, target, duration = 1.5) {
    const now = this.world.sim.clock;
    if (this.pressure.has(enemy.id)) return true;
    let scripted = 0;
    for (const e of this.world.sim.enemies) {
      if (!(e.boss || e.type === 'colony') || e.health <= 0) continue;
      const active = (e.boss === 'thrombus' && e.state === 'charge') || (e.boss === 'macrophage' && e.state === 'pull');
      scripted += active || (e.telegraph?.remaining > 0 && majorBossAttacks.has(e.telegraph.kind)) ? 2 : 1;
    }
    const brain = this.world.sim.boss;
    if (brain && brain.state !== 'defeated') scripted += brain.state === 'warning' ? 2 : 1;
    const tissue = [...this.pressure.values()].filter(s => s.target === 'tissue').length;
    if (now < this.nextAttack || this.pressure.size + Math.min(2, scripted) >= this.limit ||
        (target === 'tissue' && tissue >= this.tissueLimit)) return false;
    this.pressure.set(enemy.id, { target, until: now + duration });
    this.nextAttack = now + (this.aggression < 1 ? .25 : .12);
    this.lastMajorEvent = now;
    return true;
  }
  release(id) { this.pressure.delete(id); }
}

export class SquadCoordinator {
  constructor(world) { this.world = world; this.next = 0; this.reservations = new Map(); }
  update() {
    const world = this.world, now = world.sim.clock;
    for (const [id, reservation] of this.reservations) if (reservation.until < now || !world.controllers.has(id)) this.reservations.delete(id);
    if (now < this.next) return;
    this.next = now + world.config.squadInterval;
    for (const c of world.controllers.values()) {
      const allies = world.nearby(c.enemy, 19).filter(e => e.id !== c.enemy.id &&
        world.controllers.get(e.id)?.profile.family === c.profile.family);
      c.memory.allies = allies.map(e => e.id);
      const group = [c.enemy, ...allies].sort((a, b) => a.id - b.id);
      const rank = group.findIndex(e => e.id === c.enemy.id);
      c.slot = rank;
      const previousRole = c.role;
      c.role = c.enemy.behavior === 'bacillus' ? (c.enemy.type === 'guard' ? 'defender' : rank % 3 === 2 ? 'flanker' : 'objective')
        : rank % 3 === 0 ? 'objective' : c.enemy.behavior === 'spore' ? 'suppressor'
        : rank % 3 === 1 ? 'aggressor' : 'flanker';
      if (c.enemy.encounterOrder?.until > now) c.role = c.enemy.encounterOrder.role;
      if (c.profile.tissuePriority === 0) c.role = 'aggressor';
      if (previousRole !== c.role) c.nextDecision = now;
      // A spatially nearby colony shares an old observation, never a live player reference.
      if (c.profile.teamwork * world.difficulty.teamwork < .4) continue;
      for (const ally of allies) {
        const other = world.controllers.get(ally.id);
        for (const [key, record] of other.memory.targets) {
          if (record.kind !== 'player' || !record.visible || now - record.seenAt > .5 || c.memory.targets.has(key)) continue;
          c.memory.observe(key, record, record.seenAt, { source: 'ally', confidence: .5, health: record.health });
        }
      }
    }
  }
  reserve(c, desired) {
    const nav = this.world.navigation, now = this.world.sim.clock;
    let candidate = nav.project(desired);
    for (let i = 0; i < 8; i++) {
      let occupied = false;
      for (const [id, spot] of this.reservations) if (id !== c.enemy.id && spot.until > now && distance(candidate, spot) < 2) { occupied = true; break; }
      if (!occupied) break;
      const angle = c.enemy.id * 2.39996 + i * .8;
      candidate = nav.project({ x: desired.x + Math.sin(angle) * (2.4 + i), z: desired.z + Math.cos(angle) * (2.4 + i) });
    }
    this.reservations.set(c.enemy.id, { ...candidate, until: now + 1.2 });
    return candidate;
  }
}

export class EnemyAIController {
  constructor(world, enemy) {
    this.world = world; this.enemy = enemy;
    this.profile = AI_PROFILES[SPECIES_AI[enemy.type] ?? 'swarm'];
    this.memory = new EnemyMemory(world.config.memorySeconds);
    this.home = point(enemy.node);
    this.action = this.profile.tissuePriority > 0 ? 'objective' : 'patrol';
    this.reason = this.profile.tissuePriority > 0 ? 'Spawn tissue signal' : 'Search patrol'; this.scores = {};
    this.changedAt = world.sim.clock; this.nextSense = world.sim.clock + (enemy.id * .037 % .15);
    this.nextDecision = world.sim.clock + (enemy.id * .071 % .32);
    this.role = enemy.behavior === 'bacillus' ? 'objective' : 'aggressor'; this.slot = enemy.id % 3;
    if (enemy.encounterOrder?.until > world.sim.clock) this.role = enemy.encounterOrder.role;
    this.targetKey = this.profile.tissuePriority > 0 ? 'node:' + enemy.nodeId : null;
    this.target = point(this.profile.tissuePriority > 0 ? enemy.node : enemy); this.visible = false;
    this.destination = point(this.profile.tissuePriority > 0 ? enemy.attackAnchor ?? enemy.node : enemy); this.path = []; this.pathGoal = null;
    this.nextPath = 0; this.pathIndex = 0; this.stuck = 0; this.lastMove = point(enemy); this.cooldowns = {};
    this.lastDamage = -Infinity; this.heardSequence = 0; this.alertUntil = 0; this.dangerUntil = 0;
    this.coverCandidates = []; this.disposed = false;
    if (this.profile.tissuePriority > 0) this.memory.observe(this.targetKey, enemy.node, world.sim.clock, { kind: 'node', source: 'spawn-signal', health: enemy.node.health });
  }
  perceive() {
    const world = this.world, now = world.sim.clock, enemy = this.enemy, p = this.profile;
    this.memory.decay(now);
    for (const record of this.memory.targets.values()) record.visible = false;
    for (const target of world.players) {
      const d = distance(enemy, target), key = playerKey(target);
      const dx = target.x - enemy.x, dz = target.z - enemy.z;
      const inCone = d < p.biologicalRange || this.alertUntil > now || (dx * Math.sin(enemy.heading) + dz * Math.cos(enemy.heading)) / Math.max(.001, d) > Math.cos(p.fov / 2);
      if (d > p.sight * p.awareness || !inCone || !world.sight(enemy, target)) continue;
      const record = this.memory.observe(key, target, now, { visible: true, health: target.health });
      // Far targets take longer to acquire. Damage/hearing can alert, but never bypass LOS.
      record.visible = now - record.acquiredAt >= p.reaction * world.difficulty.reaction * (.65 + d / p.sight);
      if (record.visible && p.evasion >= .2 && (enemy.dodgeRest ?? 0) <= 0 && !(enemy.dodge > 0) && d > 2) {
        const bearing = Math.atan2(-dx, -dz);
        const angle = Math.abs(Math.atan2(Math.sin(bearing - target.yaw), Math.cos(bearing - target.yaw)));
        if (angle < .07 + enemy.radius / d && world.random() < p.evasion) {
          enemy.dodge = .42; enemy.dodgeRest = 2.1;
          this.dangerUntil = now + .42; this.nextDecision = now;
        }
      }
    }
    for (const node of this.profile.tissuePriority > 0 ? world.sim.nodes : []) {
      if (node.health <= 0) { this.memory.targets.delete('node:' + node.id); continue; }
      if (node.id === enemy.nodeId || (distance(enemy, node) <= p.sight && world.sight(enemy, node))) {
        this.memory.observe('node:' + node.id, node, now, { kind: 'node', source: 'tissue-signal', health: node.health });
      }
    }
    for (const noise of world.noises) {
      if (noise.sequence <= this.heardSequence || noise.owner === enemy.id || now - noise.time > 1.2) continue;
      if (distance(enemy, noise) > Math.min(noise.radius, p.hearing)) continue;
      this.alertUntil = now + 3;
      if (noise.kind === 'explosion') this.dangerUntil = now + .65;
      if (noise.key?.startsWith('player:') && !this.memory.targets.get(noise.key)?.visible) {
        // Hearing is deliberately imprecise and does not overwrite a fresher sighting.
        const old = this.memory.targets.get(noise.key);
        if (!old || now - old.seenAt > .6) {
          const angle = enemy.id * 2.39996 + noise.sequence;
          this.memory.observe(noise.key, { x: noise.x + Math.cos(angle) * 2.5, z: noise.z + Math.sin(angle) * 2.5 }, noise.time,
            { source: 'sound', confidence: .45 });
        }
      }
    }
    this.heardSequence = world.noiseSequence;
    // Incoming rockets are visible disturbances; evasion is a configured biological reflex.
    if (p.evasion > .4) for (const rocket of world.sim.rockets) {
      if (distance(enemy, rocket) < 7 && world.sight(enemy, rocket)) this.dangerUntil = now + .4;
    }
  }
  decide() {
    const { world, enemy, profile: p } = this, now = world.sim.clock;
    let node = p.tissuePriority > 0 && enemy.node?.health > 0 ? enemy.node : null, nodeValue = -Infinity;
    const locked = !!(enemy.attackAnchor || enemy.branch || world.sim.valve || enemy.fragment || enemy.latched || enemy.action !== 'idle' || world.director.pressure.has(enemy.id) || enemy.encounterOrder?.until > now);
    for (const record of this.memory.targets.values()) {
      if (record.kind !== 'node' || locked || p.tissuePriority === 0) continue;
      const candidate = world.sim.nodes.find(n => 'node:' + n.id === record.key && n.health > 0);
      if (!candidate) continue;
      const value = (100 - record.health) * .009 - distance(enemy, record) * .008 + (candidate === enemy.node ? .15 : 0);
      if (value > nodeValue) { nodeValue = value; node = candidate; }
    }
    if (node) { enemy.node = node; enemy.nodeId = node.id; }
    let threat = null, threatScore = -Infinity;
    for (const record of this.memory.targets.values()) {
      if (record.kind !== 'player') continue;
      const player = world.playerFor(record.key);
      if (!player || player.health <= 0) { this.memory.targets.delete(record.key); continue; }
      const score = (record.visible ? 1.4 : .3) + record.confidence * .4 - distance(enemy, record) * .025 - (now - record.seenAt) * .08;
      if (score > threatScore) { threatScore = score; threat = record; }
    }
    const low = 1 - enemy.health / enemy.maxHealth, hurt = now - this.lastDamage < 2;
    const canPlayer = p.playerPriority > 0 && threat;
    const visible = !!threat?.visible;
    const d = threat ? distance(enemy, threat) : Infinity;
    const hasAllies = this.memory.allies.length > 0;
    const scores = {
      idle: .05,
      patrol: !threat ? .35 : -Infinity,
      objective: node ? .6 * p.tissuePriority + (this.role === 'objective' ? .28 : 0) + (100 - node.health) * .002 : -Infinity,
      pursue: canPlayer && visible ? (.6 + p.aggression * .3 + (this.role === 'aggressor' ? .2 : 0) + .55 * clamp(1 - d / 15) - d * .009) * (world.director.aggression ?? 1) : -Infinity,
      investigate: canPlayer && !visible && now - threat.seenAt < world.config.memorySeconds ? 1.12 - (now - threat.seenAt) * .045 : -Infinity,
      flank: hasAllies && ((canPlayer && visible && d > 6) || (enemy.behavior === 'bacillus' && node && !locked && distance(enemy, node) > 9 && this.role === 'flanker')) ? .63 + p.sophistication * .2 + (this.role === 'flanker' ? .36 : 0) : -Infinity,
      strafe: canPlayer && visible && d < p.preferredDistance + 3 ? .85 + p.sophistication * .15 : -Infinity,
      retreat: threat && (low > .55 || d < p.preferredDistance * .5) ? (d < p.preferredDistance * .5 ? 1.7 : .7) + low * (1 - p.courage) + (hurt ? .22 : 0) : -Infinity,
      cover: threat && low > .5 && hurt && world.sim.obstacles.length ? 1.05 + low * (1 - p.courage) : -Infinity,
      evade: this.dangerUntil > now && p.evasion >= .2 ? 2 + p.evasion : -Infinity,
      regroup: hurt && low > .55 && hasAllies && !threat ? 1.1 + low * .5 : -Infinity,
      protect: node && visible && this.role === 'defender' && this.memory.allies.some(id => {
        const ally = world.entities.get(id); return ally && ally.health / ally.maxHealth < .5;
      }) ? 1.8 : -Infinity,
    };
    let action = 'idle', best = -Infinity;
    for (const name of p.actions) {
      const score = (this.cooldowns[name] ?? 0) > now ? -Infinity : scores[name];
      if (score > best) { best = score; action = name; }
    }
    this.scores = Object.fromEntries(p.actions.map(name => [name, (this.cooldowns[name] ?? 0) > now ? -Infinity : scores[name]]));
    const urgent = action === 'evade' || !node || (this.visible && !visible) || (low > .8 && hurt);
    if (action !== this.action && !urgent && (this.cooldowns[this.action] ?? 0) <= now && Number.isFinite(scores[this.action]) &&
        (now - this.changedAt < p.commitment || best < scores[this.action] + .12)) action = this.action;
    if (action !== this.action) {
      this.reason = action === 'evade' ? 'Incoming disturbance' : action === 'retreat' || action === 'cover' ? 'Survival / incoming damage'
        : action === 'objective' ? 'Tissue priority / squad order' : action === 'investigate' ? 'Target lost; remembered observation' : 'Higher tactical utility';
      this.action = action; this.changedAt = now;
    }
    this.visible = visible;
    const targetsPlayer = ['pursue', 'flank', 'strafe', 'investigate', 'evade', 'retreat', 'cover', 'regroup'].includes(action) && threat && (p.playerPriority > 0 || ['retreat', 'cover', 'evade', 'regroup'].includes(action));
    this.targetKey = targetsPlayer ? threat.key : node ? 'node:' + node.id : null;
    this.target = targetsPlayer ? point(threat) : node ? point(enemy.attackAnchor ?? node) : point(enemy);
    this.chooseDestination(threat);
    enemy.tactical = { archetype: SPECIES_AI[enemy.type], action, target: this.targetKey, visible: this.visible, role: this.role };
  }
  chooseDestination(threat) {
    const { enemy, world, profile: p, action } = this, now = world.sim.clock;
    let desired = point(this.target);
    const dx = enemy.x - this.target.x, dz = enemy.z - this.target.z, d = Math.max(.01, Math.hypot(dx, dz));
    if (action === 'patrol') {
      const angle = enemy.id * 2.39996 + Math.floor(now / 14) * 1.4;
      desired = world.navigation.project({ x: Math.sin(angle) * 27, z: Math.cos(angle) * 36 });
    } else if (['retreat', 'evade'].includes(action)) {
      const angle = action === 'evade' ? Math.atan2(dx, dz) + (enemy.id % 2 ? 1 : -1) * 1.2 : Math.atan2(dx, dz);
      desired = { x: enemy.x + Math.sin(angle) * 6, z: enemy.z + Math.cos(angle) * 6 };
    } else if (action === 'cover' && threat) {
      this.coverCandidates = [];
      let value = Infinity;
      for (const [x, z, radius] of world.sim.obstacles) {
        const length = Math.max(.01, Math.hypot(x - threat.x, z - threat.z));
        const cover = world.navigation.project({ x: x + (x - threat.x) / length * (radius + 1.5), z: z + (z - threat.z) / length * (radius + 1.5) });
        if (clearSegment(world.sim.obstacles, threat, cover)) continue;
        this.coverCandidates.push(cover);
        if (distance(enemy, cover) < value && (p.family !== 'mutated' || distance(this.home, cover) < p.territory)) { desired = cover; value = distance(enemy, cover); }
      }
    } else if (action === 'protect' && threat) {
      const ally = this.memory.allies.map(id => world.entities.get(id)).filter(Boolean)
        .sort((a, b) => a.health / a.maxHealth - b.health / b.maxHealth)[0];
      if (ally) {
        const length = Math.max(.01, distance(ally, threat));
        desired = { x: ally.x + (threat.x - ally.x) / length * 2, z: ally.z + (threat.z - ally.z) / length * 2 };
      }
    } else if (action === 'regroup' && this.memory.allies.length) {
      const ally = world.entities.get(this.memory.allies[0]);
      if (ally) desired = { x: ally.x + dx / d * 3, z: ally.z + dz / d * 3 };
    } else if (['flank', 'strafe'].includes(action)) {
      const angle = Math.atan2(dx, dz) + (enemy.id % 2 ? 1 : -1) * (action === 'flank' ? .95 : .38);
      const radius = action === 'flank' ? Math.max(p.preferredDistance + 2, d * .65) : p.preferredDistance;
      desired = { x: this.target.x + Math.sin(angle) * radius, z: this.target.z + Math.cos(angle) * radius };
    } else if (action === 'pursue' && d < p.preferredDistance && enemy.behavior === 'spore') {
      desired = { x: this.target.x + dx / d * p.preferredDistance, z: this.target.z + dz / d * p.preferredDistance };
    } else if (action === 'objective' && d > 5) {
      const angle = enemy.id * 2.39996;
      desired.x += Math.sin(angle) * 1.5; desired.z += Math.cos(angle) * 1.5;
    }
    const order = enemy.encounterOrder;
    if (p.family !== 'mutated' && order?.until > now && !order.reached && this.targetKey?.startsWith('node:') && ['objective', 'flank'].includes(action)) {
      if (distance(enemy, order.approach) < 3) order.reached = true;
      else desired = order.approach;
    }
    if (p.family === 'mutated' && distance(this.home, desired) > p.territory) {
      const length = distance(this.home, desired);
      desired = { x: this.home.x + (desired.x - this.home.x) / length * p.territory, z: this.home.z + (desired.z - this.home.z) / length * p.territory };
    }
    this.destination = action === 'objective' && d < 5 ? world.navigation.project(desired) : world.squads.reserve(this, desired);
    if (action === 'cover' && threat && world.navigation.clear(threat, this.destination, 0)) this.destination = world.navigation.project(desired);
    if (action === 'investigate' && distance(enemy, this.target) < 2.5) {
      this.memory.targets.delete(this.targetKey); this.cooldowns.investigate = now + 1.2; this.nextDecision = now;
      this.reason = 'Investigation complete; no target found';
    }
    if (['retreat', 'cover', 'evade', 'regroup'].includes(action) && now - this.changedAt > (action === 'evade' ? .7 : 2.5)) {
      this.cooldowns[action] = now + 3; this.nextDecision = now;
    }
  }
  tick(dt = 0) {
    const { world, enemy } = this, now = world.sim.clock;
    if (enemy.dodge > 0) enemy.dodge = Math.max(0, enemy.dodge - dt);
    else if (enemy.dodgeRest > 0) enemy.dodgeRest = Math.max(0, enemy.dodgeRest - dt);
    const far = !world.players.some(p => distance(enemy, p) < 42) && distance(enemy, enemy.node) > 30;
    if (now >= this.nextSense) { this.perceive(); this.nextSense = now + world.config.perceptionInterval * (far ? 3 : 1); }
    if (now >= this.nextDecision) {
      this.nextDecision = now + this.profile.decisionInterval * (world.config.decisionInterval / AI_CONFIG.decisionInterval) * world.difficulty.decision * (far ? 2 : 1);
      this.decide();
    }
  }
  move(dt, speed, stopDistance = 0) {
    const { enemy, world } = this, now = world.sim.clock;
    // Crawlers walk the floor, so raised ground is as solid to them as a clot.
    // Crawlers go round raised ground, except to climb it after a suit standing up there (or to
    // walk back down off it).
    const climbing = enemy.type === 'crawler' && (world.sim.groundUnder?.(enemy) > .05 ||
      (world.players.find(player => playerKey(player) === this.targetKey)?.feet ?? 0) > .3);
    const nav = enemy.type === 'crawler' && !climbing ? world.groundNavigation : world.navigation;
    if (this.profile.family !== 'mutated' && enemy.encounterOrder?.until > now && !enemy.encounterOrder.reached &&
        this.targetKey?.startsWith('node:') && ['objective', 'flank'].includes(this.action)) stopDistance = 0;
    if (!this.destination || this.action === 'idle' || (this.blockedUntil ?? 0) > now) return;
    const remaining = distance(enemy, this.destination);
    if (remaining <= stopDistance + .08) { this.stuck = 0; return; }
    const replanning = !this.pathGoal || distance(this.pathGoal, this.destination) > 3 || !this.path.length || this.pathIndex >= this.path.length;
    if (now >= this.nextPath && replanning && world.pathBudget > 0) {
      world.pathBudget--;
      this.nextPath = now + world.config.pathInterval;
      this.pathGoal = point(this.destination);
      this.path = nav.path(enemy, this.destination) ?? [];
      this.pathIndex = 0;
      if (!this.path.length) {
        this.memory.fail('unreachable destination', now); this.blockedUntil = now + 1;
        this.pathGoal = null; this.cooldowns[this.action] = now + 1.5; this.nextDecision = now; return;
      }
    }
    // Never move blindly toward a goal while waiting for the path budget.
    let next = this.path[this.pathIndex];
    if (nav.clear(enemy, this.destination)) next = this.destination;
    else if (next && distance(enemy, next) < .5) next = this.path[++this.pathIndex];
    if (!next) return;
    const dx = next.x - enemy.x, dz = next.z - enemy.z, length = Math.max(.001, Math.hypot(dx, dz));
    const travel = Math.min(speed * dt, length, Math.max(0, remaining - stopDistance));
    let x = dx / length * travel, z = dz / length * travel;
    // A spatial hash keeps local avoidance independent of total scene/model count.
    for (const other of world.nearby(enemy, world.config.separationRadius + 2)) {
      if (other === enemy || other.latched) continue;
      let ax = enemy.x - other.x, az = enemy.z - other.z, d = Math.hypot(ax, az);
      const reach = 1.3 + (other.radius ?? 1) * .5 + enemy.radius * .5;
      if (d >= reach) continue;
      if (d < .001) { ax = Math.sin(enemy.id * 2.4); az = Math.cos(enemy.id * 2.4); d = 1; }
      const push = Math.max(0, 1 - d / reach) * speed * dt * .55;
      x += ax / d * push; z += az / d * push;
    }
    // Steering cannot cross a solid even at a large dt or in a dense crowd.
    const proposed = { x: enemy.x + x, z: enemy.z + z };
    const clearance = enemy.radius * .5;
    if (nav.inside(proposed) && nav.clear(enemy, proposed, clearance)) { enemy.x = proposed.x; enemy.z = proposed.z; }
    else {
      const projected = nav.project(enemy);
      if (nav.inside(projected) && (distance(enemy, projected) < 2 || !nav.clear(enemy, enemy, clearance))) {
        enemy.x = projected.x; enemy.z = projected.z;
      }
    }
    if (distance(this.lastMove, enemy) < speed * dt * .1) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt);
    this.lastMove.x = enemy.x; this.lastMove.z = enemy.z;
    if (this.stuck > 1.2) {
      this.memory.fail('stuck; replanning', now); this.path.length = 0; this.pathGoal = null; this.stuck = 0;
      this.nextPath = now + .2; this.cooldowns[this.action] = now + 1; this.nextDecision = now;
    }
    enemy.heading = Math.atan2(dx, dz);
  }
  attackTarget() {
    if (!this.targetKey) return null;
    if (this.targetKey.startsWith('node:')) return this.enemy.node?.health > 0 ? this.enemy.node : null;
    const record = this.memory.targets.get(this.targetKey);
    // Attacks require a recent direct observation; shared/heard positions only permit investigation.
    return record?.visible && this.world.sim.clock - record.seenAt < .35 ? this.world.playerFor(this.targetKey) : null;
  }
  aim(target, projectileSpeed) {
    const observed = this.memory.targets.get(this.targetKey);
    const aim = point(target);
    if (!projectileSpeed || !observed?.visible || !this.targetKey.startsWith('player:')) return aim;
    const lead = Math.min(.65, distance(this.enemy, target) / projectileSpeed) * this.profile.accuracy * this.world.difficulty.accuracy;
    aim.x += observed.velocity.x * lead; aim.z += observed.velocity.z * lead;
    const error = (1 - Math.min(.9, this.profile.accuracy * this.world.difficulty.accuracy)) * .8;
    aim.x += (this.world.random() - .5) * error; aim.z += (this.world.random() - .5) * error;
    return aim;
  }
  dispose() {
    this.memory.clear(); this.path.length = 0; this.coverCandidates.length = 0;
    this.target = null; this.destination = null; this.enemy = null; this.world = null; this.disposed = true;
  }
}

export class AIWorld {
  // Crawlers walk the floor, so their routes also avoid raised ground. Built on first use: a
  // chamber full of islands makes a large graph, and most missions have no crawlers.
  get groundNavigation() {
    if (!this.groundRoutes) {
      const footprints = this.sim.terrainFootprints ?? [];
      this.groundRoutes = footprints.length ? new NavigationSystem([...this.sim.obstacles, ...footprints], this.sim.area) : this.navigation;
    }
    return this.groundRoutes;
  }

  constructor(sim, options = {}) {
    this.sim = sim; this.config = { ...AI_CONFIG, ...options }; this.seed = options.seed ?? 0x1a11ce;
    this.navigation = new NavigationSystem(sim.obstacles, sim.area);
    this.groundRoutes = null;
    this.controllers = new Map(); this.entities = new Map(); this.cells = new Map(); this.players = [];
    this.noises = []; this.noiseSequence = 0;
    this.director = new EncounterDirector(this); this.squads = new SquadCoordinator(this);
    this.telemetry = { samples: 0, averageMs: 0, peakMs: 0, lastMs: 0, rays: 0, paths: 0 };
    this.debug = false;
  }
  get difficulty() { return AI_DIFFICULTY[this.sim.difficulty] ?? AI_DIFFICULTY.medium; }
  random() { let x = this.seed | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.seed = x >>> 0; return this.seed / 4294967296; }
  emit(kind, position, { key = null, owner = null, radius = 30 } = {}) {
    this.noises.push({ ...point(position), kind, key, owner, radius, time: this.sim.clock, sequence: ++this.noiseSequence });
    if (this.noises.length > this.config.maxEvents) this.noises.shift();
    if (kind === 'death') { this.director.deaths++; this.director.lastMajorEvent = this.sim.clock; }
  }
  damage(enemy, source) {
    const c = this.controllers.get(enemy.id);
    if (!c) return;
    c.lastDamage = this.sim.clock; c.nextSense = this.sim.clock; c.nextDecision = this.sim.clock;
    if (source) c.memory.observe(playerKey(source), source, this.sim.clock, { source: 'damage', confidence: .65 });
  }
  playerFor(key) { return this.players.find(p => playerKey(p) === key && p.health > 0) ?? null; }
  sight(a, b) { if (this.rayBudget <= 0) return false; this.rayBudget--; return clearSegment(this.sim.obstacles, a, b); }
  nearby(entity, radius) {
    const result = [], size = 8;
    for (let x = Math.floor((entity.x - radius) / size); x <= Math.floor((entity.x + radius) / size); x++) {
      for (let z = Math.floor((entity.z - radius) / size); z <= Math.floor((entity.z + radius) / size); z++) {
        for (const other of this.cells.get(x + ':' + z) ?? []) if (distance(entity, other) <= radius) result.push(other);
      }
    }
    return result;
  }
  begin(dt) {
    this.startedAt = performance.now(); this.rayBudget = this.config.sightBudget; this.pathBudget = this.config.pathsPerStep;
    this.players = (this.sim.players ?? [this.sim.player]).filter(p => p.health > 0);
    this.entities.clear(); this.cells.clear();
    for (const enemy of this.sim.enemies) {
      this.entities.set(enemy.id, enemy);
      const key = Math.floor(enemy.x / 8) + ':' + Math.floor(enemy.z / 8);
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key).push(enemy);
      if (ordinary(enemy) && !this.controllers.has(enemy.id)) {
        this.controllers.set(enemy.id, new EnemyAIController(this, enemy)); this.squads.next = 0;
      }
    }
    for (const id of this.controllers.keys()) if (!this.entities.has(id)) this.remove(id);
    this.noises = this.noises.filter(n => this.sim.clock - n.time <= 1.2);
    this.director.update(dt); this.squads.update();
  }
  end() {
    const t = this.telemetry, cost = performance.now() - this.startedAt;
    t.samples++; t.lastMs = cost; t.averageMs += (cost - t.averageMs) / t.samples;
    t.peakMs = Math.max(t.peakMs, cost); t.rays = this.config.sightBudget - this.rayBudget;
    t.paths = this.config.pathsPerStep - this.pathBudget;
  }
  remove(id) {
    const c = this.controllers.get(id); if (c) c.dispose();
    this.controllers.delete(id); this.entities.delete(id); this.director.release(id); this.squads.reservations.delete(id);
    for (const other of this.controllers.values()) other.memory.allies = other.memory.allies.filter(ally => ally !== id);
    for (const [key, entries] of this.cells) { const kept = entries.filter(e => e.id !== id); if (kept.length) this.cells.set(key, kept); else this.cells.delete(key); }
    this.squads.next = 0;
  }
  dispose() {
    for (const c of this.controllers.values()) c.dispose();
    this.controllers.clear(); this.entities.clear(); this.cells.clear(); this.players.length = 0;
    this.noises.length = 0; this.director.pressure.clear(); this.squads.reservations.clear(); this.sim = null;
  }
}
