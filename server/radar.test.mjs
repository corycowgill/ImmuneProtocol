import assert from 'node:assert/strict';
import test from 'node:test';
import { radarSnapshot, RADAR_RANGE } from '../dist/radar.mjs';

// A suit at the origin; yaw 0 faces -z (the game's forward), and its right is +x.
const suit = (yaw = 0) => ({ id: 'me', x: 0, y: 1.7, z: 0, yaw, health: 100 });
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('the tracker puts what is ahead at the top and what is to the right on the right, whichever way the suit faces', () => {
  const enemies = [
    { x: 0, y: 1.6, z: -15, health: 60, radius: .9 },  // ahead
    { x: 15, y: 1.6, z: 0, health: 60, radius: .9 },   // to the right
    { x: 0, y: 1.6, z: 15, health: 60, radius: .9 },   // behind
  ];
  const [ahead, right, behind] = radarSnapshot({ player: suit(), enemies }).contacts;
  assert.ok(near(ahead.x, 0) && near(ahead.y, .5));
  assert.ok(near(right.x, .5) && near(right.y, 0));
  assert.ok(near(behind.y, -.5));
  // Turned a quarter to the left (yaw +90°), the suit faces -x: the enemy at +x is now behind it.
  const turned = radarSnapshot({ player: suit(Math.PI / 2), enemies }).contacts;
  assert.ok(near(turned[1].x, 0) && near(turned[1].y, -.5));
  assert.ok(near(turned[0].x, .5), 'what was ahead is now on the right');
});

test('the tracker shows threats in range, keeps objectives and squadmates on the rim, and hints at height', () => {
  const sim = {
    player: suit(), clock: 3,
    enemies: [
      { x: 0, y: 1.6, z: -(RADAR_RANGE + 5), health: 60 },               // out of range: not shown
      { x: 0, y: 6, z: -10, health: 36, radius: .73 },                   // high above
      { x: 0, y: 1.6, z: -10, health: 0 },                               // dead
      { x: 0, y: 1.6, z: -10, health: 60, hidden: true },                // burrowed
      { x: 0, y: 2, z: -60, health: 3000, boss: 'thrombus', radius: 2.6 }, // boss far off: on the rim
      { x: 5, y: 1, z: 0, health: 300, nest: true },
    ],
    nodes: [{ x: 0, z: -80, health: 30, underAttack: true }, { x: 10, z: 0, health: 100 }],
    pickups: [{ x: -5, z: 0 }],
    players: [suit(), { id: 'mate', x: 0, y: 1.7, z: 200, health: 80 }, { id: 'down', x: 3, z: 0, health: 0 }],
    turret: { x: 2, z: 2, ownerId: 'me' },
  };
  sim.players[0] = sim.player;
  const { contacts, time } = radarSnapshot(sim);
  const kinds = contacts.map(c => c.kind).sort();
  assert.deepEqual(kinds, ['ally', 'boss', 'cache', 'enemy', 'nest', 'node', 'node', 'turret']);
  assert.equal(contacts.find(c => c.kind === 'enemy').level, 'above');
  const boss = contacts.find(c => c.kind === 'boss');
  assert.ok(boss.rim && near(boss.y, 1));
  const far = contacts.find(c => c.kind === 'node' && c.rim);
  assert.equal(far.attacked, true);
  assert.ok(contacts.find(c => c.kind === 'ally').rim, 'a squadmate out of range points the way from the rim');
  assert.equal(time, 3);
  assert.equal(radarSnapshot(sim, { reduceMotion: true }).time, null, 'no sweeping ping with reduced motion');
  // Hidden nodes stay off it: the airway objective, and all but the first during training.
  assert.equal(radarSnapshot({ ...sim, airway: {} }).contacts.filter(c => c.kind === 'node').length, 0);
  assert.equal(radarSnapshot({ ...sim, tutorial: 'observe' }).contacts.filter(c => c.kind === 'node').length, 1);
});
