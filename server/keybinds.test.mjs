import assert from 'node:assert/strict';
import test from 'node:test';
import { KEY_ACTIONS, actionFor, bindOf, isDown, keyLabel, resetBinds, setBind } from '../dist/keybinds.mjs';

test('default bindings, swaps on conflict, reserved keys and readable labels', () => {
  resetBinds();
  assert.equal(actionFor('KeyC'), 'dash');
  assert.equal(actionFor('ShiftRight'), 'sprint', 'right Shift sprints with the Shift default');
  assert.ok(setBind('dash', 'KeyX'));
  assert.equal(actionFor('KeyX'), 'dash');
  assert.equal(actionFor('KeyC'), null);
  assert.ok(setBind('jump', 'KeyX'));
  assert.equal(bindOf('jump'), 'KeyX');
  assert.equal(bindOf('dash'), 'Space', 'the displaced action takes the old key');
  assert.equal(setBind('jump', 'Escape'), false, 'Esc always pauses');
  assert.ok(isDown(new Set(['KeyX']), 'jump'));
  assert.equal(new Set(KEY_ACTIONS.map(([, , code]) => code)).size, KEY_ACTIONS.length, 'defaults do not collide');
  assert.deepEqual(['KeyG', 'Digit1', 'Space', 'ShiftLeft', 'Numpad4', 'ArrowUp'].map(keyLabel), ['G', '1', 'Space', 'Shift', 'Num 4', '↑']);
  resetBinds();
  assert.equal(bindOf('jump'), 'Space');
});
