import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from '../dist/simulation.mjs';
import { CoopSimulation } from '../dist/coop-simulation.mjs';
import { applyDifficulty } from '../dist/difficulty.mjs';
import { DRONE_RULES, stepDrones } from '../dist/companions.mjs';
import { groundHeight } from '../dist/terrain.mjs';
import {
  DRONE_BASE, droneStats, loadoutWithCompanion, loadoutWithDrone, loadoutWithSealer, normalizeWeaponLoadout,
} from '../dist/weapon-mods.mjs';

const DT = 1 / 30;
const droneLoadout = (changes = {}) => loadoutWithDrone(loadoutWithCompanion(normalizeWeaponLoadout({}), 'drone'), changes);

function solo(area = 'artery', weaponLoadout = droneLoadout()) {
  const sim = new Simulation(area, { weaponLoadout, ai: { seed: 3 } });
  sim.start();
  sim.tutorial = null;
  sim.enemies = [];
  return sim;
}

const fly = (sim, seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) { sim.clock += DT; stepDrones(sim, DT); } };

test('loadouts pick a companion and keep drone and sealer builds', () => {
  const plain = normalizeWeaponLoadout({});
  assert.equal(plain.arsenal.companion, 'turret');
  assert.equal(normalizeWeaponLoadout({ arsenal: { companion: 'kitten' } }).arsenal.companion, 'turret');
  const loadout = loadoutWithSealer(droneLoadout({ emitter: 'triage-emitter', skin: 'tiger', bogus: 1 }), { decal: 'flames', charm: 'clover', field: 'wide-field' });
  const saved = normalizeWeaponLoadout(JSON.parse(JSON.stringify(loadout)));
  assert.equal(saved.arsenal.companion, 'drone');
  assert.equal(saved.arsenal.drone.emitter, 'triage-emitter');
  assert.equal(saved.arsenal.drone.skin, 'tiger');
  assert.equal(saved.arsenal.sealer.decal, 'flames');
  assert.equal(saved.arsenal.sealer.charm, 'clover');
  assert.equal(saved.arsenal.sealer.field, undefined, 'the sealer has no parts');
});

test('drone parts trade suit healing, tissue healing, reach and speed', () => {
  const base = droneStats({});
  assert.deepEqual(base, { ...DRONE_BASE });
  assert.ok(base.suitHeal <= 1.5 && base.tissueHeal <= 1.5, 'healing stays slow');
  const triage = droneStats({ emitter: 'triage-emitter' });
  assert.ok(triage.suitHeal > base.suitHeal && triage.tissueHeal < base.tissueHeal);
  const wide = droneStats({ field: 'wide-field' });
  assert.ok(wide.radius > base.radius && wide.tissueHeal < base.tissueHeal);
  assert.ok(droneStats({ rotors: 'sprint-rotors' }).speed > base.speed);
  assert.ok(Math.abs(droneStats({ charm: 'fang' }).suitHeal - base.suitHeal * 1.1) < 1e-9, 'a damage charm heals more');
});

test('a drone suit has no turret to place; the turret control stations and recalls the drone', () => {
  const sim = solo();
  assert.equal(sim.companion, 'drone');
  assert.equal(sim.turretCharges, 0);
  assert.ok(sim.drone);
  assert.equal(sim.turretPlacement, null);
  sim.useCompanion();
  assert.equal(sim.turret, null, 'no turret appears');
  assert.equal(sim.drone.mode, 'station');
  assert.ok(sim.events.some(event => event.type === 'drone' && event.stage === 'stationed'));
  const held = { x: sim.drone.x, z: sim.drone.z };
  sim.player.x += 12;
  fly(sim, 3);
  assert.ok(Math.hypot(sim.drone.x - held.x, sim.drone.z - held.z) < .5, 'a stationed drone holds its spot');
  sim.useCompanion();
  assert.equal(sim.drone.mode, 'follow');
  fly(sim, 3);
  assert.ok(Math.hypot(sim.drone.x - sim.player.x, sim.drone.z - sim.player.z) < 2.5, 'it flies back to its suit');
  // On Easy the suit still places no turret.
  const easy = applyDifficulty(new Simulation('artery', { weaponLoadout: droneLoadout() }), 'easy');
  easy.start();
  assert.equal(easy.turretCharges, 0);
  const turretEasy = applyDifficulty(new Simulation('artery'), 'easy');
  turretEasy.start();
  assert.equal(turretEasy.turretCharges, 2);
});

// A patch of open floor, clear of clots and raised ground, to watch the drone fly over.
function clearSpot(sim) {
  for (let z = 30; z > -40; z -= 2) {
    for (let x = -30; x < 30; x += 2) {
      const open = (px, pz) => !sim.obstacles.some(([ox, oz, r]) => Math.hypot(px - ox, pz - oz) < r + 2) &&
        groundHeight(sim.terrain, px, pz, 0) === 0;
      if (open(x, z) && open(x + 1.15, z + .85) && open(x + 21.15, z + .85) && open(x + 10, z + .85)) return { x, z };
    }
  }
  throw new Error('no open floor');
}

test('it follows at the shoulder, hovering at its height', () => {
  const sim = solo();
  const spot = clearSpot(sim);
  Object.assign(sim.player, { x: spot.x, z: spot.z, yaw: 0 });
  fly(sim, 4);
  const { side, back } = DRONE_RULES.follow;
  assert.ok(Math.abs(sim.drone.x - spot.x - side) < .3 && Math.abs(sim.drone.z - (spot.z + back)) < .3, `at ${sim.drone.x.toFixed(2)}, ${sim.drone.z.toFixed(2)}`);
  assert.ok(Math.abs(sim.drone.y - DRONE_RULES.hover) < .3);
  // Turned around, it swaps to the other side of the view.
  sim.player.yaw = Math.PI;
  fly(sim, 4);
  assert.ok(Math.abs(sim.drone.x - spot.x + side) < .3 && Math.abs(sim.drone.z - (spot.z - back)) < .3);
  sim.player.yaw = 0;
  fly(sim, 4);
  sim.player.x = spot.x + 20;
  fly(sim, 1);
  const behind = Math.hypot(sim.drone.x - sim.player.x - side, sim.drone.z - sim.player.z - back);
  assert.ok(behind > 1 && behind < 20, 'it chases at its own speed, not instantly');
  sim.player.x = spot.x + 20 + DRONE_RULES.teleport + 5;
  fly(sim, DT);
  assert.ok(Math.abs(sim.drone.x - sim.player.x - side) < .5, 'far behind, it skips to its suit');
});

test('it slowly mends the most damaged suit or node in its field', () => {
  const sim = solo();
  const node = sim.nodes[0];
  Object.assign(sim.player, { x: node.x + 2, z: node.z + 2, yaw: 0 });
  fly(sim, 3);
  sim.player.health = 60;
  node.health = 90;
  fly(sim, 10);
  const suitRate = (sim.player.health - 60) / 10;
  assert.ok(Math.abs(suitRate - DRONE_BASE.suitHeal) < .15, `suit mended ${suitRate.toFixed(2)}/s`);
  assert.equal(node.health, 90, 'one target at a time: the suit had lost more');
  sim.player.health = 100;
  fly(sim, 10);
  const tissueRate = (node.health - 90) / 10;
  assert.ok(Math.abs(tissueRate - DRONE_BASE.tissueHeal) < .15, `tissue mended ${tissueRate.toFixed(2)}/s`);
  assert.ok(sim.score > 0, 'mended tissue scores');
  node.health = 99.5;
  fly(sim, 2);
  assert.equal(node.health, 100, 'never past full');
  // Out of its field, nothing is mended.
  const far = sim.nodes[1];
  far.health = 50;
  fly(sim, 5);
  assert.equal(far.health, 50);
});

test('the Inner Ear resonance jams a drone near the floor', () => {
  const sim = solo('ear');
  sim.organ = { ...sim.organ, phase: 'active' };
  Object.assign(sim.drone, { x: sim.organ.x, z: sim.organ.z, mode: 'station', station: { x: sim.organ.x, z: sim.organ.z } });
  sim.player.health = 50;
  Object.assign(sim.player, { x: sim.organ.x, z: sim.organ.z });
  fly(sim, 1);
  assert.equal(sim.drone.jammed, true);
  assert.equal(sim.player.health, 50);
});

test('in co-op every suit brings its own companion and drones mend teammates', () => {
  const sim = new CoopSimulation([
    { id: 'a', name: 'A' }, { id: 'b', name: 'B', weaponLoadout: droneLoadout() }, { id: 'c', name: 'C' },
  ]);
  sim.start();
  sim.enemies = [];
  const [a, b, c] = sim.suits;
  assert.deepEqual(sim.suits.map(suit => suit.turretCharges), [1, 0, 1]);
  assert.ok(!a.drone && b.drone && !c.drone);
  // Both turret suits place their own turret.
  for (const suit of [a, c]) {
    suit.player.yaw = 0;
    assert.equal(sim.useCompanion(suit), true);
  }
  assert.equal(sim.turrets.length, 2);
  assert.notEqual(a.turret, c.turret);
  assert.equal(a.turret.ownerId, 'a');
  assert.equal(sim.useCompanion(a), false, 'one placement each');
  // B's drone mends A.
  Object.assign(b.player, { x: a.player.x + 1, z: a.player.z, yaw: 0 });
  fly(sim, 3);
  a.player.health = 40;
  fly(sim, 5);
  assert.ok(a.player.health > 44, 'the teammate is mended');
  const snapshot = sim.snapshotFor('a');
  assert.equal(snapshot.turrets.length, 2);
  assert.equal(snapshot.drones.length, 1);
  assert.equal(snapshot.drones[0].ownerId, 'b');
  assert.equal(snapshot.turret.ownerId, 'a', 'the HUD sees its own turret');
  assert.equal(sim.snapshotFor('b').companion, 'drone');
  assert.equal(sim.snapshotFor('b').turretCharges, 0);
});

test('a co-op checkpoint brings back every suit\'s own turret', () => {
  const sim = new CoopSimulation([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  sim.start();
  sim.enemies = [];
  for (const suit of sim.suits) sim.useCompanion(suit);
  const placed = sim.suits.map(suit => [suit.turret.x, suit.turret.z]);
  const checkpoint = sim.captureCheckpoint();
  const retry = new CoopSimulation([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  retry.start(checkpoint);
  assert.deepEqual(retry.suits.map(suit => [suit.turret.x, suit.turret.z]), placed);
  assert.deepEqual(retry.suits.map(suit => suit.turretCharges), [0, 0]);
});

test('a solo checkpoint keeps the turret\'s build', () => {
  const loadout = normalizeWeaponLoadout({ arsenal: { turret: { barrel: 'heavy-barrel' } } });
  const sim = new Simulation('artery', { weaponLoadout: loadout });
  sim.start();
  sim.tutorial = null;
  sim.phase = 'combat';
  sim.useCompanion();
  const retry = new Simulation('artery', { weaponLoadout: normalizeWeaponLoadout({}) });
  retry.start(sim.captureCheckpoint());
  assert.equal(retry.turret.build.barrel, 'heavy-barrel');
  assert.equal(retry.turret.stats.damage, sim.turret.stats.damage);
});
