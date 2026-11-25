// The armory screen: a gunsmith bench. The weapon turns on a full-height stage with a callout
// pinned to each attachment point; three modes share a side panel. Weapons picks what is carried,
// Gunsmith swaps parts, Customize handles finishes, skins, decals, stickers and charms. Stat bars
// under the weapon show the build and preview whatever option the pointer or focus is on.
import {
  TURRET_SLOTS, WEAPON_ORDER, WEAPON_SLOTS, WEAPON_TYPES, loadoutInSlot, loadoutWithBuild, loadoutWithTurret, loadoutWithWeapon,
  magazineCapacity, turretStats, weaponStats,
} from './weapon-mods.mjs';

const degrees = radians => radians * 180 / Math.PI;

// Each bar runs from `low` to `high`; `better` is the direction that helps the player.
export const ARMORY_STATS = [
  { id: 'damage', name: 'Damage', low: 0, high: 150, better: 1, value: stats => Math.round(stats.bodyDamage * stats.pellets + stats.splashDamage) },
  { id: 'critical', name: 'Critical', low: 0, high: 260, better: 1, value: stats => Math.round(stats.criticalDamage * stats.pellets + stats.splashDamage) },
  { id: 'rate', name: 'Fire rate', low: 0, high: 900, better: 1, unit: ' RPM', value: stats => Math.round(60 / stats.interval) },
  { id: 'capacity', name: 'Magazine', low: 0, high: 45, better: 1, unit: ' rds', value: (stats, capacity) => magazineCapacity(stats, capacity) },
  { id: 'reload', name: 'Reload', low: 0, high: 4.2, better: -1, unit: ' s', digits: 2, value: stats => stats.reloadSeconds },
  { id: 'crit-zone', name: 'Crit zone', low: 0, high: 60, better: 1, unit: '%', value: stats => Math.round(stats.aimCritical * 100) },
  { id: 'accuracy', name: 'Aimed spread', low: 0, high: 3.4, better: -1, unit: '°', digits: 2, value: stats => degrees(stats.aimSpread) },
  { id: 'hip', name: 'Hip spread', low: 0, high: 5.2, better: -1, unit: '°', digits: 1, value: stats => degrees(stats.hipSpread) },
  { id: 'mobility', name: 'Mobility', low: 80, high: 115, better: 1, unit: '%', value: stats => Math.round(stats.moveSpeed * 100) },
];

// The auto-turret's bars (turretStats numbers).
export const TURRET_ARMORY_STATS = [
  { id: 'turret-damage', name: 'Damage', low: 0, high: 40, better: 1, value: stats => Math.round(stats.damage) },
  { id: 'turret-rate', name: 'Fire rate', low: 0, high: 300, better: 1, unit: ' RPM', value: stats => Math.round(60 / stats.interval) },
  { id: 'turret-dps', name: 'Damage / s', low: 0, high: 120, better: 1, value: stats => Math.round(stats.damage / stats.interval) },
  { id: 'turret-range', name: 'Range', low: 0, high: 30, better: 1, unit: ' m', value: stats => Math.round(stats.range) },
  { id: 'turret-slow', name: 'Slow', low: 0, high: 3, better: 1, unit: ' s', digits: 1, value: stats => stats.slow },
  { id: 'turret-stagger', name: 'Stagger every', low: 0, high: 2, better: -1, unit: ' s', digits: 1, value: stats => stats.stagger },
];
const TURRET_TYPE = {
  name: 'Auto-turret', short: 'Turret', role: 'Sentry',
  detail: 'Deploys on clear ground and fires on its own. Hold the turret control to drag it anywhere.',
};

// Where each attachment callout sits on the stage, as fractions of its width and height.
const CALLOUT_SPOTS = {
  muzzle: [.11, .34], barrel: [.33, .17], optic: [.56, .1], receiver: [.83, .26], magazine: [.63, .7],
};
const MODES = [
  ['weapons', 'Weapons', 'Choose what you carry'],
  ['gunsmith', 'Gunsmith', 'Swap parts'],
  ['customize', 'Customize', 'Looks and charms'],
];

function element(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setText(node, value) {
  const text = String(value);
  if (node.textContent !== text) node.textContent = text;
}

// `locked(slot, id)` returns why a cosmetic is unavailable (an achievement reward not yet earned), or null.
export function createArmoryScreen({ document, dialog, art, cosmetics, cosmeticArt, getLoadout, equip, baseCapacity, locked = () => null }) {
  const byId = id => document.getElementById(id);
  const kicker = byId('armory-kicker');
  const modeTabs = byId('armory-modes');
  const stage = byId('armory-stage');
  const preview = byId('armory-preview');
  const leaders = byId('armory-leaders');
  const calloutLayer = byId('armory-callouts');
  const plate = { role: byId('armory-class'), name: byId('armory-weapon-name'), detail: byId('armory-weapon-detail') };
  const statList = byId('armory-stats');
  const panelTitle = byId('armory-panel-title');
  const panelNote = byId('armory-panel-note');
  const subtabs = byId('armory-subtabs');
  const items = byId('armory-items');
  const options = byId('armory-options');
  const reset = byId('armory-reset');

  const state = { mode: 'gunsmith', editing: 'primary', part: Object.keys(WEAPON_SLOTS)[0], cosmetic: Object.keys(cosmetics)[0], preview: null };
  const turretEditing = () => state.editing === 'turret';
  // The turret edits as a build tagged weapon 'turret'; the carried weapons as their loadouts.
  const edited = () => turretEditing() ? { weapon: 'turret', ...getLoadout().arsenal.turret } : loadoutInSlot(getLoadout(), state.editing);
  const statsOf = loadout => loadout.weapon === 'turret' ? turretStats(loadout) : weaponStats(loadout);
  const statList_ = () => turretEditing() ? TURRET_ARMORY_STATS : ARMORY_STATS;
  const partSlots = () => turretEditing() ? TURRET_SLOTS : WEAPON_SLOTS;
  const withPart = (slot, option) => turretEditing() ? { ...edited(), [slot]: option }
    : loadoutInSlot(loadoutWithBuild(getLoadout(), edited().weapon, { [slot]: option }), state.editing);
  const equipPart = (slot, option) => {
    if (locked(slot, option)) return;
    equip(turretEditing() ? loadoutWithTurret(getLoadout(), { [slot]: option })
      : loadoutWithBuild(getLoadout(), edited().weapon, { [slot]: option }));
  };

  // --- mode tabs
  for (const [mode, label, hint] of MODES) {
    const tab = element(document, 'button', 'gs-mode');
    tab.type = 'button';
    tab.dataset.mode = mode;
    tab.setAttribute('role', 'tab');
    tab.append(element(document, 'strong', '', label), element(document, 'span', '', hint));
    tab.addEventListener('click', () => {
      state.mode = mode;
      state.preview = null;
      draw();
    });
    modeTabs.append(tab);
  }
  modeTabs.addEventListener('keydown', event => {
    const tabs = [...modeTabs.children];
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = tabs[(tabs.indexOf(document.activeElement) + step + tabs.length) % tabs.length];
    next.focus();
    next.click();
  });

  // --- stat bars
  const bars = [...ARMORY_STATS, ...TURRET_ARMORY_STATS].map(stat => {
    const row = element(document, 'div', 'gs-stat');
    const label = element(document, 'dt', '', stat.name);
    const value = element(document, 'dd');
    const number = element(document, 'b');
    const change = element(document, 'i');
    const track = element(document, 'span', 'gs-bar');
    const fill = element(document, 'span', 'gs-bar-fill');
    const delta = element(document, 'span', 'gs-bar-delta');
    track.append(fill, delta);
    value.append(number, change);
    row.append(label, track, value);
    statList.append(row);
    return { stat, row, number, change, fill, delta };
  });
  const fraction = (stat, value) => Math.max(0, Math.min(1, (value - stat.low) / (stat.high - stat.low)));
  const format = (stat, value) => value.toFixed(stat.digits ?? 0) + (stat.unit ?? '');

  function drawStats() {
    const current = statsOf(edited());
    const candidate = state.preview ? statsOf(state.preview) : null;
    const capacity = baseCapacity();
    const shownStats = statList_();
    for (const { stat, row, number, change, fill, delta } of bars) {
      row.hidden = !shownStats.includes(stat);
      if (row.hidden) continue;
      const now = stat.value(current, capacity);
      const next = candidate ? stat.value(candidate, capacity) : now;
      // A bar always fills toward "better", so reload and spread read the same way as damage.
      const shown = value => stat.better > 0 ? fraction(stat, value) : 1 - fraction(stat, value);
      const from = shown(now);
      const to = shown(next);
      const difference = Number((next - now).toFixed(stat.digits ?? 0));
      fill.style.width = Math.min(from, to) * 100 + '%';
      delta.style.left = Math.min(from, to) * 100 + '%';
      delta.style.width = Math.abs(to - from) * 100 + '%';
      row.dataset.change = !difference ? 'none' : difference * stat.better > 0 ? 'better' : 'worse';
      setText(number, format(stat, next));
      setText(change, difference ? (difference > 0 ? '+' : '−') + Math.abs(difference).toFixed(stat.digits ?? 0) : '');
    }
  }

  // What swapping to `candidate` does, split into gains and losses.
  function tradeoffs(candidate) {
    const current = statsOf(edited());
    const next = statsOf(candidate);
    const capacity = baseCapacity();
    const pros = [];
    const cons = [];
    for (const stat of statList_()) {
      const difference = Number((stat.value(next, capacity) - stat.value(current, capacity)).toFixed(stat.digits ?? 0));
      if (!difference) continue;
      const text = (difference > 0 ? '+' : '−') + Math.abs(difference).toFixed(stat.digits ?? 0) + (stat.unit ?? '') + ' ' + stat.name.toLowerCase();
      (difference * stat.better > 0 ? pros : cons).push(text);
    }
    return { pros, cons };
  }

  // --- attachment callouts on the stage
  const callouts = {};
  const svg = (tag, attributes) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };
  for (const [slot, { name }] of Object.entries(WEAPON_SLOTS)) {
    const button = element(document, 'button', 'gs-callout');
    button.type = 'button';
    button.dataset.slot = slot;
    const [x, y] = CALLOUT_SPOTS[slot] ?? [.5, .5];
    button.style.left = x * 100 + '%';
    button.style.top = y * 100 + '%';
    const value = element(document, 'strong');
    button.append(element(document, 'span', '', name), value);
    button.addEventListener('click', () => {
      state.mode = 'gunsmith';
      state.part = slot;
      state.preview = null;
      draw();
    });
    const line = svg('line', { class: 'gs-leader' });
    const dot = svg('circle', { class: 'gs-leader-dot', r: 4 });
    leaders.append(line, dot);
    calloutLayer.append(button);
    callouts[slot] = { button, value, line, dot };
  }

  // Leader lines run from each callout to its part on the turning weapon.
  function drawLeaders() {
    const points = state.mode === 'gunsmith' ? art.anchors?.() : null;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    leaders.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const canvas = preview.firstElementChild;
    // The preview is letterboxed inside the stage; map its own coordinates onto the stage.
    const aspect = canvas ? canvas.width / canvas.height : 1;
    const shown = { width: Math.min(preview.clientWidth, preview.clientHeight * aspect) };
    shown.height = shown.width / aspect;
    const left = preview.offsetLeft + (preview.clientWidth - shown.width) / 2;
    const top = preview.offsetTop + (preview.clientHeight - shown.height) / 2;
    for (const [slot, { button, line, dot }] of Object.entries(callouts)) {
      const point = points?.[slot];
      const visible = !!point && width > 0 && !button.hidden;
      line.style.display = dot.style.display = visible ? '' : 'none';
      if (!visible) continue;
      const x = left + point.x * shown.width;
      const y = top + point.y * shown.height;
      const box = { x: button.offsetLeft + button.offsetWidth / 2, y: button.offsetTop + button.offsetHeight / 2 };
      // Start the line at the edge of the callout facing the part.
      const dx = x - box.x;
      const dy = y - box.y;
      const reach = Math.min(Math.abs(button.offsetWidth / 2 / (dx || 1e-6)), Math.abs(button.offsetHeight / 2 / (dy || 1e-6)));
      line.setAttribute('x1', box.x + dx * Math.min(1, reach));
      line.setAttribute('y1', box.y + dy * Math.min(1, reach));
      line.setAttribute('x2', x);
      line.setAttribute('y2', y);
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      line.dataset.active = dot.dataset.active = String(slot === state.part);
    }
  }

  // --- side panel
  function previewable(card, candidate) {
    const show = () => {
      state.preview = candidate();
      drawStats();
    };
    const clear = () => {
      state.preview = null;
      drawStats();
    };
    card.addEventListener('pointerenter', show);
    card.addEventListener('focus', show);
    card.addEventListener('pointerleave', clear);
    card.addEventListener('blur', clear);
  }

  function tradeoffList(candidate, equipped) {
    const list = element(document, 'ul', 'gs-tradeoffs');
    if (equipped) {
      list.append(element(document, 'li', 'gs-equipped', 'Equipped'));
      return list;
    }
    const { pros, cons } = tradeoffs(candidate);
    for (const text of pros) list.append(element(document, 'li', 'gs-pro', text));
    for (const text of cons) list.append(element(document, 'li', 'gs-con', text));
    if (!pros.length && !cons.length) list.append(element(document, 'li', '', 'No stat change'));
    return list;
  }

  function weaponsPanel() {
    const loadout = getLoadout();
    setText(panelTitle, 'Loadout');
    setText(panelNote, 'Two different weapons and your auto-turret');
    subtabs.replaceChildren(...['primary', 'secondary', 'turret'].map(slot => {
      const carried = slot === 'turret' ? TURRET_TYPE : WEAPON_TYPES[loadout.arsenal[slot]];
      const tab = element(document, 'button', 'gs-carried');
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(slot === state.editing));
      tab.append(element(document, 'span', '', slot === 'turret' ? 'Deployable · key Q' : (slot === 'primary' ? 'Primary' : 'Secondary') + ' · key ' + (slot === 'primary' ? 1 : 2)),
        element(document, 'strong', '', carried.name), element(document, 'small', '', carried.role));
      tab.addEventListener('click', () => {
        state.editing = slot;
        draw();
      });
      return tab;
    }));
    options.dataset.layout = 'rows';
    if (turretEditing()) {
      const go = (mode, label, text) => {
        const card = element(document, 'button', 'gs-option gs-weapon');
        card.type = 'button';
        card.append(element(document, 'span', 'gs-option-kind', 'Auto-turret'), element(document, 'strong', '', label), element(document, 'small', '', text));
        card.addEventListener('click', () => {
          state.mode = mode;
          draw();
        });
        return card;
      };
      options.replaceChildren(go('gunsmith', 'Gunsmith', 'Fit a barrel, receiver and sensor.'),
        go('customize', 'Customize', 'Finish, accent, skin, decal, sticker and charm.'));
      return;
    }
    const other = state.editing === 'primary' ? 'secondary' : 'primary';
    options.replaceChildren(...WEAPON_ORDER.map(weapon => {
      const type = WEAPON_TYPES[weapon];
      const equipped = loadout.arsenal[state.editing] === weapon;
      const card = element(document, 'button', 'gs-option gs-weapon');
      card.type = 'button';
      card.setAttribute('aria-pressed', String(equipped));
      const candidate = () => loadoutInSlot(loadoutWithWeapon(getLoadout(), state.editing, weapon), state.editing);
      const tag = equipped ? 'Equipped' : loadout.arsenal[other] === weapon ? 'Carried as ' + other + ' · swaps' : '';
      card.append(element(document, 'span', 'gs-option-kind', type.role), element(document, 'strong', '', type.name),
        element(document, 'small', '', type.detail));
      if (tag) card.append(element(document, 'em', equipped ? 'gs-equipped' : '', tag));
      previewable(card, candidate);
      card.addEventListener('click', () => {
        if (!equipped) equip(loadoutWithWeapon(getLoadout(), state.editing, weapon));
      });
      return card;
    }));
  }

  function gunsmithPanel() {
    const current = edited();
    const slots = partSlots();
    if (!slots[state.part]) state.part = Object.keys(slots)[0];
    const slot = state.part;
    const cards = turretEditing() ? {} : art.thumbnailsFor?.(current.weapon) ?? art.thumbnails;
    setText(panelTitle, slots[slot].name);
    setText(panelNote, Object.keys(slots[slot].options).length + ' options');
    subtabs.replaceChildren(...Object.entries(slots).map(([id, { name }]) => {
      const tab = element(document, 'button', 'gs-chip', name);
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(id === slot));
      tab.addEventListener('click', () => {
        state.part = id;
        state.preview = null;
        draw();
      });
      return tab;
    }));
    options.dataset.layout = 'rows';
    options.replaceChildren(...Object.entries(slots[slot].options).map(([id, option]) => {
      const equipped = current[slot] === id;
      const card = element(document, 'button', 'gs-option gs-part');
      card.type = 'button';
      card.setAttribute('aria-pressed', String(equipped));
      const picture = element(document, 'img');
      picture.alt = '';
      picture.src = cards[slot]?.[id]?.src ?? '';
      const text = element(document, 'div');
      text.append(element(document, 'strong', '', option.name), element(document, 'small', '', option.detail),
        tradeoffList(withPart(slot, id), equipped));
      card.append(...(picture.src ? [picture] : []), text);
      previewable(card, () => withPart(slot, id));
      card.addEventListener('click', () => {
        if (!equipped) equipPart(slot, id);
      });
      return card;
    }));
  }

  function customizePanel() {
    const current = edited();
    const slot = state.cosmetic;
    const { name, options: choices } = cosmetics[slot];
    setText(panelTitle, name);
    setText(panelNote, Object.keys(choices).length + ' options');
    subtabs.replaceChildren(...Object.entries(cosmetics).map(([id, entry]) => {
      const tab = element(document, 'button', 'gs-chip', entry.name);
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(id === slot));
      tab.addEventListener('click', () => {
        state.cosmetic = id;
        state.preview = null;
        draw();
      });
      return tab;
    }));
    options.dataset.layout = 'tiles';
    const earnedCount = Object.keys(choices).filter(id => !locked(slot, id)).length;
    if (earnedCount < Object.keys(choices).length) setText(panelNote, earnedCount + ' of ' + Object.keys(choices).length + ' unlocked');
    options.replaceChildren(...Object.entries(choices).map(([id, option]) => {
      const equipped = current[slot] === id;
      const lock = equipped ? null : locked(slot, id);
      const card = element(document, 'button', 'gs-option gs-tile');
      card.type = 'button';
      card.setAttribute('aria-pressed', String(equipped));
      if (lock) {
        // A reward not earned yet: shown, so players know it exists, but not equippable.
        card.disabled = true;
        card.dataset.locked = 'true';
        card.append(element(document, 'strong', '', option.name));
        card.append(element(document, 'small', '', 'Locked · Earn “' + lock + '”'));
        if (option.color) { const swatch = element(document, 'span', 'gs-swatch'); swatch.style.setProperty('--swatch', option.color); card.prepend(swatch); }
        else { const picture = element(document, 'img'); picture.alt = ''; picture.src = cosmeticArt(slot, id); card.prepend(picture); }
        return card;
      }
      if (option.color) {
        const swatch = element(document, 'span', 'gs-swatch');
        swatch.style.setProperty('--swatch', option.color);
        card.append(swatch);
      } else {
        const picture = element(document, 'img');
        picture.alt = '';
        picture.src = cosmeticArt(slot, id);
        card.append(picture);
      }
      card.append(element(document, 'strong', '', option.name));
      if (option.detail) card.append(element(document, 'small', '', option.detail));
      // Charms are the one cosmetic that changes how the weapon handles.
      if (slot === 'charm') {
        card.append(tradeoffList(withPart(slot, id), equipped));
        previewable(card, () => withPart(slot, id));
      } else if (equipped) card.append(element(document, 'em', 'gs-equipped', 'Equipped'));
      card.addEventListener('click', () => {
        if (!equipped) equipPart(slot, id);
      });
      return card;
    }));
  }

  // Gunsmith and Customize edit one item at a time; this row switches between the two carried
  // weapons and the auto-turret without going back to the Weapons tab.
  function itemsRow() {
    items.hidden = state.mode === 'weapons';
    if (items.hidden) return items.replaceChildren();
    const loadout = getLoadout();
    items.replaceChildren(...['primary', 'secondary', 'turret'].map(slot => {
      const name = slot === 'turret' ? TURRET_TYPE.name : WEAPON_TYPES[loadout.arsenal[slot]].name;
      const tab = element(document, 'button', 'gs-item', (slot === 'turret' ? 'Turret' : slot === 'primary' ? 'Primary' : 'Secondary') + ' · ' + name);
      tab.type = 'button';
      tab.dataset.item = slot;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(slot === state.editing));
      tab.addEventListener('click', () => {
        if (state.editing === slot) return;
        state.editing = slot;
        draw();
      });
      return tab;
    }));
  }

  function draw() {
    state.preview = null;
    const current = edited();
    const type = turretEditing() ? TURRET_TYPE : WEAPON_TYPES[current.weapon];
    dialog.dataset.mode = state.mode;
    dialog.dataset.editing = state.editing;
    setText(kicker, (turretEditing() ? 'DEPLOYABLE' : state.editing === 'primary' ? 'PRIMARY' : 'SECONDARY') + ' · ' + type.name.toUpperCase());
    setText(plate.role, type.role);
    setText(plate.name, type.name);
    setText(plate.detail, type.detail);
    setText(reset, 'Reset ' + type.short.toLowerCase());
    for (const tab of modeTabs.children) {
      const active = tab.dataset.mode === state.mode;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const [slot, { button, value }] of Object.entries(callouts)) {
      button.hidden = state.mode !== 'gunsmith' || turretEditing();
      button.setAttribute('aria-pressed', String(slot === state.part));
      if (!turretEditing()) setText(value, WEAPON_SLOTS[slot].options[current[slot]].name);
    }
    // Rebuilding the list would drop keyboard focus; put it back on the same option.
    const focused = [...options.children].indexOf(document.activeElement);
    const scroll = options.scrollTop;
    itemsRow();
    ({ weapons: weaponsPanel, gunsmith: gunsmithPanel, customize: customizePanel })[state.mode]();
    options.scrollTop = scroll;
    if (focused >= 0) options.children[Math.min(focused, options.children.length - 1)]?.focus({ preventScroll: true });
    drawStats();
    drawLeaders();
  }

  return {
    draw,
    drawLeaders,
    edited,
    get editing() { return state.editing; },
    // Opening always starts on the bench with nothing previewed.
    open() {
      state.preview = null;
      draw();
    },
  };
}
