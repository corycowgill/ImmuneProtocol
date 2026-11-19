// HUD and menu pieces for carrying two weapons: the weapon strip, dynamic crosshair, sniper scope
// overlay, touch swap button, armory loadout picker, sticker and charm cards, and manual entries.
import { drawSticker } from './arsenal-models.mjs';
import { WEAPON_CHARMS, WEAPON_STICKERS, WEAPON_TYPES, WEAPON_ORDER, otherSlot } from './weapon-mods.mjs';

const STYLE = `
.weapon-strip{display:flex;justify-content:flex-end;gap:5px;margin:2px 0 6px;font:500 9px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase}
.weapon-strip span{display:flex;align-items:center;gap:5px;padding:4px 6px;border:1px solid #d7c5ab33;color:#bfb2a3;background:#1a1210a8}
.weapon-strip span[data-active="true"]{border-color:var(--green);color:var(--green);background:#22301ec4}
.weapon-strip kbd{min-width:13px;padding:1px 3px;border:1px solid currentColor;font:600 8px/1.2 var(--mono);text-align:center}
.weapon-strip[data-switching="true"] span[data-active="true"]{animation:weapon-draw .3s ease-out}
.scope-overlay{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .12s;
  background:radial-gradient(circle at 50% 50%,transparent 0 min(33vh,33vw),#000 calc(min(33vh,33vw) + 1px));}
.scope-overlay[data-visible="true"]{opacity:1}
.scope-overlay::before,.scope-overlay::after{content:"";position:absolute;left:50%;top:50%;background:#050505d9;transform:translate(-50%,-50%)}
.scope-overlay::before{width:min(66vh,66vw);height:1.5px}
.scope-overlay::after{width:1.5px;height:min(66vh,66vw)}
.scope-overlay i{position:absolute;left:50%;top:50%;width:min(66vh,66vw);height:min(66vh,66vw);transform:translate(-50%,-50%);border-radius:50%;
  box-shadow:inset 0 0 40px 18px #000c,0 0 0 3px #0d0d0d;background:radial-gradient(circle,#ff3b3b 0 2px,transparent 3px),
  repeating-linear-gradient(90deg,transparent 0 calc(50% - 40px),#0008 calc(50% - 40px) calc(50% - 39px)) center/100% 10px no-repeat}
.reticle{transition:--offset .08s}
.touch-actions [data-touch="swap"]{grid-area:swap;background:#1f2a35b8}
.touch-actions{grid-template-areas:"swap . turret" "reload repair fire"}
.touch-actions:has(#touch-turret[hidden]){grid-template-areas:"swap . ." "reload repair fire"}
.armory-loadout{display:grid;gap:6px;margin:12px 0 2px}
.armory-loadout-row{display:grid;grid-template-columns:96px repeat(5,minmax(0,1fr));gap:5px;align-items:stretch}
.armory-loadout-row>strong{display:grid;align-content:center;gap:3px;padding:6px 8px;border:1px solid var(--line);background:#151213;color:#e0cbb9;font:500 10px/1.2 var(--mono);letter-spacing:.08em;text-transform:uppercase}
.armory-loadout-row>strong small{color:var(--muted);font-size:9px;letter-spacing:0;text-transform:none}
.armory-loadout-row[data-editing="true"]>strong{border-color:var(--green);color:var(--green)}
.armory-weapon{display:grid;gap:3px;min-width:0;padding:7px 8px;text-align:left;background:#171211;border:1px solid var(--line);color:var(--paper)}
.armory-weapon strong{font:800 16px/1 var(--display);text-transform:uppercase}
.armory-weapon span{color:var(--muted);font:500 9px/1.2 var(--mono)}
.armory-weapon:hover{border-color:#c8f79480}
.armory-weapon[aria-checked="true"]{border-color:var(--green);background:#273022}
.armory-weapon[aria-checked="true"] strong{color:var(--green)}
.armory-weapon:disabled{opacity:.42;cursor:not-allowed}
.armory-slots{grid-template-columns:repeat(9,minmax(0,1fr))}
.armory-card .armory-art{display:block;width:100%;aspect-ratio:225/130;max-height:132px;background:#201917;object-fit:contain}
@media(max-width:760px){.armory-slots{grid-template-columns:repeat(5,minmax(0,1fr))}.armory-loadout-row{grid-template-columns:repeat(5,minmax(0,1fr))}.armory-loadout-row>strong{grid-column:1/-1}}
@keyframes weapon-draw{from{transform:translateY(5px);opacity:.3}to{transform:none;opacity:1}}
`;

let strip;
let scope;
let reticle;

export function installArsenalUi(document) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);
  const ammoPanel = document.getElementById('ammo-panel');
  if (ammoPanel && !document.getElementById('weapon-strip')) {
    strip = document.createElement('div');
    strip.id = 'weapon-strip';
    strip.className = 'weapon-strip';
    strip.setAttribute('aria-label', 'Carried weapons');
    for (const slot of ['primary', 'secondary']) {
      const item = document.createElement('span');
      item.dataset.slot = slot;
      const key = document.createElement('kbd');
      key.textContent = slot === 'primary' ? '1' : '2';
      item.append(key, document.createElement('b'));
      strip.append(item);
    }
    ammoPanel.prepend(strip);
  }
  reticle = document.getElementById('reticle');
  if (reticle && !document.getElementById('scope-overlay')) {
    scope = document.createElement('div');
    scope.id = 'scope-overlay';
    scope.className = 'scope-overlay';
    scope.setAttribute('aria-hidden', 'true');
    scope.append(document.createElement('i'));
    reticle.before(scope);
  }
  const actions = document.querySelector('.touch-actions');
  if (actions && !actions.querySelector('[data-touch="swap"]')) {
    const swap = document.createElement('button');
    swap.type = 'button';
    swap.id = 'touch-swap';
    swap.dataset.touch = 'swap';
    swap.textContent = 'Swap';
    swap.setAttribute('aria-label', 'Switch weapon');
    actions.prepend(swap);
  }
  const hint = document.getElementById('field-hint');
  if (hint && !hint.dataset.swap) {
    hint.dataset.swap = 'true';
    hint.append(document.createElement('span'), document.createTextNode('1 · 2 SWAP'));
  }
  const padHint = document.getElementById('controller-field-hint');
  if (padHint && !padHint.dataset.swap) {
    padHint.dataset.swap = 'true';
    padHint.append(document.createElement('span'), document.createTextNode('Y SWAP'));
  }
  const manualRows = [
    ['keyboard-manual', 'Switch weapon', ['1', '2', 'Mouse wheel']],
    ['touch-manual', 'Switch weapon', 'Tap Swap'],
    ['controller-manual', 'Switch weapon', ['Y']],
  ];
  for (const [id, label, keys] of manualRows) {
    const list = document.querySelector('#' + id + ' .controls-list');
    if (!list || list.querySelector('[data-swap]')) continue;
    const row = document.createElement('div');
    row.dataset.swap = 'true';
    const term = document.createElement('dt');
    term.textContent = label;
    const value = document.createElement('dd');
    if (Array.isArray(keys)) {
      for (const key of keys) {
        const kbd = document.createElement('kbd');
        kbd.textContent = key;
        value.append(kbd);
      }
    } else value.textContent = keys;
    row.append(term, value);
    list.lastElementChild.before(row);
  }
  const title = document.getElementById('armory-title');
  if (title) title.textContent = 'Armory';
  const slots = document.getElementById('armory-slots');
  if (slots) slots.setAttribute('aria-label', 'Weapon customization');
}

// Weapon names, the spread-sized crosshair and the scope overlay.
export function drawWeaponHud(sim, aiming, sighted = aiming) {
  const loadout = sim.weaponLoadout;
  if (strip && loadout?.arsenal) {
    strip.dataset.switching = String(sim.switching > 0);
    for (const item of strip.children) {
      const weapon = loadout.arsenal[item.dataset.slot];
      const active = item.dataset.slot === loadout.slot;
      if (item.dataset.active !== String(active)) item.dataset.active = String(active);
      const label = item.lastElementChild;
      const name = WEAPON_TYPES[weapon]?.short ?? weapon;
      if (label.textContent !== name) label.textContent = name;
    }
  }
  const weapon = sim.weapon;
  const scoped = Boolean(sighted && weapon?.scope && !sim.repairing);
  if (scope && scope.dataset.visible !== String(scoped)) scope.dataset.visible = String(scoped);
  if (reticle && weapon) {
    const spread = aiming ? weapon.aimSpread : weapon.hipSpread;
    const offset = Math.round(4 + Math.min(40, spread * 420)) + 'px';
    if (reticle.style.getPropertyValue('--offset') !== offset) reticle.style.setProperty('--offset', offset);
  }
}

export function weaponName(sim) {
  return (WEAPON_TYPES[sim.weaponLoadout?.weapon]?.name ?? 'Needle Carbine').toUpperCase();
}

// Small canvas icons for charm cards.
export function drawCharm(context, size, id) {
  const charm = WEAPON_CHARMS[id];
  context.clearRect(0, 0, size, size);
  const c = size / 2;
  const s = size / 128;
  context.save();
  context.strokeStyle = '#c9c2b4';
  context.lineWidth = 3 * s;
  for (let i = 0; i < 3; i++) {
    context.beginPath();
    context.ellipse(c, 16 * s + i * 11 * s, 4 * s, 6 * s, 0, 0, Math.PI * 2);
    context.stroke();
  }
  if (!charm.color) {
    context.restore();
    return;
  }
  context.fillStyle = charm.color;
  context.strokeStyle = '#1a1414';
  context.lineWidth = 2.5 * s;
  const y = 76 * s;
  const shape = () => { context.fill(); context.stroke(); };
  context.beginPath();
  if (id === 'clover') {
    for (let i = 0; i < 3; i++) {
      const angle = -Math.PI / 2 + i * Math.PI * 2 / 3;
      context.moveTo(c + Math.cos(angle) * 15 * s + 15 * s, y + Math.sin(angle) * 15 * s);
      context.arc(c + Math.cos(angle) * 15 * s, y + Math.sin(angle) * 15 * s, 15 * s, 0, Math.PI * 2);
    }
    shape();
  } else if (id === 'fang') {
    context.moveTo(c - 13 * s, y - 24 * s);
    context.quadraticCurveTo(c, y - 30 * s, c + 13 * s, y - 24 * s);
    context.quadraticCurveTo(c + 6 * s, y + 10 * s, c, y + 30 * s);
    context.quadraticCurveTo(c - 6 * s, y + 10 * s, c - 13 * s, y - 24 * s);
    shape();
  } else if (id === 'hourglass') {
    context.moveTo(c - 18 * s, y - 26 * s);
    context.lineTo(c + 18 * s, y - 26 * s);
    context.lineTo(c, y);
    context.lineTo(c + 18 * s, y + 26 * s);
    context.lineTo(c - 18 * s, y + 26 * s);
    context.lineTo(c, y);
    context.closePath();
    shape();
  } else if (id === 'feather') {
    context.ellipse(c, y, 12 * s, 32 * s, .35, 0, Math.PI * 2);
    shape();
    context.beginPath();
    context.moveTo(c - 12 * s, y + 30 * s);
    context.lineTo(c + 12 * s, y - 30 * s);
    context.stroke();
  } else if (id === 'eye') {
    context.fillStyle = '#f4efe6';
    context.arc(c, y, 26 * s, 0, Math.PI * 2);
    shape();
    context.beginPath();
    context.fillStyle = charm.color;
    context.arc(c, y, 14 * s, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.fillStyle = '#111';
    context.arc(c, y, 6 * s, 0, Math.PI * 2);
    context.fill();
  } else if (id === 'capsule') {
    context.roundRect(c - 13 * s, y - 30 * s, 26 * s, 60 * s, 13 * s);
    shape();
    context.beginPath();
    context.fillStyle = '#f2efe8';
    context.roundRect(c - 13 * s, y, 26 * s, 30 * s, [0, 0, 13 * s, 13 * s]);
    context.fill();
    context.stroke();
  }
  context.restore();
}

const artCache = new Map();
// A data URL picture for a sticker or charm option card.
export function cosmeticArt(slot, id) {
  const key = slot + ':' + id;
  if (artCache.has(key)) return artCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 225;
  canvas.height = 130;
  const context = canvas.getContext('2d');
  context.fillStyle = '#201917';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const icon = document.createElement('canvas');
  icon.width = icon.height = 128;
  if (slot === 'sticker') drawSticker(icon.getContext('2d'), 128, id);
  else drawCharm(icon.getContext('2d'), 128, id);
  context.drawImage(icon, (canvas.width - 112) / 2, 9, 112, 112);
  const url = canvas.toDataURL('image/webp', .9);
  artCache.set(key, url);
  return url;
}

export const COSMETIC_SLOTS = {
  sticker: { name: 'Sticker', options: WEAPON_STICKERS },
  charm: {
    name: 'Charm',
    options: Object.fromEntries(Object.entries(WEAPON_CHARMS).map(([id, charm]) => [id, {
      ...charm, detail: id === 'none' ? charm.detail : charm.buff + ': ' + charm.detail,
    }])),
  },
};

// Primary and secondary weapon rows in the armory. `onPick(slot, weapon)` equips; `onEdit(slot)`
// chooses which carried weapon the slot tabs customize.
export function createLoadoutPicker(document, { onPick, onEdit }) {
  const container = document.createElement('div');
  container.className = 'armory-loadout';
  container.setAttribute('aria-label', 'Carried weapons');
  const rows = {};
  for (const slot of ['primary', 'secondary']) {
    const row = document.createElement('div');
    row.className = 'armory-loadout-row';
    row.setAttribute('role', 'radiogroup');
    const label = document.createElement('strong');
    label.textContent = slot === 'primary' ? 'Primary' : 'Secondary';
    const hint = document.createElement('small');
    hint.textContent = slot === 'primary' ? 'Key 1' : 'Key 2';
    label.append(hint);
    label.id = 'armory-' + slot + '-label';
    row.setAttribute('aria-labelledby', label.id);
    row.append(label);
    for (const weapon of WEAPON_ORDER) {
      const type = WEAPON_TYPES[weapon];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'armory-weapon';
      button.dataset.weapon = weapon;
      button.setAttribute('role', 'radio');
      button.title = type.detail;
      const name = document.createElement('strong');
      name.textContent = type.short;
      const role = document.createElement('span');
      role.textContent = type.role;
      button.append(name, role);
      button.addEventListener('click', () => {
        onPick(slot, weapon);
        onEdit(slot);
      });
      row.append(button);
    }
    label.addEventListener('click', () => onEdit(slot));
    rows[slot] = row;
    container.append(row);
  }
  return {
    element: container,
    draw(loadout, editing) {
      for (const [slot, row] of Object.entries(rows)) {
        row.dataset.editing = String(slot === editing);
        for (const button of row.querySelectorAll('[data-weapon]')) {
          const chosen = loadout.arsenal[slot] === button.dataset.weapon;
          button.setAttribute('aria-checked', String(chosen));
          button.tabIndex = chosen ? 0 : -1;
        }
      }
    },
  };
}

export { otherSlot };
