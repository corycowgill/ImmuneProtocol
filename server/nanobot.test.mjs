import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from '../dist/simulation.mjs';
import { CoopSimulation } from '../dist/coop-simulation.mjs';
import { spawnLevelBoss, levelBossStatus, stepLevelBoss } from '../dist/level-bosses.mjs';
import { NANOBOT, NANOBOT_RULES, nanobotParts } from '../dist/nanobot-boss.mjs';

const DT = 1 / 30;

// A cortex with the Mega Nano Bot in it, past its descent, shield up.
function arena(sim = new Simulation('brain')) {
  sim.start();
  sim.wave = sim.waves;
  sim.enemies = [];
  sim.boss = null;
  sim.obstacles = [];
  const boss = spawnLevelBoss(sim, NANOBOT);
  for (const player of sim.players ?? [sim.player]) Object.assign(player, { x: 0, y: 1.7, z: 20, health: 100 });
  return { sim, boss };
}
const run = (sim, seconds, each = () => {}) => {
  for (let t = 0; t < seconds; t += DT) {
    sim.clock += DT;
    sim.events = [];
    for (const boss of sim.enemies.filter(enemy => enemy.boss)) stepLevelBoss(sim, boss, DT);
    each();
  }
};
const pylons = (sim, boss) => sim.enemies.filter(enemy => enemy.pylonOf === boss.id);
const brain = (sim, boss) => sim.enemies.find(enemy => enemy.relayTo === boss.id);
function settle(sim, boss) {
  run(sim, NANOBOT_RULES.enter + .1);
  assert.equal(boss.state, 'hover');
  boss.cooldown = 1e9; // No attacks unless a test asks for one.
}

test('it descends untouchable, then fights behind a shield held up by three pylons', () => {
  const { sim, boss } = arena();
  assert.equal(boss.state, 'enter');
  assert.ok(boss.y > NANOBOT.y + 5, 'it starts high over the cortex');
  sim.hitEnemy(boss, 500, false, boss, 'carbine', sim);
  assert.equal(boss.health, boss.maxHealth, 'untouchable while it descends');
  settle(sim, boss);
  assert.ok(Math.abs(boss.y - NANOBOT.y) < .5);
  assert.equal(pylons(sim, boss).length, 3);
  assert.equal(boss.shielded, true);
  // Shielded: the hull and the brain turn every hit.
  sim.hitEnemy(boss, 500, false, boss, 'carbine', sim);
  sim.hitEnemy(brain(sim, boss), 500, false, boss, 'carbine', sim);
  assert.equal(boss.health, boss.maxHealth);
  assert.match(levelBossStatus(sim).detail, /Shield up · 3 pylons left · Phase 1 \/ 3/);
  // Its parts are shot through the hull's own sphere: a shot at a pylon hits the pylon.
  const pylon = pylons(sim, boss)[0];
  const out = Math.hypot(pylon.x - boss.x, pylon.z - boss.z);
  const direction = { x: (boss.x - pylon.x) / out, y: 0, z: (boss.z - pylon.z) / out };
  const from = { x: pylon.x - direction.x * 15, y: pylon.y, z: pylon.z - direction.z * 15 };
  const hit = sim.traceRay(from, direction, true, sim.weapon);
  assert.equal(hit.target, pylon);
});

test('destroying the pylons drops the shield: the brain takes damage, the hull barely, and the shield reboots', () => {
  const { sim, boss } = arena();
  settle(sim, boss);
  for (const pylon of pylons(sim, boss)) sim.hitEnemy(pylon, 1e4, false, pylon, 'carbine', sim);
  run(sim, DT);
  assert.equal(boss.shielded, false);
  assert.match(boss.warning, /SHIELD DOWN/);
  assert.match(levelBossStatus(sim).detail, /brain exposed/);
  const before = boss.health;
  sim.hitEnemy(brain(sim, boss), 100, false, boss, 'carbine', sim);
  assert.equal(before - boss.health, 100 * NANOBOT_RULES.brainScale, 'a brain hit passes to the hull, amplified');
  const after = boss.health;
  sim.hitEnemy(boss, 100, false, boss, 'carbine', sim);
  assert.ok(after - boss.health <= 100 * NANOBOT_RULES.hullScale + 1e-9, 'the hull turns nearly all of it');
  // It reels for a moment (no attacks), then the window closes and the shield comes back.
  boss.cooldown = 0;
  run(sim, NANOBOT_RULES.reel - .2);
  assert.equal(boss.state, 'hover', 'reeling, it does not attack');
  run(sim, NANOBOT_RULES.exposed);
  assert.equal(boss.shielded, true);
  assert.equal(pylons(sim, boss).length, 3);
});

test('each new phase reboots the shield with tougher pylons and is announced', () => {
  const { sim, boss } = arena();
  settle(sim, boss);
  const first = pylons(sim, boss)[0].maxHealth;
  for (const pylon of pylons(sim, boss)) sim.hitEnemy(pylon, 1e4, false, pylon, 'carbine', sim);
  run(sim, DT);
  boss.health = boss.maxHealth * .6;
  const events = [];
  run(sim, DT, () => events.push(...sim.events));
  assert.equal(boss.phase, 2);
  assert.ok(events.some(event => event.stage === 'phase' && event.phase === 2));
  assert.equal(boss.shielded, true, 'phase two starts shielded');
  assert.ok(pylons(sim, boss)[0].maxHealth > first);
  boss.health = boss.maxHealth * .3;
  run(sim, DT);
  assert.equal(boss.phase, 3);
});

test('the missile salvo hits the marked circles and nowhere else', () => {
  const { sim, boss } = arena();
  settle(sim, boss);
  boss.cooldown = 0; boss.attackIndex = 0; // salvo first
  run(sim, DT);
  assert.equal(boss.state, 'salvo');
  assert.equal(boss.telegraph.kind, 'salvo');
  assert.ok(boss.telegraph.rings.length >= 3);
  // Standing in a circle hurts; stepping well clear of every circle does not.
  const hurt = new Simulation('brain'); void hurt;
  const health = sim.player.health;
  run(sim, NANOBOT_RULES.salvo.warning + DT);
  assert.ok(sim.player.health < health, 'the suit stood in its circle');

  const clear = arena();
  settle(clear.sim, clear.boss);
  clear.boss.cooldown = 0; clear.boss.attackIndex = 0;
  run(clear.sim, DT, () => {
    // Step out the moment the circles are marked.
    if (clear.boss.rings) Object.assign(clear.sim.player, { x: 40, z: 40 });
  });
  const safe = clear.sim.player.health;
  run(clear.sim, NANOBOT_RULES.salvo.warning + DT, () => Object.assign(clear.sim.player, { x: 40, z: 40 }));
  assert.equal(clear.sim.player.health, safe);
});

test('the laser sweep hits a suit standing in it, not one jumping it or behind scenery', () => {
  const sweep = () => {
    const { sim, boss } = arena();
    settle(sim, boss);
    boss.cooldown = 0; boss.attackIndex = 1; // sweep
    run(sim, DT);
    assert.equal(boss.state, 'sweep');
    assert.equal(boss.telegraph.kind, 'sweep');
    return { sim, boss };
  };
  const standing = sweep();
  const health = standing.sim.player.health;
  run(standing.sim, NANOBOT_RULES.sweep.warning + 4);
  assert.ok(standing.sim.player.health < health, 'standing in it burns');

  const jumping = sweep();
  const high = jumping.sim.player.health;
  run(jumping.sim, NANOBOT_RULES.sweep.warning + 4, () => { jumping.sim.player.lift = 1; });
  assert.equal(jumping.sim.player.health, high, 'jumping it is safe');

  const covered = sweep();
  covered.sim.obstacles = [[(covered.boss.x + covered.sim.player.x) / 2, (covered.boss.z + covered.sim.player.z) / 2, 3]];
  const cover = covered.sim.player.health;
  run(covered.sim, NANOBOT_RULES.sweep.warning + 4);
  assert.equal(covered.sim.player.health, cover, 'scenery stops the beam');
});

test('its EMP downs turrets and medic drones for seconds, and its bay launches drones', () => {
  const { sim, boss } = arena();
  settle(sim, boss);
  sim.turret = { x: boss.x + 4, y: 0, z: boss.z + 4, ownerId: null, cooldown: 0, stats: undefined };
  sim.drone = { x: boss.x - 3, y: 2, z: boss.z, empUntil: 0 };
  boss.cooldown = 0; boss.attackIndex = 4; // emp
  run(sim, DT);
  assert.equal(boss.state, 'emp');
  const events = [];
  run(sim, NANOBOT_RULES.emp.warning + DT, () => events.push(...sim.events));
  const emp = events.find(event => event.ability === 'emp');
  assert.equal(emp.downed.length, 2);
  assert.ok(sim.turret.empUntil > sim.clock + NANOBOT_RULES.emp.knockout - .5);
  assert.ok(sim.drone.empUntil > sim.clock);

  boss.cooldown = 0; boss.attackIndex = 2; // drones
  run(sim, DT);
  const before = sim.enemies.filter(enemy => enemy.summonedBy === boss.id).length;
  run(sim, NANOBOT_RULES.drones.warning + DT);
  const launched = sim.enemies.filter(enemy => enemy.summonedBy === boss.id);
  assert.ok(launched.length > before);
  assert.ok(launched.every(enemy => ['rogue-bot', 'crawler'].includes(enemy.type)));
});

test('in the finale it follows the Mega Virus, keeps the mission open until it falls, and scales with the squad', () => {
  const sim = new Simulation('brain');
  sim.start();
  sim.wave = sim.waves - 1;
  sim.beginWave();
  assert.ok(sim.boss, 'the Mega Virus wave');
  sim.boss.state = 'defeated';
  sim.boss.remaining = 0;
  const events = [];
  let nanobot = null;
  for (let i = 0; i < 400 && !nanobot; i++) {
    sim.enemies = sim.enemies.filter(enemy => enemy.boss || enemy.partOf != null);
    sim.step(DT, {});
    events.push(...sim.events);
    nanobot = sim.enemies.find(enemy => enemy.boss === 'nanobot');
    assert.equal(sim.phase, 'combat', 'the mission waits for it');
  }
  assert.ok(nanobot);
  assert.ok(events.some(event => event.stage === 'incoming' && event.boss === 'nanobot'), 'its arrival is announced');
  assert.ok(events.some(event => event.stage === 'arrive' && event.boss === 'nanobot'));

  const squad = arena(new CoopSimulation([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], 'brain'));
  assert.ok(squad.boss.maxHealth > NANOBOT.health * 2, 'three suits face a tougher machine');
  // When it falls its parts go with it.
  settle(squad.sim, squad.boss);
  squad.boss.damageScale = 1;
  squad.sim.hitEnemy(squad.boss, 1e9, false, squad.boss, 'carbine', squad.sim.suits[0]);
  assert.equal(nanobotParts(squad.sim, squad.boss).length, 0);
});

test('the boss bar says where to shoot, with a countdown while the brain is exposed', () => {
  const { sim, boss } = arena();
  assert.match(levelBossStatus(sim).instruction, /untouchable/);
  settle(sim, boss);
  let status = levelBossStatus(sim);
  assert.equal(status.instruction, 'Shielded · shoot the 3 pylons');
  assert.deepEqual(status.targets.map(target => target.kind), ['pylon', 'pylon', 'pylon']);
  // A shot into the shield is reported as blocked, so the HUD can say why it did nothing.
  sim.events = [];
  sim.hitEnemy(boss, 50, false, { x: boss.x, y: boss.y, z: boss.z }, 'player', sim);
  assert.ok(sim.events.some(event => event.type === 'hit' && event.blocked === 'armour'));
  for (const pylon of pylons(sim, boss)) sim.hitEnemy(pylon, 1e4, false, pylon, 'carbine', sim);
  run(sim, DT);
  status = levelBossStatus(sim);
  assert.equal(status.instruction, 'Shield down · shoot the brain');
  assert.deepEqual(status.targets.map(target => target.kind), ['brain']);
  assert.ok(status.remaining > NANOBOT_RULES.exposed - 1);
});
