import assert from 'node:assert/strict';
import test from 'node:test';
import { GamepadInput } from '../dist/gamepad.mjs';

function controller(overrides = {}) {
  return {
    id: 'Xbox Wireless Controller',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })),
    ...overrides,
  };
}

function setButton(pad, index, value) {
  pad.buttons[index] = { value, pressed: value === 1 };
}

test('maps the Xbox layout with rising edges for buttons and held combat actions', () => {
  const pad = controller();
  const input = new GamepadInput(() => [pad]);
  assert.equal(input.poll().connected, true);

  for (const index of [0, 1, 2, 4, 5, 9, 10, 12, 15]) setButton(pad, index, 1);
  setButton(pad, 6, .28);
  setButton(pad, 7, .35);
  pad.axes[0] = -1;
  const current = input.poll();
  assert.deepEqual(current.pressed, {
    confirm: true, back: true, pause: true, reload: true, swap: false, deploy: true,
    up: true, down: false, left: false, right: true,
  });
  assert.equal(current.moveX, -1);
  assert.equal(current.menuX, 1);
  assert.equal(current.menuY, -1);
  assert.ok(current.active && current.aim && current.fire && current.repair && current.sprint);

  const held = input.poll();
  assert.ok(Object.values(held.pressed).every(pressed => !pressed));
  assert.equal(held.fire, true);

  setButton(pad, 2, 0);
  input.poll();
  setButton(pad, 2, 1);
  assert.equal(input.poll().pressed.reload, true);
});

test('uses radial dead zones and keeps diagonal movement and looking normalized', () => {
  const pad = controller({ axes: [.1, -.1, .13, .13] });
  const input = new GamepadInput(() => [pad]);
  const idle = input.poll();
  assert.equal(idle.active, false);
  assert.equal(idle.moveZ, 0);
  assert.equal(idle.lookY, 0);

  pad.axes = [1, -1, -1, 1];
  const diagonal = input.poll();
  assert.ok(diagonal.moveX > 0 && diagonal.moveZ > 0 && diagonal.lookX < 0 && diagonal.lookY > 0);
  assert.ok(Math.abs(Math.hypot(diagonal.moveX, diagonal.moveZ) - 1) < Number.EPSILON);
  assert.ok(Math.abs(Math.hypot(diagonal.lookX, diagonal.lookY) - 1) < Number.EPSILON);

  pad.axes = [.55, 0, .55, 0];
  const partial = input.poll();
  assert.ok(partial.lookX > 0 && partial.lookX < partial.moveX);
});

test('holds cross-screen actions until release without blocking other controls', () => {
  const pad = controller({ axes: [0, -1, 0, 0] });
  const input = new GamepadInput(() => [pad]);
  setButton(pad, 0, 1);
  setButton(pad, 7, 1);
  const connected = input.poll();
  assert.equal(connected.active, true);
  assert.equal(connected.moveZ, 0);
  assert.equal(connected.fire, false);
  assert.equal(connected.pressed.confirm, false);

  setButton(pad, 13, 1);
  assert.equal(input.poll().pressed.down, true);
  input.reset();
  setButton(pad, 2, 1);
  const afterReset = input.poll();
  assert.equal(afterReset.pressed.down, false);
  assert.equal(afterReset.menuY, 0);
  assert.equal(afterReset.pressed.reload, true);

  pad.axes[1] = 0;
  setButton(pad, 0, 0);
  setButton(pad, 7, 0);
  input.poll();
  pad.axes[1] = -1;
  setButton(pad, 0, 1);
  setButton(pad, 7, 1);
  const newInput = input.poll();
  assert.equal(newInput.moveZ, 1);
  assert.equal(newInput.fire, true);
  assert.equal(newInput.pressed.confirm, true);
});

test('prefers Xbox among new devices and clears input when the browser loses access', () => {
  const pad = controller({ index: 2 });
  const other = controller({ id: 'Other controller' });
  let allowed = true;
  let devices = [other, null, pad];
  const input = new GamepadInput(() => {
    if (!allowed) throw new Error('Gamepad API denied');
    return devices;
  });
  input.poll();
  setButton(other, 0, 1);
  setButton(pad, 2, 1);
  const xbox = input.poll();
  assert.equal(xbox.pressed.reload, true);
  assert.equal(xbox.pressed.confirm, false);

  devices = [other];
  const replaced = input.poll();
  assert.equal(replaced.disconnected, true);
  assert.equal(replaced.connected, true);
  assert.equal(replaced.pressed.confirm, false);

  allowed = false;
  assert.equal(input.poll().disconnected, true);
  const missing = input.poll();
  assert.equal(missing.connected, false);
  assert.equal(missing.disconnected, false);
  assert.equal(missing.active, false);
});
