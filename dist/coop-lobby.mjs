import { COOP_SUITS, SUITS, loadSuitModels, normalizeSuit, saveSuit, savedSuit, suitModelVersion } from './suits.mjs';
import { createLobbyBay } from './coop-lobby-bay.mjs';

// Co-op lobby suit selection: a live deployment bay that shows both players'
// suits, and a picker to choose your own. Attached to the CoopClient.
const PICK_PHASES = ['lobby', 'finished'];

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

  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('./coop-suits.css', import.meta.url).href;
  document.head.append(style);

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
  stockRoster.before(bayFrame, picker);
  stockRoster.classList.add('coop-roster-replaced');

  let bay = null;
  let portraitVersion = -1;
  let modelsRequested = false;
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
      // Redraw the cards once the textured Blender models have streamed in.
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

  function drawRoster(players, localId) {
    const rows = players.map(player => {
      const suit = SUITS[normalizeSuit(player.suit)];
      const row = element('li');
      row.style.setProperty('--suit', suit.accent);
      const status = element('span', '', !player.connected ? 'Reconnecting' : player.ready ? 'Ready' : 'Preparing');
      status.dataset.ready = String(player.ready && player.connected);
      row.append(
        element('strong', '', player.name + (player.id === localId ? ' (you)' : '')),
        element('em', '', suit.name + ' · ' + suit.archetype),
        status,
      );
      return row;
    });
    if (rows.length < 2) rows.push(element('li', 'coop-bay-empty', 'Waiting for a teammate'));
    roster.replaceChildren(...rows);
  }

  function sync() {
    const room = client.room;
    const localId = client.session?.id;
    const visible = dialog.open && !lobby.hidden && !!room && !!localId;
    if (!visible) {
      if (bay) bay.stop();
      return;
    }
    drawPortraits();
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
}
