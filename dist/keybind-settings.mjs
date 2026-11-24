// The Key bindings section of the settings dialog: one row per action; press its button, then
// the new key (Esc cancels). Also keeps every on-screen key label (field manual, HUD) in step.
import { KEY_ACTIONS, RESERVED_KEYS, actionKey, keyLabel, onBindsChange, resetBinds, setBind, bindOf } from './keybinds.mjs';

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
  };

  const stop = () => {
    capturing = null;
    delete document.documentElement.dataset.rebinding;
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
      capturing = capturing === action ? null : action;
      if (capturing) document.documentElement.dataset.rebinding = action;
      else delete document.documentElement.dataset.rebinding;
      draw();
    });
    row.append(name, button);
    list.append(row);
    buttons.set(action, button);
  }
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
    if (!capturing) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.code === 'Escape') { stop(); return; }
    if (RESERVED_KEYS.includes(event.code) || !event.code) return;
    setBind(capturing, event.code);
    stop();
  }, { capture: true });
  dialog.addEventListener('close', stop);
  onBindsChange(draw);
  draw();
  return { reset() { stop(); resetBinds(); }, draw };
}
