import { COOP_SUITS, SUITS, loadSuitModels, normalizeSuit, saveSuit, savedSuit, suitModelVersion } from './suits.mjs';
import { createLobbyBay } from './coop-lobby-bay.mjs';
import { COOP_MAX_PLAYERS, COOP_MIN_PLAYERS, COOP_MODES, DEFAULT_COOP_SETTINGS } from './coop-protocol.mjs';
import { LOW_MEMORY } from './asset-loading.mjs';
import { DIFFICULTIES } from './difficulty.mjs';
import { ENDLESS_AREAS } from './endless.mjs';
import { missionName } from './mission-text.mjs';

// Co-op lobby: once in a room the dialog becomes a full-screen miniaturization lab where both
// players stand in the shrinking machine in their chosen suits, with a picker to choose your
// own. Attached to the CoopClient.
const PICK_PHASES = ['lobby', 'finished'];
const MODES = {
  campaign: ['Campaign', 'Ten missions in order'],
  endless: ['Endless', 'Waves never stop'],
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function attachLobby(client) {
  const lobby = document.getElementById('coop-lobby');
  const dialog = document.getElementById('coop-dialog');
  const stockRoster = document.getElementById('coop-roster');
  if (!lobby || !dialog || !stockRoster) return;

  const bayFrame = element('div', 'coop-bay');
  const canvas = element('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const roster = element('ol', 'coop-bay-roster');
  roster.setAttribute('aria-label', 'Players and suits');
  bayFrame.append(canvas, roster);

  const picker = element('fieldset', 'coop-suits');
  picker.append(element('legend', '', 'Choose your suit'));
  const options = element('div', 'coop-suit-options');
  picker.append(options);
  const buttons = COOP_SUITS.map(id => {
    const suit = SUITS[id];
    const button = element('button', 'coop-suit');
    button.type = 'button';
    button.dataset.suit = id;
    button.style.setProperty('--suit', suit.accent);
    button.title = suit.detail;
    button.setAttribute('aria-label', suit.name + ', ' + suit.archetype + '. ' + suit.detail);
    const image = element('img');
    image.alt = '';
    image.width = 180;
    image.height = 240;
    button.append(image, element('strong', '', suit.name), element('small', '', suit.archetype));
    button.addEventListener('click', () => choose(id));
    options.append(button);
    return button;
  });
  // The host's match settings: mode, difficulty and, for Endless, the arena. Everyone sees them;
  // only the host can change them, and only in the lobby.
  const rules = element('section', 'coop-rules');
  rules.setAttribute('aria-label', 'Match settings');
  const rulesHint = element('p', 'coop-rules-hint');
  function choiceRow(legend, entries, key) {
    const fieldset = element('fieldset', 'coop-rule');
    fieldset.append(element('legend', '', legend));
    const row = element('div', 'coop-rule-options');
    row.setAttribute('role', 'radiogroup');
    const buttons = entries.map(([value, name, detail]) => {
      const button = element('button', 'coop-rule-option');
      button.type = 'button';
      button.dataset.value = value;
      button.append(element('strong', '', name), ...(detail ? [element('small', '', detail)] : []));
      button.addEventListener('click', () => client.setSettings({ [key]: value }));
      row.append(button);
      return button;
    });
    fieldset.append(row);
    rules.append(fieldset);
    return { fieldset, buttons, key };
  }
  const ruleRows = [
    choiceRow('Mode', COOP_MODES.map(mode => [mode, ...MODES[mode]]), 'mode'),
    choiceRow('Difficulty', Object.entries(DIFFICULTIES).map(([id, level]) => [id, level.name]), 'difficulty'),
    choiceRow('Endless arena', ENDLESS_AREAS.map(area => [area, missionName(area)]), 'arena'),
  ];
  rules.prepend(rulesHint);
  stockRoster.before(bayFrame, rules, picker);
  stockRoster.classList.add('coop-roster-replaced');

  const heading = document.getElementById('coop-title');
  const intro = document.getElementById('coop-intro');
  const stockText = [heading.textContent, intro.textContent];
  const labText = ['Miniaturization lab', 'Pick your suit and ready up. When the squad is locked in, the machine shrinks you for injection.'];
  let bay = null;
  let portraitVersion = -1;
  let modelsRequested = false;
  let preparation = null;
  let selected = savedSuit();

  function ensureBay() {
    if (bay !== null) return bay;
    try {
      bay = createLobbyBay(canvas);
    } catch (error) {
      console.warn('Could not start the co-op lobby preview', error);
      bay = false;
      bayFrame.classList.add('coop-bay-flat');
      stockRoster.classList.remove('coop-roster-replaced');
    }
    return bay;
  }

  function drawPortraits() {
    if (!ensureBay()) return;
    if (!modelsRequested) {
      modelsRequested = true;
      // Startup has already decoded every suit; reuse those models for portraits.
      loadSuitModels().then(drawPortraits);
    }
    if (portraitVersion === suitModelVersion()) return;
    portraitVersion = suitModelVersion();
    for (const button of buttons) {
      try {
        button.querySelector('img').src = bay.portrait(button.dataset.suit);
      } catch (error) {
        console.warn('Could not draw suit portrait', error);
      }
    }
  }

  function drawPicker(fromServer = true) {
    const room = client.room;
    const local = client.localPlayer;
    if (fromServer && local?.suit) selected = normalizeSuit(local.suit);
    const enabled = !!local && client.connected && PICK_PHASES.includes(room?.phase);
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.suit === selected));
      button.disabled = !enabled;
    }
  }

  function choose(id) {
    selected = normalizeSuit(id);
    saveSuit(selected);
    if (client.localPlayer && PICK_PHASES.includes(client.room?.phase)) client.setSuit(selected);
    drawPicker(false);
  }

  function drawRules() {
    const room = client.room;
    const settings = room?.settings ?? DEFAULT_COOP_SETTINGS;
    const host = !!client.session && room?.ownerId === client.session.id;
    const editable = host && client.connected && room?.phase === 'lobby';
    for (const { fieldset, buttons, key } of ruleRows) {
      if (key === 'arena') fieldset.hidden = settings.mode !== 'endless';
      for (const button of buttons) {
        button.setAttribute('aria-pressed', String(button.dataset.value === settings[key]));
        button.disabled = !editable;
      }
    }
    rulesHint.textContent = room?.phase !== 'lobby' ? 'The squad is deployed with these settings.'
      : host ? 'You are the host: choose the mode and difficulty.' : 'The host chooses the mode and difficulty.';
  }

  function drawRoster(players, localId) {
    const rows = players.map(player => {
      const suit = SUITS[normalizeSuit(player.suit)];
      const row = element('li');
      row.style.setProperty('--suit', suit.accent);
      const status = element('span', '', !player.connected ? 'Reconnecting' : player.ready ? 'Ready' : 'Preparing');
      status.dataset.ready = String(player.ready && player.connected);
      // The lobby's name plates read these rather than parsing the text.
      row.dataset.state = !player.connected ? 'reconnecting' : player.ready ? 'ready' : 'preparing';
      row.dataset.name = player.name;
      row.dataset.suit = suit.name;
      if (player.id === localId) row.dataset.you = 'true';
      if (player.id === client.room?.ownerId) row.dataset.host = 'true';
      row.append(
        element('strong', '', player.name + (player.id === localId ? ' (you)' : '')),
        element('em', '', suit.name + ' · ' + suit.archetype),
        status,
      );
      return row;
    });
    while (rows.length < COOP_MAX_PLAYERS) rows.push(element('li', 'coop-bay-empty',
      rows.length < COOP_MIN_PLAYERS ? 'Waiting for a teammate' : 'Optional third player'));
    roster.style.setProperty('--squad-slots', COOP_MAX_PLAYERS);
    roster.replaceChildren(...rows);
  }

  function sync() {
    const room = client.room;
    const localId = client.session?.id;
    const visible = dialog.open && !lobby.hidden && !!room && !!localId;
    dialog.classList.toggle('coop-in-lab', visible && bay !== false);
    [heading.textContent, intro.textContent] = visible ? labText : stockText;
    if (!visible) {
      if (bay) bay.stop();
      return;
    }
    drawPortraits();
    drawRules();
    drawPicker();
    const players = bay ? bay.setPlayers(room.players, localId) : room.players;
    drawRoster(players, localId);
    if (bay) bay.start();
  }

  client.addEventListener('room', sync);
  client.addEventListener('session', sync);
  dialog.addEventListener('close', sync);
  const watcher = new MutationObserver(sync);
  watcher.observe(lobby, { attributes: true, attributeFilter: ['hidden'] });
  watcher.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  async function prepareResources() {
    await loadSuitModels();
    if (!ensureBay()) throw new Error('Could not prepare the miniaturization lab renderer');
    await bay.prepare();
    drawPortraits();
    await Promise.all(buttons.map(button => button.querySelector('img').decode()));
  }
  return {
    prepare() {
      if (!LOW_MEMORY) return prepareResources();
      preparation ??= prepareResources().catch(error => { preparation = null; throw error; });
      return preparation;
    },
  };
}
