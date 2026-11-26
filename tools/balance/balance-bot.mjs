// Plays every solo mission headlessly with two scripted strategies and reports win rates per difficulty.
//
//   npm run balance                                     every mission, difficulty and strategy
//   npm run balance -- --difficulty hard --trials 20 stomach colon
//   npm run balance -- --companion drone             bring the medic drone instead of the turret
//
// Both strategies aim with the same imperfect, range-dependent accuracy and only engage within 40 m.
// The anchor guards whichever node is weakest and keeps shooting its target even when a Shellback
// soaks the shots. The rover runs to the node under the most pressure and drops targets its shots
// can't reach. Both seal gastric valves, reopen bronchi and shoot the Mega Virus cores when exposed.
// In the heart, both go and stand in front of an open valve to shoot the colonies through it.
// Either jumps when something low (a ridge) stops it.
// Some arenas favour one strategy over the other; a mission counts as winnable on a difficulty
// when either strategy wins it. The script exits with an error if one never is.
import { ARENA, Simulation, withinHazard } from '../../dist/simulation.mjs';
import { HAZARD_CLEARANCE, groundHeight, terrainFor } from '../../dist/terrain.mjs';
import { CAMPAIGN_AREAS } from '../../dist/coop-protocol.mjs';
import { DIFFICULTIES, applyDifficulty } from '../../dist/difficulty.mjs';
import { HEART_VALVES } from '../../dist/heart-chamber.mjs';
import { grippedBy } from '../../dist/grip-phage.mjs';
import { loadoutWithCompanion, normalizeWeaponLoadout } from '../../dist/weapon-mods.mjs';

const STEP = 1 / 30;
const TIME_LIMIT = 2700;

function parse(argv) {
  const options = { difficulties: Object.keys(DIFFICULTIES), players: ['anchor', 'rover'], trials: 4, areas: [], companion: 'turret' };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--difficulty') options.difficulties = [argv[++index]];
    else if (value === '--player') options.players = [argv[++index]];
    else if (value === '--trials') options.trials = Number(argv[++index]);
    else if (value === '--companion') options.companion = argv[++index];
    else options.areas.push(value);
  }
  if (!options.areas.length) options.areas = [...CAMPAIGN_AREAS];
  return options;
}

// Solid scenery in the current arena; the bot walks around it instead of pushing into it.
let obstacles = [];

function steer(player, x, z, input, sprint) {
  let dx = x - player.x;
  let dz = z - player.z;
  const distance = Math.hypot(dx, dz);
  if (distance < .3) return;
  for (const [ox, oz, size] of obstacles) {
    const tx = ox - player.x;
    const tz = oz - player.z;
    const gap = Math.hypot(tx, tz);
    // Heading into an obstacle it is touching: turn along its surface, on the shorter side.
    if (gap > size + 1.4 || tx * dx + tz * dz <= 0 || Math.hypot(x - ox, z - oz) < size) continue;
    const side = tx * dz - tz * dx > 0 ? 1 : -1;
    dx = -tz * side + tx * -.25;
    dz = tx * side + tz * -.25;
    const length = Math.hypot(dx, dz);
    dx *= distance / length;
    dz *= distance / length;
    break;
  }
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  input.moveX = dx / distance * cos - dz / distance * sin;
  input.moveZ = -(dx / distance * sin + dz / distance * cos);
  input.sprint = sprint;
}

function aim(player, target, jitter) {
  const dx = target.x - player.x;
  const dz = target.z - player.z;
  player.yaw = Math.atan2(-dx, -dz) + (Math.random() - .5) * jitter;
  player.pitch = Math.atan2((target.y ?? 1) - player.y, Math.hypot(dx, dz));
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Raised ground high enough to ride out each arena's acid, contraction or squeeze, as points on
// a grid over the arena (found once per arena).
const refuges = new Map();
function highGround(area) {
  if (!refuges.has(area)) {
    const clearance = HAZARD_CLEARANCE[area], pieces = terrainFor(area), points = [];
    if (clearance != null) {
      for (let x = -ARENA.x; x <= ARENA.x; x += 1.25) for (let z = -ARENA.z; z <= ARENA.z; z += 1.25) {
        if (Math.hypot(x / ARENA.x, z / ARENA.z) < .97 && groundHeight(pieces, x, z) >= clearance + .05) points.push({ x, z });
      }
    }
    refuges.set(area, points);
  }
  return refuges.get(area);
}

// Reads a boss's telegraphed attack the way a player would: sidesteps a charge lane (dashing
// when it is close), backs out of a slam, crush, swipe, bite or pulse circle, and shoots the
// Rogue Macrophage while it pulls the suit in, which is how a pull is broken.
function dodgeBoss(sim, input) {
  const player = sim.player;
  for (const boss of sim.enemies) {
    if (!boss.boss) continue;
    if (boss.boss === 'macrophage' && (boss.state === 'pull' || boss.state === 'pull-windup') && (boss.victim ?? null) === (player.id ?? null)) {
      aim(player, boss, .03); input.fire = true; input.repair = false;
      continue;
    }
    const sign = boss.telegraph;
    if (!sign) continue;
    if (sign.kind === 'charge') {
      const dx = sign.toX - sign.x, dz = sign.toZ - sign.z, length = Math.hypot(dx, dz) || 1;
      const ux = dx / length, uz = dz / length;
      const along = (player.x - sign.x) * ux + (player.z - sign.z) * uz;
      const across = (player.x - sign.x) * -uz + (player.z - sign.z) * ux;
      if (along < -2 || along > (sign.length ?? length) + 4 || Math.abs(across) > sign.radius + 2.5) continue;
      const side = across >= 0 ? 1 : -1;
      steer(player, player.x - uz * side * 6, player.z + ux * side * 6, input, true);
      input.repair = false;
      if (sign.remaining < .45) input.dash = true;
      continue;
    }
    const cx = sign.kind === 'volley' ? sign.x : sign.x, cz = sign.z;
    const gap = Math.hypot(player.x - cx, player.z - cz);
    if (gap > sign.radius + 1.5) continue;
    const away = gap > .01 ? 1 / gap : 1;
    steer(player, player.x + (player.x - cx) * away * 8, player.z + (player.z - cz) * away * 8, input, true);
    input.repair = false;
    if (sign.remaining < .35) input.dash = true;
  }
}

// Takes cover from the organ hazard the way a player would once warned: onto raised ground high
// enough to clear it where the arena has some, otherwise out of the hazard's zone, still shooting.
function dodgeHazard(sim, input, memory) {
  let organ = sim.organ;
  const player = sim.player;
  if (!organ || !['warning', 'active'].includes(organ.phase)) { memory.refuge = null; return; }
  const clearance = HAZARD_CLEARANCE[sim.area];
  const spots = highGround(sim.area);
  if (process.env.HAZARD_DEBUG && Math.round(sim.clock * 10) % 5 === 0) console.log('hz', organ.phase, sim.clock.toFixed(1), 'feet', (player.feet ?? 0).toFixed(2), 'refuge', memory.refuge ? distance(memory.refuge, player).toFixed(1) : '-', 'pos', player.x.toFixed(1), player.z.toFixed(1), 'hp', player.health.toFixed(0));
  if (clearance != null && spots.length) {
    // Safe once standing on ground high enough (not merely in the air above the acid).
    const ground = groundHeight(terrainFor(sim.area), player.x, player.z);
    const airborne = (player.feet ?? 0) - ground > .05;
    if (ground >= clearance && !airborne) {
      delete input.moveX; delete input.moveZ;
      input.repair = false;
      return;
    }
    memory.refuge ??= spots.reduce((best, spot) => distance(spot, player) < distance(best, player) ? spot : best);
    // Keep moving onto it while in the air, and jump the sheer edge of a shelf or fold from the floor.
    steer(player, memory.refuge.x, memory.refuge.z, input, true);
    input.repair = false;
    if (distance(memory.refuge, player) < 3 && !airborne) input.jump = true;
    return;
  }
  // Stay a couple of metres clear of the zone while it is coming or active: chasing a target
  // back into the airway or the resonance is how the bot used to get caught.
  const margin = 2.5;
  const wide = organ.radius ? { ...organ, radius: organ.radius + margin } : { ...organ, width: organ.width + margin * 2, depth: organ.depth + margin * 2 };
  if (!withinHazard(player, wide)) { memory.refuge = null; return; }
  organ = wide;
  if (!memory.refuge || withinHazard(memory.refuge, organ)) {
    memory.refuge = null;
    for (let radius = 3; radius <= 30 && !memory.refuge; radius += 1.5) {
      for (let k = 0; k < 16; k++) {
        const angle = k / 16 * Math.PI * 2;
        const spot = { x: player.x + Math.cos(angle) * radius, z: player.z + Math.sin(angle) * radius };
        if (Math.hypot(spot.x / ARENA.x, spot.z / ARENA.z) < .95 && !withinHazard(spot, organ)) { memory.refuge = spot; break; }
      }
    }
  }
  if (memory.refuge) {
    steer(player, memory.refuge.x, memory.refuge.z, input, true);
    input.repair = false;
  }
}

// BALANCE_WHY=1 totals where the suit's integrity went, per mission.
let why = null;
function play(area, difficulty, rover) {
  const weaponLoadout = loadoutWithCompanion(normalizeWeaponLoadout({}), options.companion);
  const fresh = new Simulation(area, { weaponLoadout });
  if (process.env.BALANCE_REPAIR) fresh.repairAmount = Number(process.env.BALANCE_REPAIR);
  const sim = applyDifficulty(fresh, difficulty);
  sim.start();
  if (process.env.BALANCE_DRONE && sim.drone) {
    const [suitHeal, tissueHeal] = process.env.BALANCE_DRONE.split(',').map(Number);
    Object.assign(sim.drone.stats, { suitHeal, tissueHeal });
  }
  obstacles = sim.obstacles;
  const memory = { misses: 0, blocked: new Map() };
  let clock = 0;
  let deployed = false;
  let lowest = 100;
  let last = { x: sim.player.x, z: sim.player.z, at: 0 };
  while ((sim.phase === 'combat' || sim.phase === 'intermission') && clock < TIME_LIMIT) {
    if (sim.extractionPending) {
      sim.chooseExtraction('extract');
      break;
    }
    const input = think(sim, rover, memory, clock);
    if (!process.env.BALANCE_NO_DODGE) { dodgeHazard(sim, input, memory); dodgeBoss(sim, input); }
    // A turret goes down early; a drone just follows (the control would station it).
    if (!deployed && !sim.drone && sim.phase === 'combat' && clock > 3) input.deploy = deployed = true;
    // Barely moved for half a second while trying to: something low is in the way, so hop it.
    if (clock - last.at > .5) {
      const trying = Math.hypot(input.moveX ?? 0, input.moveZ ?? 0) > .5;
      if (trying && distance(last, sim.player) < .8) input.jump = true;
      last = { x: sim.player.x, z: sim.player.z, at: clock };
    }
    const before = sim.player.health;
    const kinds = why ? new Map(sim.enemies.map(enemy => [enemy.id, enemy.boss ? 'boss:' + enemy.boss : enemy.elite ? enemy.type + '*' : enemy.type])) : null;
    sim.step(STEP, input);
    clock += STEP;
    if (why) {
      // Where the suit's integrity went this step: each pathogen's damage events, the rest to the
      // organ hazard and anything else that does not raise one.
      const lost = Math.max(0, before - sim.player.health);
      let named = 0;
      for (const event of sim.events) {
        if (event.type !== 'damage' || event.target !== 'player') continue;
        const share = Math.min(lost - named, event.amount * (sim.player.health > 0 || lost ? 1 : 0));
        if (share <= 0) continue;
        const kind = kinds.get(event.id) ?? 'other';
        why.set(kind, (why.get(kind) ?? 0) + share);
        named += share;
      }
      if (lost - named > 1e-6) why.set('hazard/other', (why.get('hazard/other') ?? 0) + lost - named);
    }
    for (const event of sim.events) {
      if (event.type === 'shot') memory.misses = event.hit ? 0 : memory.misses + 1;
      if (event.type === 'guard' && event.stage === 'block') memory.misses++;
    }
    lowest = Math.min(lowest, ...sim.nodes.map(node => node.health));
  }
  if (process.env.BOT_DEBUG && sim.phase !== 'won' && clock >= TIME_LIMIT) console.log('  timeout state', JSON.stringify({ settling: sim.settling, gash: !!sim.gash, extraction: sim.extractionPending, intermission: sim.intermission, enemies: sim.enemies.map(e => e.boss ?? e.type), tissue: sim.tissue, player: [Math.round(sim.player.x), Math.round(sim.player.z)], near: !!sim.nearNode, nodes: sim.nodes.map(n => Math.round(n.health)) }));
  if (process.env.BOT_DEBUG && sim.phase !== 'won') console.log(area, difficulty, sim.phase, 'wave', sim.wave, 'failed', sim.failedNode?.name, 'hp', Math.round(sim.player.health), 't', Math.round(clock));
  return { won: sim.phase === 'won', lowest, suitLost: sim.phase === 'lost' && !sim.failedNode };
}

function hiddenByTissue(sim, player, enemy) {
  const dx = enemy.x - player.x, dy = enemy.y - player.y, dz = enemy.z - player.z, length = Math.hypot(dx, dy, dz) || 1;
  return sim.traceRay(player, { x: dx / length, y: dy / length, z: dz / length }, true, sim.weapon).target !== enemy;
}

function think(sim, rover, memory, clock) {
  const { player } = sim;
  const input = {};
  // A Grip Phage on the visor: bash it off first, as a player would (held after a beat to react).
  const grip = grippedBy(sim, player);
  if (grip) {
    memory.grippedAt ??= clock;
    if (clock - memory.grippedAt > .45) input.melee = true;
  } else memory.grippedAt = null;
  const enemies = sim.enemies.filter(enemy => !enemy.hidden && sim.colonyExposed?.(enemy) !== false);
  const pressure = node => enemies.filter(enemy => enemy.node === node && distance(enemy, node) < 14).length *
    (1 + (100 - node.health) / 50);
  const node = [...sim.nodes].sort(rover
    ? (a, b) => pressure(b) - pressure(a) || a.health - b.health
    : (a, b) => a.health - b.health)[0];
  // After a run of misses the rover gives up on that target for a moment.
  if (rover && memory.misses >= 8 && memory.target) {
    memory.blocked.set(memory.target, clock + 1.5);
    memory.misses = 0;
  }
  let target = null;
  let best = Infinity;
  for (const enemy of enemies) {
    if ((memory.blocked.get(enemy) ?? 0) > clock) continue;
    // Tissue nodes stop shots: a pathogen behind one waits until a clear line opens.
    const covered = !enemy.boss && !enemy.nest && hiddenByTissue(sim, player, enemy);
    const score = distance(enemy, player) * .35 + distance(enemy, enemy.node) * (enemy.node === node ? .7 : 1) + (covered ? 30 : 0);
    if (score < best && distance(enemy, player) < 40) {
      best = score;
      target = enemy;
    }
  }
  // With nothing closer to deal with, cross the arena to the nearest brood nest or the boss.
  if (!target) {
    target = enemies.filter(enemy => enemy.nest || enemy.boss || enemy.segmentOf).sort((a, b) => distance(a, player) - distance(b, player))[0] ?? null;
  }
  if (target !== memory.target) memory.misses = 0;
  memory.target = target;

  const boss = sim.boss?.state === 'defeated' ? null : sim.boss;
  const urgent = target && distance(target, target.node) < 7;
  if (boss && (boss.state === 'exposed' || (boss.state === 'warning' && !urgent))) {
    const core = boss.weakPoint;
    steer(player, core.x, core.z + 9, input, boss.state === 'warning');
    aim(player, core, .03);
    input.fire = boss.state === 'exposed' && boss.openness > .4;
    if (!input.fire && target && distance(target, player) < 18) {
      aim(player, target, .05);
      input.fire = true;
    }
    return input;
  }

  if (target) {
    aim(player, target, .03 + distance(target, player) * .0012);
    input.fire = Math.random() < .8;
  }
  let goal = target && distance(target, node) < 12 ? node : target ?? node;
  // A heart colony is shot from in front of its valve, never walked up to.
  if (target?.type === 'colony') {
    const valve = HEART_VALVES[target.valveIndex];
    goal = { x: valve.x - valve.ox * 11 + valve.lx * 1.5, z: valve.z - valve.oz * 11 + valve.lz * 1.5 };
    if (distance(goal, player) > 3) steer(player, goal.x, goal.z, input, true);
  }
  if (target?.type === 'guard') {
    goal = { x: target.x - Math.sin(target.heading) * 4, z: target.z - Math.cos(target.heading) * 4 };
  }
  if (rover && pressure(node) > 0 && distance(node, player) > 16) goal = node;
  if (distance(goal, player) > (target?.type === 'guard' ? 1 : 6)) steer(player, goal.x, goal.z, input, !target);
  if (!target && node.health < 100 && distance(node, player) > 3) steer(player, node.x, node.z, input, true);

  // A pathogen hidden behind a tissue node (nodes are solid): walk round the node to its side.
  if (target && !target.boss && !target.nest && target.node && distance(target, target.node) < 6 && hiddenByTissue(sim, player, target)) {
    const n = target.node, dx = target.x - n.x, dz = target.z - n.z, d = Math.hypot(dx, dz) || 1;
    // Beside it, a little round the node from where it latched, so the suit does not walk into it.
    const turn = .55, cos = Math.cos(turn), sin = Math.sin(turn);
    const ux = (dx * cos - dz * sin) / d, uz = (dx * sin + dz * cos) / d;
    steer(player, n.x + ux * 4.4, n.z + uz * 4.4, input, false);
  }
  // Objectives wait for a quiet moment.
  const quiet = !target || (distance(target, player) > 16 && !urgent);
  // An open gash drains its node until someone stands on it and seals it.
  if (sim.gash && quiet) {
    delete input.moveX;
    delete input.moveZ;
    if (sim.nearGash) {
      input.repair = true;
      input.fire = false;
    } else steer(player, sim.gash.x, sim.gash.z, input, true);
    return input;
  }
  const valve = sim.gastric?.stage === 'intake' ? sim.gastric.intake : sim.gastric?.stage === 'drain' ? sim.gastric.drain : null;
  if (valve && quiet) {
    delete input.moveX;
    delete input.moveZ;
    if (sim.nearGastricValve === valve) {
      input.repair = true;
      input.fire = false;
    } else steer(player, valve.x, valve.z, input, true);
  }
  const port = sim.airway?.ports.find(item => !item.open);
  if (port && quiet) {
    const blocked = sim.nodes.find(item => item.id === port.nodeId);
    delete input.moveX;
    delete input.moveZ;
    if (distance(blocked, player) < 3.5) {
      input.repair = true;
      input.fire = false;
    } else steer(player, blocked.x, blocked.z, input, true);
  }
  const wounded = sim.nodes.find(item => distance(item, player) < 5 && item.health < 100);
  if (wounded && (!target || distance(target, player) > 14)) {
    input.repair = true;
    input.fire = false;
  }
  return input;
}

const options = parse(process.argv.slice(2));
// BALANCE_REPAIR=11 or BALANCE_DRONE=1,1 try other sealer or drone numbers without editing the game.
if (process.env.BALANCE_REPAIR || process.env.BALANCE_DRONE) {
  console.log('Experimental numbers:', JSON.stringify({ repair: process.env.BALANCE_REPAIR, drone: process.env.BALANCE_DRONE }));
}
let suitLosses = 0;
let losses = 0;
const columns = options.difficulties.flatMap(difficulty => options.players.map(player => `${difficulty}/${player}`));
console.log(['mission'.padEnd(11), ...columns.map(column => column.padStart(15))].join(''));
const unwinnable = [];
for (const area of options.areas) {
  const cells = [];
  for (const difficulty of options.difficulties) {
    let winners = 0;
    for (const player of options.players) {
      let wins = 0;
      let lowest = 0;
      for (let trial = 0; trial < options.trials; trial++) {
        if (process.env.BALANCE_WHY) why ??= new Map();
        const result = play(area, difficulty, player === 'rover');
        wins += Number(result.won);
        losses += Number(!result.won);
        suitLosses += Number(result.suitLost);
        lowest += result.lowest / options.trials;
      }
      winners += wins;
      cells.push(`${wins}/${options.trials} ${String(Math.round(lowest)).padStart(3)}%`.padStart(15));
    }
    if (!winners) unwinnable.push(`${area} on ${difficulty}`);
  }
  console.log([area.padEnd(11), ...cells].join(''));
  if (why) {
    // The suit damage each run took, by source, averaged over this mission's runs.
    const runs = options.trials * options.players.length * options.difficulties.length;
    const total = [...why.values()].reduce((sum, value) => sum + value, 0);
    console.log('    suit damage per run ' + Math.round(total / runs) + ': ' + [...why].sort((a, b) => b[1] - a[1]).slice(0, 7)
      .map(([kind, value]) => `${kind} ${Math.round(100 * value / total)}%`).join(', '));
    why = null;
  }
}
console.log('\nWins per trials, then the average of each run\'s lowest tissue node integrity.');
console.log(`Companion: ${options.companion}. Losses: ${losses}, ${suitLosses} of them to the suit failing.`);
if (unwinnable.length) {
  console.error('Never won: ' + unwinnable.join(', '));
  process.exitCode = 1;
}
