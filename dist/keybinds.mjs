// Keyboard bindings: which key performs each action. Defaults below; players rebind them in
// Settings and the choice is saved in the browser. Esc always pauses and the arrow keys always
// look, so a bad binding can never lock anyone out. Mouse buttons are fixed.
import { readSetting, writeSetting } from './settings-store.mjs';

const KEY = 'immune-protocol.keybinds';

// [action, label, default key code]
export const KEY_ACTIONS = Object.freeze([
  ['forward', 'Move forward', 'KeyW'],
  ['back', 'Move back', 'KeyS'],
  ['left', 'Move left', 'KeyA'],
  ['right', 'Move right', 'KeyD'],
  ['sprint', 'Sprint', 'ShiftLeft'],
  ['jump', 'Jump', 'Space'],
  ['dash', 'Dash', 'KeyC'],
  ['melee', 'Bash', 'KeyV'],
  ['grenade', 'Antibody grenade', 'KeyG'],
  ['stun', 'Stun charge', 'KeyT'],
  ['reload', 'Reload', 'KeyR'],
  ['repair', 'Repair (hold)', 'KeyE'],
  ['turret', 'Turret (hold to move)', 'KeyQ'],
  ['primary', 'Primary weapon', 'Digit1'],
  ['secondary', 'Secondary weapon', 'Digit2'],
  ['fire', 'Fire (keyboard)', 'Enter'],
  ['pause', 'Pause', 'KeyP'],
].map(Object.freeze));

const DEFAULTS = Object.fromEntries(KEY_ACTIONS.map(([action, , code]) => [action, code]));
// Keys that always do their job and cannot be bound to anything else.
export const RESERVED_KEYS = Object.freeze(['Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

function load() {
  const binds = { ...DEFAULTS };
  try {
    const saved = JSON.parse(readSetting(KEY) ?? '{}');
    for (const [action, code] of Object.entries(saved ?? {})) {
      if (Object.hasOwn(DEFAULTS, action) && typeof code === 'string' && code && !RESERVED_KEYS.includes(code)) binds[action] = code;
    }
  } catch { /* A malformed setting falls back to the defaults. */ }
  return binds;
}

let binds = load();
const listeners = new Set();

export function bindOf(action) {
  return binds[action];
}

// The action a key performs, or null. Right Shift sprints alongside a Shift binding.
export function actionFor(code) {
  for (const [action, bound] of Object.entries(binds)) if (bound === code) return action;
  if (code === 'ShiftRight' && binds.sprint === 'ShiftLeft') return 'sprint';
  return null;
}

export function isDown(keys, action) {
  const code = binds[action];
  return keys.has(code) || (action === 'sprint' && code === 'ShiftLeft' && keys.has('ShiftRight'));
}

// Binds a key to an action; the action that had the key takes this one's old key (a swap).
export function setBind(action, code) {
  if (!Object.hasOwn(DEFAULTS, action) || RESERVED_KEYS.includes(code)) return false;
  const holder = Object.keys(binds).find(other => binds[other] === code);
  if (holder && holder !== action) binds[holder] = binds[action];
  binds[action] = code;
  save();
  return true;
}

export function resetBinds() {
  binds = { ...DEFAULTS };
  save();
}

export function currentBinds() {
  return { ...binds };
}

export function onBindsChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function save() {
  writeSetting(KEY, JSON.stringify(binds));
  for (const listener of listeners) listener(currentBinds());
}

const NAMES = {
  Space: 'Space', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab', Backspace: 'Backspace', CapsLock: 'Caps',
  ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'Alt', AltRight: 'R-Alt',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
};

// A short, readable name for a key code: 'KeyG' -> 'G', 'Digit1' -> '1', 'Numpad4' -> 'Num 4'.
export function keyLabel(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function actionKey(action) {
  return keyLabel(binds[action]);
}
