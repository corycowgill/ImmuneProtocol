// The deployment briefing (shared by the campaign and Free Mode) and the title screen's
// operator card: mission intel, the expected pathogens, field-upgrade cards and loadout.
import { Simulation, speciesHabitats } from './simulation.mjs';
import { ORGAN_MISSIONS } from './organs.mjs';
import { FIELD_UPGRADES } from './loadouts.mjs';
import { COMPANIONS, WEAPON_TYPES } from './weapon-mods.mjs';
import { PATHOGENS } from './disease-guide.mjs';

// Arenas without an organ hazard still have a defining pressure.
const SET_PIECES = {
  artery: { name: 'Pulse flow', detail: 'Red cells stream through a beating valve' },
  junction: { name: 'Surge forecast', detail: 'Amber and Teal inlets attack in turn' },
  heart: { name: 'Valve windows', detail: 'Four valves open in turn; shoot the colonies behind each one' },
};

const intel = new Map();
let habitats = null;

export function missionIntel(area, bossPractice = false) {
  const key = area + (bossPractice ? ':boss' : '');
  if (intel.has(key)) return intel.get(key);
  const probe = new Simulation(area, bossPractice ? { bossPractice: true } : {});
  habitats ??= speciesHabitats();
  const hazard = ORGAN_MISSIONS[area]?.hazard;
  const entry = {
    waves: bossPractice ? 'Boss' : String(probe.waves),
    nodes: probe.nodes.length,
    hazard: hazard ? { name: hazard.name, detail: hazard.effect } : SET_PIECES[area],
    threats: PATHOGENS.filter(({ type }) => habitats[type]?.includes(area)),
  };
  intel.set(key, entry);
  return entry;
}

function term(list, name, value, detail) {
  const row = document.createElement('div');
  const dt = document.createElement('dt');
  dt.textContent = name;
  const dd = document.createElement('dd');
  dd.textContent = value;
  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    dd.append(small);
  }
  row.append(dt, dd);
  list.append(row);
}

// endless: { record } for an Endless deployment, which shows the arena's best run instead of a wave count.
export function drawIntel(list, threats, area, bossPractice, endless = null) {
  const info = missionIntel(area, bossPractice);
  list.replaceChildren();
  if (endless) {
    term(list, 'Waves', '∞', 'Each one bigger and tougher');
    const { record } = endless;
    term(list, 'Best run', record ? 'Wave ' + record.waves : '—', record ? record.score.toLocaleString() + ' score' : 'No runs yet');
  } else term(list, 'Waves', info.waves);
  term(list, 'Tissue nodes', String(info.nodes));
  if (info.hazard) term(list, 'Hazard', info.hazard.name, info.hazard.detail);
  threats.replaceChildren(...(bossPractice ? [{ type: 'mega', name: 'Mega Virus' }, ...info.threats] : info.threats)
    .map(({ type, name }) => {
      const item = document.createElement('li');
      if (type !== 'mega') {
        const portrait = new Image(96, 96);
        portrait.src = new URL('./assets/enemies/portraits/' + type + '.webp', import.meta.url).href;
        portrait.alt = '';
        portrait.decoding = 'async';
        portrait.loading = 'eager';
        item.append(portrait);
      } else {
        item.dataset.boss = '';
      }
      const label = document.createElement('span');
      label.textContent = name;
      item.append(label);
      return item;
    }));
}

// Radio cards over the field-upgrade <select>, which stays the single source of truth.
export function createUpgradeCards(container, select) {
  const cards = [...select.options].map(option => {
    const id = option.value;
    const upgrade = FIELD_UPGRADES[id];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'upgrade-card';
    card.setAttribute('role', 'radio');
    card.dataset.upgradeCard = id;
    const art = document.createElement('span');
    art.className = 'upgrade-art';
    art.setAttribute('aria-hidden', 'true');
    if (id !== 'standard') art.dataset.upgradeArt = id;
    const name = document.createElement('strong');
    name.textContent = upgrade?.name ?? 'Standard';
    card.title = upgrade?.description ?? 'Standard equipment without a field upgrade.';
    card.append(art, name);
    card.addEventListener('click', () => {
      if (select.disabled || select.value === id) return;
      select.value = id;
      select.dispatchEvent(new Event('change'));
      sync();
    });
    return card;
  });
  container.replaceChildren(...cards);
  function sync() {
    for (const card of cards) {
      const chosen = card.dataset.upgradeCard === select.value;
      card.setAttribute('aria-checked', String(chosen));
      card.tabIndex = chosen ? 0 : -1;
      card.disabled = select.disabled;
    }
  }
  sync();
  return { sync };
}

export function drawLoadout(list, loadout) {
  list.replaceChildren();
  term(list, 'Primary', WEAPON_TYPES[loadout.arsenal.primary]?.name ?? '');
  term(list, 'Secondary', WEAPON_TYPES[loadout.arsenal.secondary]?.name ?? '');
  term(list, 'Companion', COMPANIONS[loadout.arsenal.companion]?.name ?? COMPANIONS.turret.name);
}

// The title screen's summary of the player's progress and kit.
export function drawOperatorCard({ secured, areas, missionName, best, difficulty, loadout }) {
  const byId = id => document.getElementById(id);
  const value = byId('operator-progress-value');
  value.firstChild.textContent = String(secured);
  value.lastChild.textContent = '/' + areas.length;
  byId('operator-route').replaceChildren(...areas.map((area, index) => {
    const step = document.createElement('li');
    step.title = missionName(area);
    step.dataset.state = index < secured ? 'secured' : index === secured ? 'next' : 'locked';
    return step;
  }));
  byId('operator-best').textContent = best ? best.toLocaleString() : '—';
  byId('operator-difficulty').textContent = difficulty;
  byId('operator-primary').textContent = WEAPON_TYPES[loadout.arsenal.primary]?.name ?? '';
  byId('operator-secondary').textContent = WEAPON_TYPES[loadout.arsenal.secondary]?.name ?? '';
}
