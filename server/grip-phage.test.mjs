import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation, SPECIES, speciesHabitats } from '../dist/simulation.mjs';
import { CoopSimulation } from '../dist/coop-simulation.mjs';
import { GRIP_SPEC, grippedBy, releaseCling } from '../dist/grip-phage.mjs';
import { useMelee } from '../dist/abilities.mjs';
import { AI_PROFILES, SPECIES_AI } from '../dist/ai-profiles.mjs';
import { AIWorld } from '../dist/tactical-ai.mjs';

const DT = 1 / 60;

function field() {
  const sim = new Simulation('artery', { ai: { seed: 9 } });
  sim.start();
  sim.tutorial = null;
  sim.phase = 'combat';
  sim.enemies = [];
  sim.spawnCountdown = 1e9;
  // Open ground: the artery's clots are cleared from the simulation and the pathogens' navigation.
  sim.obstacles = [];
  sim.ai.dispose();
  sim.ai = new AIWorld(sim, { seed: 9 });
  Object.assign(sim.player, { x: 0, y: 1.7, z: 14, yaw: 0, pitch: 0, health: 100 });
  return sim;
}

// A Grip Phage two metres ahead of the suit, already committed to a pounce at it.
function pounce(sim) {
  const phage = sim.createEnemy('latcher', 0, 12, sim.nodes[0]);
  phage.y = sim.player.y;
  sim.enemies.push(phage);
  sim.startEnemyAttack(phage, sim.player, 'player');
  for (let i = 0; i < 60 && phage.action !== 'cling' && phage.action !== 'virus-recover'; i++) {
    sim.events = [];
    sim.clock += DT;
    sim.advanceVirusAttack(phage, DT, SPECIES.latcher);
  }
  return phage;
}
const hold = (sim, phage, seconds) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) { sim.clock += DT; sim.advanceVirusAttack(phage, DT, SPECIES.latcher); }
};

test('a Grip Phage that lands its pounce clings to the visor, drains the suit and slows it', () => {
  const sim = field();
  const phage = pounce(sim);
  assert.equal(phage.action, 'cling');
  assert.equal(grippedBy(sim, sim.player), phage);
  assert.ok(sim.events.some(event => event.type === 'grip' && event.stage === 'start'));
  // It sits on the visor, ahead of and just below the eye, and follows the suit's turn.
  const ahead = Math.hypot(phage.x - sim.player.x, phage.z - sim.player.z);
  assert.ok(Math.abs(ahead - GRIP_SPEC.grip.ahead) < 1e-6 && phage.y < sim.player.y);
  const before = sim.player.health;
  hold(sim, phage, 2);
  assert.ok(before - sim.player.health > 6.5 && before - sim.player.health < 11, `drained ${(before - sim.player.health).toFixed(1)} in two seconds`);
  sim.player.yaw = Math.PI / 2;
  hold(sim, phage, DT);
  assert.ok(phage.x < sim.player.x - .5, 'it turns with the suit');

  // Held, the suit walks at about half speed.
  const free = field();
  const walk = s => { const z = s.player.z; for (let i = 0; i < 30; i++) s.movePlayer(DT, { moveZ: 1 }); return z - s.player.z; };
  sim.player.yaw = 0;
  assert.ok(walk(sim) < walk(free) * .6);
});

test('a bash tears it off, a kill or a stun frees the suit, and it lets go by itself', () => {
  const sim = field();
  let phage = pounce(sim);
  sim.events = [];
  useMelee(sim, sim, { melee: true }, DT);
  assert.equal(grippedBy(sim, sim.player), null, 'the bash tore it off');
  assert.ok(sim.events.some(event => event.type === 'grip' && event.stage === 'end' && event.reason === 'torn'));
  assert.equal(sim.events.find(event => event.type === 'melee').freed, 1);
  assert.ok(phage.stunRemaining > 0 && phage.attackCooldown >= GRIP_SPEC.grip.rest);

  const shot = field();
  phage = pounce(shot);
  shot.events = [];
  shot.hitEnemy(phage, 999, false, phage, 'carbine', shot);
  assert.equal(grippedBy(shot, shot.player), null);
  assert.ok(shot.events.some(event => event.type === 'grip' && event.reason === 'killed'));

  const tired = field();
  phage = pounce(tired);
  hold(tired, phage, GRIP_SPEC.grip.hold + .1);
  assert.equal(phage.action, 'idle');
  assert.equal(grippedBy(tired, tired.player), null);

  // A suit that gets away from a stunned one breaks its grip.
  const stunned = field();
  phage = pounce(stunned);
  stunned.player.z -= 3;
  hold(stunned, phage, DT);
  assert.equal(phage.action, 'idle');
});

test('a dodged pounce does not latch, and only one Grip Phage holds a suit at a time', () => {
  const dodged = field();
  dodged.player.guardUntil = 1e9;
  assert.equal(pounce(dodged).action, 'virus-recover');

  const sim = field();
  pounce(sim);
  assert.equal(pounce(sim).action, 'virus-recover', 'the second one bounces off');
  releaseCling(sim, grippedBy(sim, sim.player));
  assert.equal(grippedBy(sim, sim.player), null);
});

test('in co-op it holds the suit it struck and slows only that suit', () => {
  const sim = new CoopSimulation([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  sim.start();
  sim.enemies = [];
  sim.obstacles = [];
  const [a, b] = sim.players;
  Object.assign(a, { x: 0, y: 1.7, z: 14, yaw: 0, health: 100 });
  Object.assign(b, { x: 10, y: 1.7, z: 14, yaw: 0, health: 100 });
  const phage = sim.createEnemy('latcher', 10, 12, sim.nodes[0]);
  phage.y = b.y;
  sim.enemies.push(phage);
  sim.startEnemyAttack(phage, b, 'player');
  for (let i = 0; i < 60 && phage.action !== 'cling'; i++) { sim.clock += DT; sim.advanceVirusAttack(phage, DT, SPECIES.latcher); }
  assert.equal(phage.action, 'cling');
  assert.equal(grippedBy(sim, b), phage);
  assert.equal(grippedBy(sim, a), null);
  // Snapshots carry the grip so remote clients show the same goo and prompt.
  const snapshot = sim.snapshot?.() ?? null;
  if (snapshot) assert.equal(snapshot.enemies.find(enemy => enemy.id === phage.id).action, 'cling');
});

test('it hunts suits, joins the campaign from the artery\'s third wave, and lives in most arenas', () => {
  assert.equal(SPECIES.latcher.behavior, 'virus');
  const profile = AI_PROFILES[SPECIES_AI.latcher];
  assert.ok(profile.playerPriority > 2 && profile.tissuePriority < .5);
  const habitats = speciesHabitats().latcher;
  assert.ok(habitats.includes('artery') && habitats.length >= 8, habitats.join(', '));
  const sim = new Simulation('artery');
  assert.ok(!sim.missions[0].species.includes('latcher') && !sim.missions[1].species.includes('latcher'), 'not in the first two waves');
  assert.ok(sim.missions[2].species.includes('latcher'));
});

test('left to its own tactics in a running mission, a Grip Phage goes for the suit and latches on', () => {
  const sim = field();
  const phage = sim.createEnemy('latcher', 0, 6, sim.nodes[0]);
  sim.enemies.push(phage);
  let latched = false;
  for (let i = 0; i < 60 * 12 && !latched; i++) {
    sim.step(DT, { moveX: 0, moveZ: 0, lookX: 0, lookY: 0 });
    sim.player.health = Math.max(sim.player.health, 50);
    latched = phage.action === 'cling';
  }
  assert.ok(latched, 'it latched within twelve seconds');
});
