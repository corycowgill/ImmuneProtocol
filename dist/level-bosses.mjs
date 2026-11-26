import { BOSS_TUNING, bossSuit, moveBoss, telegraph, segmentCircle, moveCharge, chargeReach, canSummon } from './boss-tactics.mjs';
// Level bosses. Each mission ends with its own apex pathogen, which arrives once the final wave's
// roster has finished spawning and must die before the wave can clear. A boss is an ordinary
// enemy record (so shots, rockets, the turret, markers and co-op snapshots all work on it) with
// `boss` set to its id; simulation.mjs hands its turn to stepLevelBoss.
//
// Every boss has one mechanic the squad has to read and answer:
//   Thrombus Titan      artery      armoured until it charges into a wall and stuns itself
//   Capillary Leech     junction    latches a node, drains it to heal, and must be shot off
//   Mold Crown          lungs       hovers out of reach raining spore volleys and seeding spitters
//   Pylori Drill        stomach     burrows out of sight and erupts under a node or a suit
//   Tapeworm            intestines  a chain of segments shielding a head that bites as it circles
//   Biofilm Colossus    colon       regenerates unless pressed, splits as it shrinks, slams nearby suits
//   Rogue Macrophage    lymph       drags a suit in to engulf it and eats pathogens to heal
//   Otolith Screamer    ear         a sonic pulse that only solid cover stops
// The heart's colony and the cortex's Mega Virus were already bosses and keep their own code.

const TAU = Math.PI * 2;

export const LEVEL_BOSSES = Object.freeze({
  artery: { id: 'thrombus', model: 'boss-thrombus', name: 'Thrombus Titan', health: 4200, radius: 2.6, y: 1.7, scale: 3.5, score: 2500,
    hint: 'ARMOURED · BAIT ITS CHARGE INTO A WALL' },
  junction: { id: 'leech', model: 'boss-leech', name: 'Capillary Leech', health: 3200, radius: 1.9, y: 1.5, scale: 3.4, score: 2500,
    hint: 'SHOOT IT OFF THE NODE IT IS DRAINING' },
  lungs: { id: 'bloom', model: 'boss-bloom', name: 'Mold Crown', health: 3000, radius: 2.4, y: 6.5, scale: 3.0, score: 2500,
    hint: 'IT HOVERS · KEEP MOVING UNDER THE VOLLEYS' },
  stomach: { id: 'drill', model: 'boss-drill', name: 'Pylori Drill', health: 3400, radius: 2.2, y: 3.2, scale: 3.2, score: 2500,
    hint: 'IT BURROWS · HIT IT WHEN IT ERUPTS' },
  intestines: { id: 'tapeworm', model: 'boss-tapeworm', name: 'Tapeworm', health: 1500, radius: 1.6, y: 1.7, scale: 3.0, score: 2500,
    hint: 'DESTROY THE SEGMENTS TO EXPOSE THE HEAD' },
  colon: { id: 'colossus', model: 'boss-colossus', name: 'Biofilm Colossus', health: 3300, radius: 3.0, y: 2.4, scale: 4.2, score: 2500,
    hint: 'IT REGROWS · KEEP FIRING AND BACK OFF THE SLAM' },
  lymph: { id: 'macrophage', model: 'boss-macrophage', name: 'Rogue Macrophage', health: 3800, radius: 2.6, y: 2.6, scale: 3.8, score: 2500,
    hint: 'SHOOT IT TO BREAK ITS PULL' },
  ear: { id: 'screamer', model: 'boss-screamer', name: 'Otolith Screamer', health: 3200, radius: 2.3, y: 5.0, scale: 3.2, score: 2500,
    hint: 'GET BEHIND COVER BEFORE EACH PULSE' },
});

// These two hang in the air; the rest stand on the floor and follow its contours.
export const BOSS_FLOATS = Object.freeze(['bloom', 'screamer']);
export const BOSS_MODELS = Object.freeze([...new Set(Object.values(LEVEL_BOSSES).map(boss => boss.model))]);
const SEGMENTS = 7;
const SEGMENT = Object.freeze({ health: 360, radius: 1.25, y: 1.3, scale: 2.3, score: 150, spacing: 3.4 });

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const livingSuits = sim => sim.activeSuits().filter(({ player }) => player.health > 0);

const nearestSuit = bossSuit;

const weakestNode = sim => [...sim.nodes].filter(n => n.health > 0).sort((a, b) => a.health - b.health)[0] ?? sim.objective;

function emit(sim, boss, stage, extra = {}) {
  sim.events.push({ type: 'levelBoss', stage, boss: boss.boss, name: boss.name, id: boss.id, x: boss.x, y: boss.y, z: boss.z, ...extra });
}

function setNode(boss, node) {
  boss.node = node;
  boss.nodeId = node.id;
}

// Walks toward a point and reports whether it has arrived.
const approach = moveBoss;

function warn(boss, text) {
  boss.action = text ? 'boss-windup' : 'idle';
  boss.warning = text ?? '';
  if (!text) boss.telegraph = null;
}

function hurtSuits(sim, boss, radius, damage) {
  for (const { player } of livingSuits(sim)) {
    if (distance(player, boss) <= radius && clearLine(sim, boss, player)) sim.damageTarget(boss, 'player', damage, boss, player.id);
  }
}

function blast(sim, x, y, z, radius) {
  sim.events.push({ type: 'explosion', radius, x, y, z });
}

function minion(sim, boss, type, x, z, node, spec) {
  if (!canSummon(sim, boss)) return null;
  const position = sim.ai.navigation.project({ x, z });
  x = position.x; z = position.z;
  const enemy = sim.createEnemy(type, x, z, node, spec);
  enemy.summonedBy = boss.id;
  if (spec) enemy.fragment = true;
  sim.confineToArena(enemy);
  sim.enemies.push(enemy);
  return enemy;
}

// Fires one slow, dodgeable globule from the boss at a point near a suit or at its node.
function spit(sim, boss, suit, spread = 0, lockedPoint = null) {
  const target = lockedPoint ?? (suit ? suit.player : boss.node);
  if (!target || (suit && suit.player.health <= 0) || !clearLine(sim, boss, target)) return false;
  boss.actionTarget = suit ? 'player' : 'tissue';
  boss.actionPlayerId = suit ? suit.player.id ?? null : null;
  const angle = sim.clock * 7.3 + boss.shots * 2.4;
  boss.shots++;
  boss.attackPoint = { x: target.x + Math.cos(angle) * spread, y: target.y, z: target.z + Math.sin(angle) * spread };
  sim.launchSpore(boss);
  return true;
}

// True when a straight line between two points on the floor misses every obstacle.
export function clearLine(sim, from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz || 1e-6;
  for (const [x, z, size] of sim.obstacles) {
    const t = Math.max(0, Math.min(1, ((x - from.x) * dx + (z - from.z) * dz) / lengthSquared));
    if (Math.hypot(from.x + dx * t - x, from.z + dz * t - z) < size) return false;
  }
  return true;
}

// ---------------------------------------------------------------- arrival

function entryPoint(sim) {
  const inlets = (sim.organMission?.inlets ?? sim.constructor.entrances ?? []).flat();
  const suits = livingSuits(sim);
  let best = { x: 0, z: -sim.constructor.arena.z * .8 };
  let gap = -Infinity;
  for (const [x, z] of inlets) {
    const nearest = Math.min(...suits.map(({ player }) => Math.hypot(player.x - x, player.z - z)), Infinity);
    if (nearest > gap) {
      best = { x, z };
      gap = nearest;
    }
  }
  return best;
}

export function spawnLevelBoss(sim) {
  const design = LEVEL_BOSSES[sim.area];
  if (!design) return null;
  const { x, z } = sim.area === 'junction' ? sim.constructor.junctionInlets.left : entryPoint(sim);
  const boss = sim.createEnemy(design.model, x, z, weakestNode(sim), design);
  // More suits means more guns on it.
  const strength = 1 + .7 * (sim.activeSuits().length - 1);
  boss.health = boss.maxHealth = Math.round(boss.health * strength);
  Object.assign(boss, {
    boss: design.id, behavior: 'boss', name: design.name, hint: design.hint, scale: design.scale, score: design.score,
    state: 'enter', phase: 1, telegraph: null, timer: 0, cooldown: 4, shots: 0, damageTaken: 0, damageScale: 1, warning: '', hidden: false, strikeAt: 0,
  });
  sim.enemies.push(boss);
  if (design.id === 'tapeworm') {
    boss.damageScale = .08;
    const angle = Math.atan2(z / sim.constructor.arena.z, x / sim.constructor.arena.x);
    sim.bossTrail = Array.from({ length: 100 }, (_, i) => ({
      x: Math.cos(angle + i * .007) * sim.constructor.arena.x * .86,
      z: Math.sin(angle + i * .007) * sim.constructor.arena.z * .86,
    }));
    boss.x = sim.bossTrail[0].x; boss.z = sim.bossTrail[0].z;
    for (let order = 1; order <= SEGMENTS; order++) {
      const segment = sim.createEnemy(design.model, x, z - order * .1, boss.node, SEGMENT);
      Object.assign(segment, { segmentOf: boss.id, order, behavior: 'boss-segment', scale: SEGMENT.scale * (1 - order * .035), score: SEGMENT.score });
      sim.enemies.push(segment);
    }
  }
  if (design.id === 'bloom' || design.id === 'screamer') boss.x = 0;
  emit(sim, boss, 'arrive', { hint: design.hint });
  return boss;
}

// Called every combat step: the boss enters once the last wave has nothing left to send.
export function stepBossArrival(sim) {
  if (sim.bossArrived || sim.tutorial || sim.wave !== sim.waves || !LEVEL_BOSSES[sim.area]) return;
  const mission = sim.missions[sim.wave - 1];
  if (mission.boss || sim.spawnIndex < (mission.arrivals ?? mission.species).length) return;
  sim.bossArrived = true;
  spawnLevelBoss(sim);
}

// ---------------------------------------------------------------- behaviours

const BEHAVIOURS = {
  // Armoured from every side. It lines up a suit, charges in a straight line, and if it reaches
  // the arena wall it is stunned and soft for a few seconds.
  thrombus(sim, boss, dt) {
    if (boss.state === 'enter') {
      boss.damageScale = .4;
      boss.state = 'stalk';
    }
    if (boss.state === 'stalk') {
      const node = weakestNode(sim);
      setNode(boss, node);
      const atNode = approach(sim, boss, node.x, node.z, 2.3, dt, 4.2);
      boss.attackingTissue = atNode;
      if (atNode && sim.clock >= boss.strikeAt) {
        boss.state = 'crush'; boss.timer = .85;
        warn(boss, 'TISSUE CRUSH · INTERRUPT ITS APPROACH');
        telegraph(boss, 'crush', .85, 5);
        return;
      }
      boss.cooldown -= dt;
      const suit = nearestSuit(sim, boss, 75);
      if (boss.cooldown <= 0 && suit) {
        boss.state = 'aim';
        boss.timer = 1.15;
        boss.chargeX = suit.player.x - boss.x;
        boss.chargeZ = suit.player.z - boss.z;
        boss.chargeTargetId = suit.player.id ?? null;
        boss.chargeSpeed = boss.phase > 1 ? 20.5 : 19;
        boss.attackingTissue = false;
        warn(boss, 'CHARGING · SIDESTEP');
        telegraph(boss, 'charge', 1.15, boss.radius + .9, { toX: boss.x + boss.chargeX, toZ: boss.z + boss.chargeZ, length: chargeReach(sim, boss) });
        emit(sim, boss, 'ability', { ability: 'charge' });
      }
    } else if (boss.state === 'aim') {
      // Tracks its target until the last third of the wind-up, then commits.
      const suit = livingSuits(sim).find(({ player }) => (player.id ?? null) === boss.chargeTargetId && clearLine(sim, boss, player));
      if (suit && boss.timer > .4) {
        boss.chargeX = suit.player.x - boss.x;
        boss.chargeZ = suit.player.z - boss.z;
        boss.telegraph.toX = boss.x + boss.chargeX;
        boss.telegraph.toZ = boss.z + boss.chargeZ;
        boss.telegraph.length = chargeReach(sim, boss);
      }
      boss.heading = Math.atan2(boss.chargeX, boss.chargeZ);
      boss.timer -= dt;
      if (boss.timer <= 0) {
        const length = Math.hypot(boss.chargeX, boss.chargeZ) || 1;
        boss.chargeX /= length;
        boss.chargeZ /= length;
        boss.state = 'charge';
        boss.timer = 4;
        boss.struck = false;
        warn(boss, '');
      }
    } else if (boss.state === 'charge') {
      const sweep = moveCharge(sim, boss, dt, boss.chargeSpeed ?? 19);
      if (!boss.struck) {
        for (const { player } of livingSuits(sim)) {
          if (!Number.isFinite(segmentCircle(sweep.from, sweep.to, player.x, player.z, boss.radius + .9)) || !clearLine(sim, sweep.from, player)) continue;
          sim.damageTarget(boss, 'player', 75, boss, player.id);
          boss.struck = true;
          break;
        }
      }
      boss.timer -= dt;
      if (sweep.collided || boss.timer <= 0) {
        boss.state = 'stunned';
        boss.timer = 4.2;
        boss.damageScale = 1.7;
        boss.warning = 'STUNNED · UNLOAD';
        blast(sim, boss.x, boss.y, boss.z, 5);
        emit(sim, boss, 'ability', { ability: 'stunned' });
        for (const side of [-1, 0, 1]) minion(sim, boss, 'virus', boss.x + side * 2.4, boss.z + 2, weakestNode(sim), sim.constructor.fragment);
      }
    } else if (boss.state === 'crush') {
      boss.timer -= dt;
      if (boss.timer <= 0) {
        if (distance(boss, boss.node) < 5.2 && clearLine(sim, boss, boss.node)) sim.damageTarget(boss, 'tissue', 36);
        boss.strikeAt = sim.clock + 2.4; boss.state = 'stalk'; warn(boss, '');
      }
    } else {
      boss.timer -= dt;
      boss.warning = 'STUNNED · UNLOAD';
      if (boss.timer <= 0) {
        boss.state = 'stalk';
        boss.cooldown = boss.phase > 1 ? 5.5 : 6.5;
        boss.damageScale = .4;
        boss.warning = '';
      }
    }
  },

  // Slithers to a node, latches on and drains it into its own health until enough fire knocks
  // it loose, then makes for the other node.
  leech(sim, boss, dt) {
    if (boss.state === 'enter') {
      setNode(boss, weakestNode(sim));
      boss.state = 'slither';
    }
    if (boss.state === 'slither') {
      boss.latched = boss.attackingTissue = false;
      if (approach(sim, boss, boss.node.x, boss.node.z, boss.phase > 1 ? 6 : 5.4, dt, 2.6)) {
        boss.state = 'latch';
        boss.timer = .8;
        boss.damageTaken = 0;
        warn(boss, 'LATCHING · SHOOT IT OFF');
        telegraph(boss, 'latch', .8, 3);
        emit(sim, boss, 'ability', { ability: 'latch', nodeName: boss.node.name });
      }
    } else if (boss.state === 'latch') {
      boss.timer -= dt;
      if (boss.damageTaken >= boss.maxHealth * .13) {
        boss.state = 'reel'; boss.timer = 2.2; boss.damageScale = 1.5;
        warn(boss, ''); boss.warning = 'KNOCKED LOOSE'; emit(sim, boss, 'ability', { ability: 'knocked' });
      } else if (boss.timer <= 0) {
        boss.state = 'drain'; boss.timer = boss.phase > 1 ? 8 : 10;
        boss.strikeAt = sim.clock + .6; warn(boss, '');
      }
    } else if (boss.state === 'drain') {
      boss.latched = boss.attackingTissue = true;
      boss.warning = 'DRAINING · SHOOT IT OFF';
      boss.timer -= dt;
      if (boss.damageTaken >= boss.maxHealth * .13 || boss.timer <= 0) {
        const knocked = boss.timer > 0;
        boss.state = 'reel';
        boss.timer = knocked ? 2.2 : .6;
        boss.damageScale = knocked ? 1.5 : 1;
        boss.latched = boss.attackingTissue = false;
        boss.warning = knocked ? 'KNOCKED LOOSE' : '';
        if (knocked) emit(sim, boss, 'ability', { ability: 'knocked' });
        return;
      }
      boss.health = Math.min(boss.maxHealth, boss.health + boss.maxHealth * .012 * dt);
      if (sim.clock >= boss.strikeAt) {
        boss.strikeAt = sim.clock + .6;
        sim.damageTarget(boss, 'tissue', 6);
      }
    } else {
      boss.timer -= dt;
      if (boss.timer <= 0) {
        boss.damageScale = 1;
        boss.warning = '';
        const others = sim.nodes.filter(node => node !== boss.node);
        setNode(boss, others.sort((a, b) => a.health - b.health)[0] ?? boss.node);
        boss.state = 'slither';
      }
    }
  },

  // Circles overhead. Volleys at the nearest suit, lobs at the weakest node, and seeds spitters.
  bloom(sim, boss, dt) {
    if (boss.state === 'enter') {
      boss.state = 'orbit';
      boss.orbit = Math.atan2(boss.z, boss.x);
      boss.seedAt = sim.clock + 12;
      boss.lobAt = sim.clock + 7;
    }
    boss.orbit += dt * .16;
    const ring = Math.min(sim.constructor.arena.x, sim.constructor.arena.z) * .46;
    approach(sim, boss, Math.cos(boss.orbit) * ring, Math.sin(boss.orbit) * ring * 1.25, 4.5, dt);
    boss.y = LEVEL_BOSSES.lungs.y + Math.sin(sim.clock * .9) * .5;
    setNode(boss, weakestNode(sim));
    boss.cooldown -= dt;
    if (boss.state === 'orbit' && boss.cooldown <= 0) {
      const suit = nearestSuit(sim, boss, 70);
      if (!suit) { boss.cooldown = .5; return; }
      boss.state = 'volley';
      boss.timer = 1.1;
      boss.volley = 0;
      boss.volleyTargetId = suit.player.id ?? null;
      boss.volleyPoint = { x: suit.player.x, y: suit.player.y, z: suit.player.z };
      warn(boss, 'SPORE VOLLEY · KEEP MOVING');
      telegraph(boss, 'volley', 1.1, 3, boss.volleyPoint);
      emit(sim, boss, 'ability', { ability: 'volley' });
    } else if (boss.state === 'volley') {
      boss.timer -= dt;
      if (boss.timer <= 0 && boss.volley < 6) {
        boss.timer = .22;
        boss.volley++;
        const suit = livingSuits(sim).find(({ player }) => (player.id ?? null) === boss.volleyTargetId);
        if (suit) spit(sim, boss, suit, boss.phase > 1 ? 3 : 2.4, boss.volleyPoint);
      }
      if (boss.volley >= 6) {
        boss.state = 'orbit';
        boss.cooldown = boss.phase > 1 ? 4 : 4.6;
        warn(boss, '');
      }
    }
    if (boss.state === 'orbit' && sim.clock >= boss.lobAt) {
      boss.lobAt = sim.clock + 8;
      for (let i = 0; i < 3; i++) spit(sim, boss, null, 1.5);
    }
    if (boss.state === 'orbit' && sim.clock >= boss.seedAt && canSummon(sim, boss)) {
      boss.seedAt = sim.clock + 16;
      emit(sim, boss, 'ability', { ability: 'seed' });
      for (let i = 0; i < 3; i++) minion(sim, boss, 'spore', boss.x + Math.cos(i * 2.1) * 4, boss.z + Math.sin(i * 2.1) * 4, weakestNode(sim));
    }
  },

  // Out of sight and out of reach while it tunnels; a tremor follows it. It erupts under the
  // weakest node or the nearest suit, then stays up long enough to be punished.
  drill(sim, boss, dt) {
    if (boss.state === 'enter') {
      boss.state = 'surfaced';
      boss.timer = 5;
      boss.eruptions = 0;
    }
    if (boss.state === 'surfaced') {
      boss.hidden = false;
      boss.timer -= dt;
      boss.cooldown -= dt;
      const suit = nearestSuit(sim, boss, 50);
      if (suit) boss.heading = Math.atan2(suit.player.x - boss.x, suit.player.z - boss.z);
      if (boss.cooldown <= 0 && suit) {
        boss.cooldown = 1.5;
        spit(sim, boss, suit, 1.2);
      }
      if (boss.timer <= 0) {
        boss.state = 'burrowed';
        boss.timer = boss.phase > 1 ? 3.5 : 4;
        boss.hidden = true;
        boss.damageScale = 1;
        boss.tremorAt = 0;
        // Alternates between going for tissue and going for a suit.
        const hunt = boss.eruptions % 2 === 1 && suit;
        const goal = hunt ? suit.player : weakestNode(sim);
        setNode(boss, weakestNode(sim));
        boss.goalX = goal.x + (hunt ? 0 : 3.5);
        boss.goalZ = goal.z + (hunt ? 0 : 3.5);
        const reachable = sim.ai.navigation.project({ x: boss.goalX, z: boss.goalZ });
        boss.goalX = reachable.x; boss.goalZ = reachable.z;
        emit(sim, boss, 'ability', { ability: 'burrow' });
      }
    } else if (boss.state === 'burrowed') {
      approach(sim, boss, boss.goalX, boss.goalZ, 11, dt);
      boss.timer -= dt;
      if (sim.clock >= boss.tremorAt) {
        boss.tremorAt = sim.clock + .35;
        emit(sim, boss, 'tremor');
      }
      if (boss.timer <= 0) {
        boss.state = 'erupting';
        boss.timer = 1;
        Object.assign(boss, sim.ai.navigation.project(boss));
        warn(boss, 'ERUPTING · GET CLEAR');
        telegraph(boss, 'eruption', 1, 7);
      }
    } else {
      boss.timer -= dt;
      if (sim.clock >= boss.tremorAt) {
        boss.tremorAt = sim.clock + .15;
        emit(sim, boss, 'tremor');
      }
      if (boss.timer <= 0) {
        boss.state = 'surfaced';
        boss.hidden = false;
        boss.timer = 7;
        boss.damageScale = 1.25;
        boss.cooldown = 1.2;
        boss.eruptions++;
        warn(boss, '');
        blast(sim, boss.x, 1, boss.z, 7);
        hurtSuits(sim, boss, 7, 60);
        for (const node of sim.nodes) {
          if (distance(node, boss) > 9) continue;
          setNode(boss, node);
          sim.damageTarget(boss, 'tissue', 22);
        }
        if (boss.eruptions % 3 === 0) {
          for (const side of [-1, 1]) minion(sim, boss, 'flagellate', boss.x + side * 3, boss.z, weakestNode(sim));
        }
        emit(sim, boss, 'ability', { ability: 'erupt' });
      }
    }
  },

  // The head leads a chain of segments on a circuit of the nodes, biting each one as it passes.
  // Shots barely scratch the head until every segment is gone.
  tapeworm(sim, boss, dt) {
    const segments = sim.enemies.filter(enemy => enemy.segmentOf === boss.id);
    if (boss.state === 'enter') {
      boss.state = 'circuit';
      boss.lap = 0;
      setNode(boss, sim.nodes[0]);
    }
    if (!segments.length && boss.damageScale < 1) {
      boss.damageScale = 1.25;
      boss.warning = 'HEAD EXPOSED';
      emit(sim, boss, 'ability', { ability: 'exposed' });
    }
    const speed = 5.2 + (SEGMENTS - segments.length) * .42 + (boss.phase > 1 ? .5 : 0);
    // Swings wide of each node rather than stopping on it.
    const swing = sim.clock * .9;
    let reached = false;
    if (boss.biteWindup) {
      boss.biteWindup.remaining -= dt;
      if (boss.biteWindup.remaining <= 0) {
        if (boss.biteWindup.nodeId) {
          const node = sim.nodes.find(n => n.id === boss.biteWindup.nodeId);
          if (node?.health > 0 && distance(boss, node) < 6 && clearLine(sim, boss, node)) sim.damageTarget(boss, 'tissue', 30, boss, null, node);
          boss.strikeAt = sim.clock + (boss.phase > 1 ? 2.6 : 3);
        } else { hurtSuits(sim, boss, boss.radius + .8, 45); boss.biteAt = sim.clock + (boss.phase > 1 ? 1.3 : 1.5); }
        boss.biteWindup = null; warn(boss, '');
      }
    } else {
      reached = approach(sim, boss, boss.node.x + Math.cos(swing) * 3.2, boss.node.z + Math.sin(swing) * 3.2, speed, dt, 1.2);
      const atNode = distance(boss, boss.node) < 6 && sim.clock >= boss.strikeAt && clearLine(sim, boss, boss.node);
      const suit = nearestSuit(sim, boss, boss.radius + 1.8);
      if (atNode || (suit && sim.clock >= (boss.biteAt ?? 0))) {
        boss.biteWindup = { remaining: .65, nodeId: atNode ? boss.nodeId : null };
        warn(boss, atNode ? 'TISSUE BITE' : 'BITE · STEP BACK'); telegraph(boss, 'bite', .65, atNode ? 6 : boss.radius + .8);
      }
    }
    if (reached) {
      boss.lap++;
      setNode(boss, sim.nodes[boss.lap % sim.nodes.length]);
    }
    const trail = sim.bossTrail ??= [{ x: boss.x, z: boss.z }];
    if (distance(trail[0], boss) > .35) trail.unshift({ x: boss.x, z: boss.z });
    trail.length = Math.min(trail.length, 220);
    // Each surviving segment sits a fixed distance back along the head's path, closing up gaps.
    segments.sort((a, b) => a.order - b.order).forEach((segment, index) => {
      let remaining = (index + 1) * SEGMENT.spacing;
      let at = trail[trail.length - 1];
      for (let i = 1; i < trail.length; i++) {
        const step = distance(trail[i - 1], trail[i]);
        if (step >= remaining) {
          const t = remaining / step;
          at = { x: trail[i - 1].x + (trail[i].x - trail[i - 1].x) * t, z: trail[i - 1].z + (trail[i].z - trail[i - 1].z) * t };
          break;
        }
        remaining -= step;
      }
      segment.heading = Math.atan2(segment.x - at.x || 1e-6, segment.z - at.z) + Math.PI;
      segment.x = at.x;
      segment.z = at.z;
      segment.node = boss.node;
      segment.nodeId = boss.nodeId;
    });
  },

  // Slow and enormous. It knits itself back together whenever the firing stops, sheds brood as
  // it shrinks, and flattens anything standing close when it slams.
  colossus(sim, boss, dt) {
    if (boss.state === 'enter') {
      boss.state = 'advance';
      boss.splits = 0;
      boss.lastHurt = sim.clock;
      boss.seenDamage = 0;
    }
    if (boss.damageTaken !== boss.seenDamage) {
      boss.seenDamage = boss.damageTaken;
      boss.lastHurt = sim.clock;
    }
    const regrowing = sim.clock - boss.lastHurt > 5 && boss.health < boss.maxHealth;
    if (regrowing) boss.health = Math.min(boss.maxHealth, boss.health + boss.maxHealth * .009 * dt);
    const threshold = 1 - (boss.splits + 1) * .25;
    if (boss.splits < 3 && boss.health <= boss.maxHealth * threshold && sim.clock >= (boss.nextSplitAt ?? 0)) {
      boss.splits++;
      boss.nextSplitAt = sim.clock + 3;
      boss.scale *= .9;
      boss.radius *= .93;
      emit(sim, boss, 'ability', { ability: 'split' });
      for (const side of [-1, 1]) minion(sim, boss, 'amoeba', boss.x + side * 4, boss.z + 1, weakestNode(sim));
      for (let i = 0; i < 3; i++) minion(sim, boss, 'virus', boss.x + Math.cos(i * 2.1) * 3.4, boss.z + Math.sin(i * 2.1) * 3.4, weakestNode(sim), sim.constructor.fragment);
    }
    if (boss.state === 'advance') {
      const node = weakestNode(sim);
      setNode(boss, node);
      const atNode = approach(sim, boss, node.x, node.z, 1.9, dt, 4.6);
      boss.attackingTissue = atNode;
      boss.warning = regrowing ? 'REGROWING · KEEP FIRING' : '';
      boss.cooldown -= dt;
      if (boss.cooldown <= 0 && nearestSuit(sim, boss, 10)) {
        boss.state = 'slam';
        boss.timer = 1.15;
        warn(boss, 'SLAM · BACK AWAY');
        telegraph(boss, 'slam', 1.15, 9);
        emit(sim, boss, 'ability', { ability: 'slam' });
      } else if (atNode && sim.clock >= boss.strikeAt) {
        boss.state = 'crush'; boss.timer = .85;
        warn(boss, 'TISSUE CRUSH'); telegraph(boss, 'crush', .85, 5.5);
      }
    } else if (boss.state === 'recover') {
      boss.timer -= dt;
      if (boss.timer <= 0) { boss.state = 'advance'; boss.damageScale = 1; boss.warning = ''; }
    } else {
      boss.timer -= dt;
      if (boss.timer <= 0) {
        if (boss.state === 'slam') {
          blast(sim, boss.x, 1, boss.z, 9); hurtSuits(sim, boss, 9, 40);
          boss.state = 'recover'; boss.timer = 1.15; boss.damageScale = 1.2;
          boss.cooldown = boss.phase > 1 ? 5 : 6;
        } else {
          if (distance(boss, boss.node) < 5.5 && clearLine(sim, boss, boss.node)) sim.damageTarget(boss, 'tissue', 20);
          boss.strikeAt = sim.clock + 2.2; boss.state = 'advance';
        }
        warn(boss, '');
      }
    }
  },

  // Hunts suits. Its pull drags one in to be engulfed unless enough fire breaks it, and any
  // pathogen that wanders into it is eaten to top up its health.
  macrophage(sim, boss, dt) {
    if (boss.state === 'enter') boss.state = 'hunt';
    setNode(boss, weakestNode(sim));
    for (const prey of [...sim.enemies]) {
      if (prey === boss || prey.boss || prey.nest || prey.segmentOf || distance(prey, boss) > boss.radius + 1) continue;
      sim.enemies.splice(sim.enemies.indexOf(prey), 1);
      sim.ai?.emit('death', prey, { owner: prey.id, radius: 22 });
      sim.ai?.remove(prey.id);
      boss.health = Math.min(boss.maxHealth, boss.health + boss.maxHealth * .035);
      emit(sim, boss, 'ability', { ability: 'devour', prey: prey.id, preyType: prey.type });
    }
    if (boss.state === 'hunt') {
      const suit = nearestSuit(sim, boss);
      if (suit) approach(sim, boss, suit.player.x, suit.player.z, 2.6, dt, boss.radius + 1.2);
      else if (boss.lastSeen && sim.clock - boss.lastSeen.time < BOSS_TUNING.memory) approach(sim, boss, boss.lastSeen.x, boss.lastSeen.z, 2.6, dt, 2);
      boss.cooldown -= dt;
      if (suit && distance(suit.player, boss) < boss.radius + 2 && sim.clock >= boss.strikeAt) {
        boss.state = 'swipe'; boss.timer = .65;
        warn(boss, 'ENGULFING STRIKE · BACK AWAY'); telegraph(boss, 'swipe', .65, boss.radius + 2);
        return;
      }
      const victim = nearestSuit(sim, boss, 32);
      if (boss.cooldown <= 0 && victim && distance(victim.player, boss) > boss.radius + 4) {
        boss.state = 'pull-windup';
        boss.timer = .9;
        boss.damageTaken = 0;
        boss.victim = victim.player.id ?? null;
        warn(boss, 'ENGULFING · SHOOT TO BREAK FREE');
        telegraph(boss, 'pull', .9, 1.5, { toX: victim.player.x, toZ: victim.player.z });
        emit(sim, boss, 'ability', { ability: 'pull' });
      }
    } else if (boss.state === 'pull' || boss.state === 'pull-windup') {
      const suit = livingSuits(sim).find(({ player }) => (player.id ?? null) === boss.victim);
      boss.timer -= dt;
      if (!suit || !clearLine(sim, boss, suit.player) || (boss.timer <= 0 && boss.state === 'pull')) {
        boss.state = 'hunt';
        boss.cooldown = boss.phase > 1 ? 6 : 7;
        warn(boss, '');
      } else if (boss.damageTaken >= boss.maxHealth * .05) {
        boss.state = 'reel';
        boss.timer = 2.4;
        boss.damageScale = 1.5;
        warn(boss, '');
        boss.warning = 'PULL BROKEN';
        emit(sim, boss, 'ability', { ability: 'broken' });
      } else if (boss.state === 'pull-windup') {
        if (boss.timer <= 0) {
          boss.state = 'pull'; boss.timer = 3.4; boss.telegraph = null;
          boss.warning = 'PULLING · SHOOT OR BREAK LINE OF SIGHT';
          // Its pseudopods have the suit: the visor takes the first smear (world.mjs).
          emit(sim, boss, 'ability', { ability: 'pulling', ...(boss.victim != null ? { playerId: boss.victim } : {}) });
        }
      } else {
        const { player } = suit;
        const gap = distance(player, boss);
        const drag = Math.min(gap, 6.2 * dt);
        player.x += (boss.x - player.x) / (gap || 1) * drag;
        player.z += (boss.z - player.z) / (gap || 1) * drag;
        sim.confineToArena(player, true);
        boss.heading = Math.atan2(player.x - boss.x, player.z - boss.z);
        if (gap <= boss.radius + 1.1) {
          sim.damageTarget(boss, 'player', 60, boss, player.id);
          boss.state = 'hunt';
          boss.cooldown = boss.phase > 1 ? 6 : 7;
          warn(boss, '');
          emit(sim, boss, 'ability', { ability: 'engulf', ...(player.id != null ? { playerId: player.id } : {}) });
        }
      }
    } else if (boss.state === 'swipe') {
      boss.timer -= dt;
      if (boss.timer <= 0) {
        hurtSuits(sim, boss, boss.radius + 2, 30); boss.strikeAt = sim.clock + 1.6;
        boss.state = 'hunt'; warn(boss, '');
      }
    } else {
      boss.timer -= dt;
      if (boss.timer <= 0) {
        boss.state = 'hunt';
        boss.cooldown = boss.phase > 1 ? 5.5 : 6;
        boss.damageScale = 1;
        boss.warning = '';
      }
    }
  },

  // Hangs over the arena. Its pulse hits every suit it has a clear line to, so the answer is to
  // be behind an obstacle when it fires. Below half health it moves and pulses faster.
  screamer(sim, boss, dt) {
    if (boss.state === 'enter') {
      boss.state = 'hum';
      boss.cooldown = 6;
      boss.spot = 0;
      boss.shardAt = sim.clock + 3;
    }
    const enraged = boss.health < boss.maxHealth * .5;
    const spots = [[0, -.12], [.3, .25], [-.3, .25]];
    if (enraged && !boss.moved) {
      boss.moved = true;
      boss.spot = 1;
      emit(sim, boss, 'ability', { ability: 'enrage' });
    }
    const [sx, sz] = spots[boss.spot % spots.length];
    // A pulse's origin is committed for the full warning, so cover stays trustworthy.
    if (boss.state === 'hum') approach(sim, boss, sx * sim.constructor.arena.x, sz * sim.constructor.arena.z, 5, dt);
    boss.y = LEVEL_BOSSES.ear.y + Math.sin(sim.clock * 1.3) * .35;
    setNode(boss, weakestNode(sim));
    if (boss.state === 'hum') {
      boss.cooldown -= dt;
      if (sim.clock >= boss.shardAt) {
        boss.shardAt = sim.clock + (enraged ? 2.2 : 3.2);
        const suit = nearestSuit(sim, boss, 70);
        if (suit && clearLine(sim, boss, suit.player)) spit(sim, boss, suit, 1);
      }
      if (boss.cooldown <= 0) {
        boss.state = 'charge';
        boss.timer = 2.4;
        warn(boss, 'SONIC PULSE · GET BEHIND COVER');
        telegraph(boss, 'pulse', 2.4, 12);
        emit(sim, boss, 'ability', { ability: 'pulse-warning' });
      }
    } else if (boss.state === 'recover') {
      boss.timer -= dt;
      if (boss.timer <= 0) { boss.state = 'hum'; boss.damageScale = 1; }
    } else {
      boss.timer -= dt;
      if (boss.timer <= 0) {
        blast(sim, boss.x, boss.y, boss.z, 12);
        for (const { player } of livingSuits(sim)) {
          if (clearLine(sim, boss, player)) sim.damageTarget(boss, 'player', 68, boss, player.id);
        }
        for (const node of sim.nodes) {
          if (!clearLine(sim, boss, node)) continue;
          setNode(boss, node);
          sim.damageTarget(boss, 'tissue', 12);
        }
        emit(sim, boss, 'ability', { ability: 'pulse' });
        boss.state = 'recover'; boss.timer = 1.2; boss.damageScale = 1.2;
        boss.cooldown = enraged ? 6 : 8.5;
        if (enraged) boss.spot++;
        warn(boss, '');
      }
    }
  },
};

export function stepLevelBoss(sim, boss, dt) {
  if (boss.behavior === 'boss-segment') return; // Placed by the head.
  if (boss.health <= 0) return;
  const phase = boss.health <= boss.maxHealth * .5 ? 2 : 1;
  if (phase > (boss.phase ?? 1)) {
    boss.phase = phase;
    emit(sim, boss, 'phase', { phase });
  }
  if (boss.telegraph) boss.telegraph.remaining = Math.max(0, boss.telegraph.remaining - dt);
  boss.attackingTissue = false;
  BEHAVIOURS[boss.boss](sim, boss, dt);
  if (boss.attackingTissue) boss.node.underAttack = true;
  if (!boss.hidden) sim.confineToArena(boss);
}

// What the HUD needs for the boss bar; null when no boss is alive.
export function levelBossStatus(sim) {
  const boss = sim.enemies?.find(enemy => enemy.boss);
  if (!boss) return null;
  const segments = sim.enemies.filter(enemy => enemy.segmentOf === boss.id).length;
  return {
    name: boss.name, health: boss.health, maxHealth: boss.maxHealth, hint: boss.hint, warning: boss.warning,
    phase: boss.phase ?? 1, remaining: boss.telegraph?.remaining ?? (boss.damageScale > 1 ? boss.timer : 0),
    state: boss.hidden ? 'hidden' : boss.damageScale > 1 ? 'exposed' : boss.damageScale < 1 ? 'sealed' : 'warning',
    detail: segments ? segments + (segments === 1 ? ' segment left' : ' segments left') : 'Phase ' + (boss.phase ?? 1) + ' / 2',
  };
}
