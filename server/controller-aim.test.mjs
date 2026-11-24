import assert from 'node:assert/strict';
import test from 'node:test';
import { AimAssist, bearing } from '../dist/aim-assist.mjs';
import { GamepadInput, SprintLatch, LOOK_CURVES } from '../dist/gamepad.mjs';
import { PAD_FAMILIES, padFamilyOf, padLabel, padActionKey, setPadFamily, currentPadFamily } from '../dist/keybinds.mjs';

const TURN = .00225;
// The player looks down -Z (yaw 0); a pathogen dead ahead, 20 units out, at eye height.
const player = () => ({ x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0 });
const ahead = (x = 0) => ({ id: 1, x, y: 1.6, z: -20, radius: 1, health: 50 });

test('the bearing of a point dead ahead matches the view', () => {
  const aim = bearing(player(), ahead());
  assert.ok(Math.abs(aim.yaw) < 1e-9 && Math.abs(aim.pitch) < 1e-9);
  assert.ok(Math.abs(aim.distance - 20) < 1e-9);
});

test('slowdown holds the stick back over a target, more when aiming, and not off target', () => {
  const assist = new AimAssist();
  const hip = assist.apply({ player: player(), enemies: [ahead()], lookX: 10, lookY: 0, turn: TURN });
  assist.reset();
  const ads = assist.apply({ player: player(), enemies: [ahead()], lookX: 10, lookY: 0, aiming: true, turn: TURN });
  assert.ok(hip.lookX < 10 && ads.lookX < hip.lookX);
  assist.reset();
  const away = assist.apply({ player: player(), enemies: [ahead(15)], lookX: 10, lookY: 0, turn: TURN });
  assert.equal(away.lookX, 10);
  assert.deepEqual(assist.apply({ mode: 'off', player: player(), enemies: [ahead()], lookX: 10, lookY: 0, turn: TURN }), { lookX: 10, lookY: 0 });
});

test('rotational assist follows a moving target only while the player is steering', () => {
  const view = player();
  const assist = new AimAssist();
  assist.apply({ player: view, enemies: [ahead(0)], lookX: 0, lookY: 0, moving: true, turn: TURN });
  // The pathogen slides right; the view should turn right (yaw decreases, so lookX is positive).
  const followed = assist.apply({ player: view, enemies: [ahead(.4)], lookX: 0, lookY: 0, moving: true, turn: TURN });
  assert.ok(followed.lookX > 0);

  const idle = new AimAssist();
  idle.apply({ player: view, enemies: [ahead(0)], lookX: 0, lookY: 0, turn: TURN });
  assert.deepEqual(idle.apply({ player: view, enemies: [ahead(.4)], lookX: 0, lookY: 0, turn: TURN }), { lookX: 0, lookY: 0 });

  const precision = new AimAssist();
  precision.apply({ mode: 'precision', player: view, enemies: [ahead(0)], lookX: 0, lookY: 0, moving: true, turn: TURN });
  assert.equal(precision.apply({ mode: 'precision', player: view, enemies: [ahead(.4)], lookX: 0, lookY: 0, moving: true, turn: TURN }).lookX, 0);
});

test('hidden, dead and far pathogens get no help', () => {
  const assist = new AimAssist();
  for (const enemy of [{ ...ahead(), hidden: true }, { ...ahead(), health: 0 }, { ...ahead(), z: -200 }]) {
    assert.equal(assist.apply({ player: player(), enemies: [enemy], lookX: 10, lookY: 0, turn: TURN }).lookX, 10);
  }
});

function pad(axes) {
  return { id: 'Xbox Wireless Controller', index: 0, connected: true, mapping: 'standard', axes, buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })) };
}

test('stick dead zones and the look curve follow settings', () => {
  const controller = pad([0, 0, 0, 0]);
  const input = new GamepadInput(() => [controller]);
  input.poll(); // Sticks held when a controller is first seen are ignored, so start centred.
  controller.axes = [.15, 0, .5, 0];
  const standard = input.poll();
  assert.equal(standard.moveX, 0, 'inside the default dead zone');
  input.configure({ moveDeadZone: .05, curve: 'linear' });
  const tuned = input.poll();
  assert.ok(tuned.moveX > 0);
  assert.ok(tuned.lookX > standard.lookX, 'linear answers a half push more strongly than the default curve');
  assert.ok(LOOK_CURVES.precise > LOOK_CURVES.standard);
});

test('sprint can be held, tapped on and off, or automatic', () => {
  const forward = { moveX: 0, moveZ: 1, aim: false };
  const sprint = new SprintLatch();
  assert.equal(sprint.update(forward, 'hold', true, true), true);
  assert.equal(sprint.update(forward, 'hold', false, false), false);
  assert.equal(sprint.update(forward, 'toggle', false, true), true);
  assert.equal(sprint.update(forward, 'toggle', false, false), true, 'stays on after the tap');
  assert.equal(sprint.update({ ...forward, aim: true }, 'toggle', false, false), false, 'aiming ends it');
  assert.equal(sprint.update(forward, 'toggle', false, false), false);
  sprint.update(forward, 'toggle', false, true);
  assert.equal(sprint.update({ moveX: 0, moveZ: 0, aim: false }, 'toggle', false, false), false, 'letting go of the stick ends it');
  assert.equal(sprint.update(forward, 'auto', false, false), true);
  assert.equal(sprint.update({ moveX: 0, moveZ: .7, aim: false }, 'auto', false, false), false, 'a partial push walks');
});

test('button names follow the controller family', () => {
  assert.equal(padFamilyOf('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'), 'playstation');
  assert.equal(padFamilyOf('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)'), 'nintendo');
  assert.equal(padFamilyOf('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)'), 'xbox');
  for (const names of Object.values(PAD_FAMILIES)) assert.equal(names.length, 17);
  try {
    setPadFamily('playstation');
    assert.equal(currentPadFamily(), 'playstation');
    assert.equal(padLabel(0), '✕');
    assert.equal(padActionKey('fire'), 'R2');
    setPadFamily('nintendo');
    assert.equal(padLabel(0), 'B', 'the bottom face button is B on Nintendo pads');
  } finally {
    setPadFamily('xbox');
  }
  assert.equal(padActionKey('repair'), 'LB');
});
