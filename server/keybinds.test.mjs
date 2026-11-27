import assert from 'node:assert/strict';
import test from 'node:test';
import { KEY_ACTIONS, actionFor, bindOf, isDown, keyLabel, resetBinds, setBind } from '../dist/keybinds.mjs';

test('default bindings, swaps on conflict, reserved keys and readable labels', () => {
  resetBinds();
  assert.equal(actionFor('KeyC'), 'dash');
  assert.equal(actionFor('ShiftRight'), 'sprint', 'right Shift sprints with the Shift default');
  assert.ok(setBind('dash', 'KeyB'));
  assert.equal(actionFor('KeyB'), 'dash');
  assert.equal(actionFor('KeyC'), null);
  assert.ok(setBind('jump', 'KeyB'));
  assert.equal(bindOf('jump'), 'KeyB');
  assert.equal(bindOf('dash'), 'Space', 'the displaced action takes the old key');
  assert.equal(setBind('jump', 'Escape'), false, 'Esc always pauses');
  assert.ok(isDown(new Set(['KeyB']), 'jump'));
  assert.equal(new Set(KEY_ACTIONS.map(([, , code]) => code)).size, KEY_ACTIONS.length, 'defaults do not collide');
  assert.deepEqual(['KeyG', 'Digit1', 'Space', 'ShiftLeft', 'Numpad4', 'ArrowUp'].map(keyLabel), ['G', '1', 'Space', 'Shift', 'Num 4', '↑']);
  resetBinds();
  assert.equal(bindOf('jump'), 'Space');
});

test('controller bindings: held and pressed from raw masks, swaps, Menu reserved', async () => {
  const { padButtonOf, padHeld, padPressed, resetPadBinds, setPadBind, padActionKey } = await import('../dist/keybinds.mjs');
  resetPadBinds();
  assert.equal(padButtonOf('jump'), 0);
  assert.ok(padPressed({ edges: 1 << 0 }, 'jump'));
  assert.ok(padHeld({ buttons: 1 << 7 }, 'fire'));
  assert.ok(setPadBind('jump', 2));
  assert.equal(padButtonOf('reload'), 0, 'reload took jump\'s old button');
  assert.equal(padActionKey('jump'), 'X');
  assert.equal(setPadBind('dash', 9), false, 'Menu always pauses');
  resetPadBinds();
  assert.equal(padButtonOf('jump'), 0);
});
