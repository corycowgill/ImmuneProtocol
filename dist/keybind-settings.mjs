// The Key bindings section of the settings dialog: one row per action; press its button, then
// the new key (Esc cancels). Also keeps every on-screen key label (field manual, HUD) in step.
import { KEY_ACTIONS, PAD_ACTIONS, PAD_RESERVED, RESERVED_KEYS, actionKey, keyLabel, onBindsChange, padActionKey, padButtonOf, padLabel, resetBinds, resetPadBinds, setBind, setPadBind, bindOf } from './keybinds.mjs';

export function createKeybindSettings(dialog, document = globalThis.document) {
  const list = dialog.querySelector('.settings-list');
  const heading = document.createElement('h3');
  heading.className = 'settings-group';
  heading.textContent = 'Key bindings';
  list.append(heading);
  const buttons = new Map();
  let capturing = null;

  const draw = () => {
    for (const [action, label] of KEY_ACTIONS) {
      const button = buttons.get(action);
      const text = label + ': ' + (capturing === action ? 'press a key…' : keyLabel(bindOf(action)));
      if (button.textContent !== text) button.textContent = text;
      button.setAttribute('aria-pressed', String(capturing === action));
    }
    for (const kbd of document.querySelectorAll('[data-bind]')) {
      const text = (kbd.dataset.bindPrefix ?? '') + actionKey(kbd.dataset.bind);
      if (kbd.textContent !== text) kbd.textContent = text;
    }
    // Controller labels follow both the bindings and the kind of controller in use.
    for (const kbd of document.querySelectorAll('[data-pad], [data-pad-button]')) {
      const label = kbd.dataset.pad ? padActionKey(kbd.dataset.pad) : padLabel(Number(kbd.dataset.padButton));
      const text = (kbd.dataset.padPrefix ?? '') + label;
      if (kbd.textContent !== text) kbd.textContent = text;
    }
  };

  const stop = () => {
    capturing = null;
    if (!document.documentElement.dataset.rebinding?.startsWith('pad:')) delete document.documentElement.dataset.rebinding;
    draw();
  };

  for (const [action, label] of KEY_ACTIONS) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    const name = document.createElement('span');
    name.textContent = label;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button outline setting-toggle';
    button.id = 'keybind-' + action;
    button.addEventListener('click', () => {
      if (padCapturing) stopPad();
      capturing = capturing === action ? null : action;
      if (capturing) document.documentElement.dataset.rebinding = action;
      else delete document.documentElement.dataset.rebinding;
      draw();
    });
    row.append(name, button);
    list.append(row);
    buttons.set(action, button);
  }
  // Controller buttons: press a row, then the controller button (the button you used to choose the
  // row must be released first). Esc or choosing the row again cancels.
  const padHeading = document.createElement('h3');
  padHeading.className = 'settings-group';
  padHeading.textContent = 'Controller buttons';
  list.append(padHeading);
  const padButtons = new Map();
  let padCapturing = null;
  let padHeldAtStart = 0;
  const readPad = () => {
    let mask = 0;
    for (const pad of Array.from(globalThis.navigator?.getGamepads?.() ?? [])) {
      if (!pad?.connected) continue;
      pad.buttons.forEach((button, index) => { if (index <= 16 && (button.pressed || button.value > .5)) mask |= 1 << index; });
    }
    return mask;
  };
  const drawPad = () => {
    for (const [action, label] of PAD_ACTIONS) {
      const button = padButtons.get(action);
      const text = label + ': ' + (padCapturing === action ? 'press a button…' : padLabel(padButtonOf(action)));
      if (button.textContent !== text) button.textContent = text;
      button.setAttribute('aria-pressed', String(padCapturing === action));
    }
  };
  const stopPad = () => {
    padCapturing = null;
    if (!capturing) delete document.documentElement.dataset.rebinding;
    drawPad();
  };
  const pollPad = () => {
    if (!padCapturing) return;
    const held = readPad();
    padHeldAtStart &= held;
    const fresh = held & ~padHeldAtStart;
    if (fresh) {
      const index = Math.log2(fresh & -fresh);
      if (!PAD_RESERVED.includes(index)) { setPadBind(padCapturing, index); stopPad(); return; }
    }
    requestAnimationFrame(pollPad);
  };
  for (const [action, label] of PAD_ACTIONS) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    const name = document.createElement('span');
    name.textContent = label;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button outline setting-toggle';
    button.id = 'padbind-' + action;
    button.addEventListener('click', () => {
      if (padCapturing === action) { stopPad(); return; }
      stop();
      padCapturing = action;
      padHeldAtStart = readPad();
      document.documentElement.dataset.rebinding = 'pad:' + action;
      drawPad();
      requestAnimationFrame(pollPad);
    });
    row.append(name, button);
    list.append(row);
    padButtons.set(action, button);
  }
  const padResetRow = document.createElement('div');
  padResetRow.className = 'setting-row';
  const padReset = document.createElement('button');
  padReset.type = 'button';
  padReset.className = 'button outline setting-toggle';
  padReset.id = 'padbind-reset';
  padReset.textContent = 'Reset controller buttons';
  padReset.addEventListener('click', () => { stopPad(); resetPadBinds(); });
  padResetRow.append(padReset);
  list.append(padResetRow);

  const resetRow = document.createElement('div');
  resetRow.className = 'setting-row';
  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'button outline setting-toggle';
  resetButton.id = 'keybind-reset';
  resetButton.textContent = 'Reset key bindings';
  resetButton.addEventListener('click', () => { stop(); resetBinds(); });
  resetRow.append(resetButton);
  list.append(resetRow);

  // Captures the next key press while a binding is being changed, ahead of every other handler.
  document.defaultView.addEventListener('keydown', event => {
    if (padCapturing && event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); stopPad(); return; }
    if (!capturing) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.code === 'Escape') { stop(); return; }
    if (RESERVED_KEYS.includes(event.code) || !event.code) return;
    setBind(capturing, event.code);
    stop();
  }, { capture: true });
  dialog.addEventListener('close', () => { stop(); stopPad(); });
  onBindsChange(() => { draw(); drawPad(); });
  draw();
  drawPad();
  return { reset() { stop(); stopPad(); resetBinds(); resetPadBinds(); }, draw };
}
