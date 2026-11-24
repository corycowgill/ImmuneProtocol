// The options menu beyond the original handful (look sensitivity, quality, music, effects, mute).
// Each option is declared once here: the settings dialog gets a row for it, the value is saved in
// the browser, and every change is handed to the game as one plain object of current values.
import { readSetting, writeSetting } from './settings-store.mjs';

const KEY = 'immune-protocol.setting.';
const percent = value => Math.round(value * 100) + '%';
const times = value => value.toFixed(2) + '×';
const onOff = [['on', 'On'], ['off', 'Off']];

export const OPTIONS = Object.freeze([
  // Controls
  { id: 'invert-y', group: 'Controls', type: 'toggle', label: 'Invert vertical look', value: false },
  { id: 'aim-sensitivity', group: 'Controls', type: 'range', label: 'Aim sensitivity', min: .3, max: 1.5, step: .05, value: 1, format: times },
  { id: 'controller-sensitivity', group: 'Controls', type: 'range', label: 'Controller look speed', min: .5, max: 2, step: .05, value: 1, format: times },
  { id: 'ability-hints', group: 'Controls', type: 'toggle', label: 'Ability hints', value: true },
  { id: 'controller-vibration', group: 'Controls', type: 'range', label: 'Controller vibration', min: 0, max: 1, step: .05, value: 1, format: percent },
  { id: 'trigger-rumble', group: 'Controls', type: 'range', label: 'Trigger rumble (Xbox)', min: 0, max: 1, step: .05, value: .7, format: percent },
  { id: 'aim-mode', group: 'Controls', type: 'select', label: 'Aim down sights', value: 'hold', options: [['hold', 'Hold'], ['toggle', 'Toggle']] },
  // Video
  { id: 'brightness', group: 'Video', type: 'range', label: 'Brightness', min: .6, max: 1.6, step: .05, value: 1, format: percent },
  { id: 'field-of-view', group: 'Video', type: 'range', label: 'Field of view', min: 55, max: 90, step: 1, value: 61, format: value => Math.round(value) + '°' },
  { id: 'resolution-scale', group: 'Video', type: 'select', label: 'Resolution scale', value: 'auto',
    options: [['auto', 'Dynamic'], ['1', '100%'], ['0.85', '85%'], ['0.7', '70%'], ['0.5', '50%']] },
  { id: 'frame-limit', group: 'Video', type: 'select', label: 'Frame rate limit', value: '0',
    options: [['0', 'Display rate'], ['144', '144 FPS'], ['120', '120 FPS'], ['60', '60 FPS'], ['30', '30 FPS']] },
  { id: 'bloom', group: 'Video', type: 'toggle', label: 'Bloom', value: true, highOnly: true },
  { id: 'ambient-occlusion', group: 'Video', type: 'toggle', label: 'Ambient occlusion', value: true, highOnly: true },
  { id: 'vignette', group: 'Video', type: 'toggle', label: 'Vignette', value: true, highOnly: true },
  { id: 'film-grain', group: 'Video', type: 'toggle', label: 'Film grain', value: true, highOnly: true },
  { id: 'chromatic-aberration', group: 'Video', type: 'toggle', label: 'Chromatic aberration', value: true, highOnly: true },
  { id: 'show-fps', group: 'Video', type: 'toggle', label: 'Show frame rate', value: false },
  // Audio (master leads the group; ambience follows the existing effects slider)
  { id: 'master-volume', group: 'Audio', type: 'range', label: 'Master volume', min: 0, max: 1, step: .05, value: 1, format: percent, first: true },
  { id: 'ambience-volume', group: 'Audio', type: 'range', label: 'Ambience volume', min: 0, max: 1, step: .05, value: 1, format: percent },
  // Accessibility
  { id: 'camera-shake', group: 'Accessibility', type: 'range', label: 'Camera shake', min: 0, max: 1, step: .05, value: 1, format: percent },
  { id: 'damage-flash', group: 'Accessibility', type: 'range', label: 'Damage flash', min: 0, max: 1, step: .05, value: 1, format: percent },
  { id: 'reduce-motion', group: 'Accessibility', type: 'select', label: 'Reduce motion', value: 'system',
    options: [['system', 'Match system'], ...onOff] },
]);

const byId = new Map(OPTIONS.map(option => [option.id, option]));

function parse(option, raw) {
  if (raw == null) return option.value;
  if (option.type === 'toggle') return raw === 'true';
  if (option.type === 'range') {
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? Math.min(option.max, Math.max(option.min, value)) : option.value;
  }
  return option.options.some(([value]) => value === raw) ? raw : option.value;
}

export function defaultSettings() {
  return Object.fromEntries(OPTIONS.map(option => [option.id, option.value]));
}

export function loadSettings(read = readSetting) {
  return Object.fromEntries(OPTIONS.map(option => [option.id, parse(option, read(KEY + option.id))]));
}

// Builds the rows into the settings dialog and keeps them in step with the saved values.
// `apply(values, changedId)` runs once at start and after every change.
export function createSettings(dialog, apply) {
  const values = loadSettings();
  const list = dialog.querySelector('.settings-list');
  const controls = new Map();
  const headings = () => new Map([...list.querySelectorAll('h3.settings-group')].map(h => [h.textContent.trim(), h]));

  function groupEnd(heading) {
    let node = heading.nextElementSibling;
    while (node && !node.matches('h3.settings-group')) {
      if (!node.nextElementSibling || node.nextElementSibling.matches('h3.settings-group')) return node;
      node = node.nextElementSibling;
    }
    return heading;
  }

  for (const option of OPTIONS) {
    let heading = headings().get(option.group);
    if (!heading) {
      heading = document.createElement('h3');
      heading.className = 'settings-group';
      heading.textContent = option.group;
      list.append(heading);
    }
    const row = document.createElement('div');
    row.className = 'setting-row';
    row.dataset.option = option.id;
    const id = 'setting-' + option.id;
    if (option.type === 'toggle') {
      const label = document.createElement('span');
      label.textContent = option.label;
      const button = document.createElement('button');
      button.type = 'button';
      button.id = id;
      button.className = 'button outline setting-toggle';
      button.addEventListener('click', () => set(option.id, !values[option.id]));
      row.append(label, button);
      controls.set(option.id, button);
    } else {
      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = option.label;
      row.append(label);
      let control;
      if (option.type === 'range') {
        const output = document.createElement('output');
        output.id = id + '-value';
        output.htmlFor = id;
        output.setAttribute('aria-hidden', 'true');
        control = document.createElement('input');
        Object.assign(control, { type: 'range', id, min: option.min, max: option.max, step: option.step });
        control.addEventListener('input', () => set(option.id, control.valueAsNumber));
        row.append(output, control);
      } else {
        control = document.createElement('select');
        control.id = id;
        for (const [value, text] of option.options) control.append(new Option(text, value));
        control.addEventListener('change', () => set(option.id, control.value));
        row.append(control);
      }
      controls.set(option.id, control);
    }
    if (option.first) heading.after(row);
    else groupEnd(heading).after(row);
  }

  const note = document.createElement('small');
  note.id = 'setting-effects-note';
  note.textContent = 'Bloom, ambient occlusion, vignette, grain and aberration apply on High quality.';
  controls.get('chromatic-aberration').closest('.setting-row').after(note);

  function show(id) {
    const option = byId.get(id), control = controls.get(id), value = values[id];
    if (option.type === 'toggle') {
      control.setAttribute('aria-pressed', String(value));
      control.textContent = option.label + ': ' + (value ? 'On' : 'Off');
      control.setAttribute('aria-label', option.label);
    } else if (option.type === 'range') {
      control.value = value;
      const output = dialog.querySelector('#' + control.id + '-value');
      output.value = output.textContent = option.format(value);
    } else control.value = value;
  }

  function set(id, raw) {
    const option = byId.get(id);
    values[id] = option.type === 'range' ? parse(option, String(raw)) : option.type === 'toggle' ? !!raw : parse(option, raw);
    writeSetting(KEY + id, String(values[id]));
    show(id);
    apply({ ...values }, id);
  }

  for (const option of OPTIONS) show(option.id);
  apply({ ...values }, null);

  return {
    get values() { return { ...values }; },
    set,
    reset() {
      Object.assign(values, defaultSettings());
      for (const option of OPTIONS) {
        writeSetting(KEY + option.id, String(values[option.id]));
        show(option.id);
      }
      apply({ ...values }, null);
    },
  };
}
