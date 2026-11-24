// Plays every solo mission headlessly with two scripted strategies and reports win rates per difficulty.
//
//   npm run balance                                     every mission, difficulty and strategy
//   npm run balance -- --difficulty hard --trials 20 stomach colon
//
// Both strategies aim with the same imperfect, range-dependent accuracy and only engage within 40 m.
// The anchor guards whichever node is weakest and keeps shooting its target even when a Shellback
// soaks the shots. The rover runs to the node under the most pressure and drops targets its shots
// can't reach. Both seal gastric valves, reopen bronchi and shoot the Mega Virus cores when exposed.
// In the heart, both go and stand in front of an open valve to shoot the colonies through it.
// Either jumps when something low (a ridge) stops it.
// Some arenas favour one strategy over the other; a mission counts as winnable on a difficulty
// when either strategy wins it. The script exits with an error if one never is.
import { Simulation } from '../../dist/simulation.mjs';
import { CAMPAIGN_AREAS } from '../../dist/coop-protocol.mjs';
import { DIFFICULTIES, applyDifficulty } from '../../dist/difficulty.mjs';
import { HEART_VALVES } from '../../dist/heart-chamber.mjs';

const STEP = 1 / 30;
const TIME_LIMIT = 2700;

function parse(argv) {
  const options = { difficulties: Object.keys(DIFFICULTIES), players: ['anchor', 'rover'], trials: 4, areas: [] };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--difficulty') options.difficulties = [argv[++index]];
    else if (value === '--player') options.players = [argv[++index]];
    else if (value === '--trials') options.trials = Number(argv[++index]);
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

function play(area, difficulty, rover) {
  const sim = applyDifficulty(new Simulation(area), difficulty);
  sim.start();
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
    if (!deployed && sim.phase === 'combat' && clock > 3) input.deploy = deployed = true;
    // Barely moved for half a second while trying to: something low is in the way, so hop it.
    if (clock - last.at > .5) {
      const trying = Math.hypot(input.moveX ?? 0, input.moveZ ?? 0) > .5;
      if (trying && distance(last, sim.player) < .8) input.jump = true;
      last = { x: sim.player.x, z: sim.player.z, at: clock };
    }
    sim.step(STEP, input);
    clock += STEP;
    for (const event of sim.events) {
      if (event.type === 'shot') memory.misses = event.hit ? 0 : memory.misses + 1;
      if (event.type === 'guard' && event.stage === 'block') memory.misses++;
    }
    lowest = Math.min(lowest, ...sim.nodes.map(node => node.health));
  }
  if (process.env.BOT_DEBUG && sim.phase !== 'won' && clock >= TIME_LIMIT) console.log('  timeout state', JSON.stringify({ settling: sim.settling, gash: !!sim.gash, extraction: sim.extractionPending, intermission: sim.intermission, enemies: sim.enemies.map(e => e.boss ?? e.type), tissue: sim.tissue, player: [Math.round(sim.player.x), Math.round(sim.player.z)], near: !!sim.nearNode, nodes: sim.nodes.map(n => Math.round(n.health)) }));
  if (process.env.BOT_DEBUG && sim.phase !== 'won') console.log(area, difficulty, sim.phase, 'wave', sim.wave, 'failed', sim.failedNode?.name, 'hp', Math.round(sim.player.health), 't', Math.round(clock));
  return { won: sim.phase === 'won', lowest };
}

function hiddenByTissue(sim, player, enemy) {
  const dx = enemy.x - player.x, dy = enemy.y - player.y, dz = enemy.z - player.z, length = Math.hypot(dx, dy, dz) || 1;
  return sim.traceRay(player, { x: dx / length, y: dy / length, z: dz / length }, true, sim.weapon).target !== enemy;
}

function think(sim, rover, memory, clock) {
  const { player } = sim;
  const input = {};
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
        const result = play(area, difficulty, player === 'rover');
        wins += Number(result.won);
        lowest += result.lowest / options.trials;
      }
      winners += wins;
      cells.push(`${wins}/${options.trials} ${String(Math.round(lowest)).padStart(3)}%`.padStart(15));
    }
    if (!winners) unwinnable.push(`${area} on ${difficulty}`);
  }
  console.log([area.padEnd(11), ...cells].join(''));
}
console.log('\nWins per trials, then the average of each run\'s lowest tissue node integrity.');
if (unwinnable.length) {
  console.error('Never won: ' + unwinnable.join(', '));
  process.exitCode = 1;
}
