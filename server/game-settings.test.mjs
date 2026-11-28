import assert from 'node:assert/strict';
import test from 'node:test';
import { OPTIONS, defaultSettings, loadSettings } from '../dist/game-settings.mjs';

test('options load their defaults, clamp saved ranges and reject unknown choices', () => {
  assert.deepEqual(loadSettings(() => null), defaultSettings());
  const saved = { brightness: '9', 'field-of-view': '70', 'frame-limit': '999', bloom: 'false', 'aim-mode': 'toggle' };
  const values = loadSettings(key => saved[key.replace('immune-protocol.setting.', '')] ?? null);
  assert.equal(values.brightness, 1.6);
  assert.equal(values['field-of-view'], 70);
  assert.equal(values['frame-limit'], '0');
  assert.equal(values.bloom, false);
  assert.equal(values['aim-mode'], 'toggle');
});

test('every option has a group, a label and a default inside its own range', () => {
  for (const option of OPTIONS) {
    assert.ok(option.group && option.label, option.id);
    if (option.type === 'range') assert.ok(option.value >= option.min && option.value <= option.max, option.id);
    if (option.type === 'select') assert.ok(option.options.some(([value]) => value === option.value), option.id);
  }
  assert.equal(defaultSettings()['field-of-view'], 80, 'the default view of a modern shooter');
});
