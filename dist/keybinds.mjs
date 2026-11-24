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

// ------------------------------------------------------------------- controller buttons
// Standard-mapping button indices. Menu (9) always pauses and the menus keep A/B/D-pad, so a bad
// binding can never lock anyone out of play or the menus.
const PAD_KEY = 'immune-protocol.padbinds';
export const PAD_ACTIONS = Object.freeze([
  ['fire', 'Fire (hold)', 7],
  ['aim', 'Aim (hold)', 6],
  ['sprint', 'Sprint (hold)', 10],
  ['jump', 'Jump', 0],
  ['dash', 'Dash', 1],
  ['reload', 'Reload', 2],
  ['swap', 'Switch weapon', 3],
  ['repair', 'Repair (hold)', 4],
  ['turret', 'Turret (hold to move)', 5],
  ['melee', 'Bash', 11],
  ['grenade', 'Antibody grenade', 12],
  ['stun', 'Stun charge', 13],
].map(Object.freeze));
export const PAD_RESERVED = Object.freeze([9]);
const PAD_DEFAULTS = Object.fromEntries(PAD_ACTIONS.map(([action, , button]) => [action, button]));
// Button names per controller family, by standard-mapping index. Nintendo names follow the
// printed labels, which sit in different places from Xbox's (the bottom face button is B).
const DPAD = ['D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →'];
export const PAD_FAMILIES = Object.freeze({
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', ...DPAD, 'Guide'],
  playstation: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', ...DPAD, 'PS'],
  nintendo: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'L-stick', 'R-stick', ...DPAD, 'Home'],
});
let padFamily = 'xbox';

// Which family a controller belongs to, from the id the browser reports.
export function padFamilyOf(id = '') {
  if (/054c|playstation|dualsense|dualshock|ps[345]\b/i.test(id)) return 'playstation';
  if (/057e|nintendo|pro controller|joy-?con|switch/i.test(id)) return 'nintendo';
  return 'xbox';
}
export function setPadFamily(family) {
  const next = PAD_FAMILIES[family] ? family : 'xbox';
  if (next === padFamily) return false;
  padFamily = next;
  for (const listener of listeners) listener(currentBinds());
  return true;
}
export function currentPadFamily() {
  return padFamily;
}

function loadPad() {
  const pad = { ...PAD_DEFAULTS };
  try {
    const saved = JSON.parse(readSetting(PAD_KEY) ?? '{}');
    for (const [action, button] of Object.entries(saved ?? {})) {
      if (Object.hasOwn(PAD_DEFAULTS, action) && Number.isInteger(button) && button >= 0 && button <= 16 && !PAD_RESERVED.includes(button)) pad[action] = button;
    }
  } catch { /* Defaults. */ }
  return pad;
}
let padBinds = loadPad();

export function padButtonOf(action) {
  return padBinds[action];
}
export function padLabel(button) {
  return PAD_FAMILIES[padFamily][button] ?? 'Button ' + button;
}
export function padActionKey(action) {
  return padLabel(padBinds[action]);
}
// Held / just pressed, from a GamepadInput poll's raw masks.
export function padHeld(state, action) {
  return Boolean(state?.buttons & (1 << padBinds[action]));
}
export function padPressed(state, action) {
  return Boolean(state?.edges & (1 << padBinds[action]));
}
export function setPadBind(action, button) {
  if (!Object.hasOwn(PAD_DEFAULTS, action) || PAD_RESERVED.includes(button) || !(button >= 0 && button <= 16)) return false;
  const holder = Object.keys(padBinds).find(other => padBinds[other] === button);
  if (holder && holder !== action) padBinds[holder] = padBinds[action];
  padBinds[action] = button;
  savePad();
  return true;
}
export function resetPadBinds() {
  padBinds = { ...PAD_DEFAULTS };
  savePad();
}
function savePad() {
  writeSetting(PAD_KEY, JSON.stringify(padBinds));
  for (const listener of listeners) listener(currentBinds());
}
