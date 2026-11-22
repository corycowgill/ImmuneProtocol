import { Simulation, JUNCTION_INLETS, RULES } from './simulation.mjs';
import { AIDebugSystem } from './ai-debug.mjs';
import { ORGAN_MISSIONS } from './organs.mjs';
import { FIELD_UPGRADES } from './loadouts.mjs';
import {
  WEAPON_ACCENTS, WEAPON_FINISHES, WEAPON_TYPES, legacyWeaponLoadout, loadoutWithBuild,
  normalizeWeaponBuild, normalizeWeaponLoadout,
} from './weapon-mods.mjs';
import { FIELD_UPGRADE_ART, prepareArmoryArt } from './armory-art.mjs';
import { World } from './world.mjs';
import { loadingScreen, paintLoading } from './loading-screen.mjs';
import { LOW_MEMORY } from './asset-loading.mjs';
import { loadLab } from './coop-lobby-bay.mjs';
import { ENEMY_MODELS } from './enemy-models.mjs';
import { GameAudio } from './audio.mjs';
import { CoopClient, PUBLIC_COOP_ORIGIN, savedCoopSession, verifyCoopHost } from './coop-client.mjs';
import { COOP_MIN_PLAYERS, COOP_MAX_PLAYERS, CAMPAIGN_AREAS, COOP_CODE_ALPHABET, COOP_CODE_LENGTH } from './coop-protocol.mjs';
import { GamepadInput } from './gamepad.mjs';
import { GamepadMenu } from './gamepad-menu.mjs';
import { applyRenderedPreviews, currentDifficulty } from './level-hud.mjs';
import { DIFFICULTIES } from './difficulty.mjs';
import { COSMETIC_SLOTS, cosmeticArt, drawWeaponHud, weaponName } from './arsenal-ui.mjs';
import { createArmoryScreen } from './armory-screen.mjs';
import { levelBossStatus } from './level-bosses.mjs';
import { createDiseaseGuide } from './disease-guide.mjs';
import { createUpgradeCards, drawIntel, drawLoadout, drawOperatorCard } from './deployment.mjs';
import './interface-setup.mjs';
import { session } from './session.mjs';
import { byId, isTouch, reducedMotion, pad, clamp, setText } from './dom.mjs';
import { bestKey, muteKey, junctionKey, heartKey, tutorialKey, sensitivityKey, qualityKey, checkpointKey, unlockedKey, practiceLoadoutKey, weaponLoadoutKey, weaponModKey, weaponFinishKey, coopNameKey, megaVirusKey, musicVolumeKey, effectsVolumeKey, readSetting, writeSetting } from './settings-store.mjs';
import { campaignAreas, missions, missionName, nextMission } from './mission-text.mjs';
import { game, hitMarker, turretStatus, touchTurret, gashMarker, gashEdge, junctionSupply, supplyButtons, branches, nodeHitUntil, drawJunctionStatus, drawTurretHud, resetHud, drawPlayerScores, drawHud, drawMarkers, drawAttackers, drawBranches, drawCombatFeedback } from './hud.mjs';
import { alertBox, announce, applyEvents } from './field-events.mjs';
import {
  canvas, clearControls, commands, controllerFrame, controls, input, keys, pauseDialog, releaseMouse, requestMouse,
  syncControllerAudioHint, touch, touchControls,
} from './controls.mjs';
import { armoryDialog, armoryEvents, armoryOpen, openArmory, setupArmory } from './armory-menu.mjs';

const menu = byId('menu');
const aiDebug = new AIDebugSystem(document);
const deploy = byId('deploy');
const newCampaignButton = byId('new-campaign');
const newCampaignDialog = byId('new-campaign-dialog');
const newCampaignDetail = byId('new-campaign-detail');
const coopOpen = byId('coop-open');
const coopDialog = byId('coop-dialog');
const coopStatus = byId('coop-status');
const coopName = byId('coop-name');
const coopCode = byId('coop-code');
const coopEntry = byId('coop-entry');
const coopLobby = byId('coop-lobby');
const coopLink = byId('coop-link');
const coopReady = byId('coop-ready');
const coopRoster = byId('coop-roster');
const coopHud = byId('coop-hud');
const missionSelect = byId('mission-select');
const missionDialog = byId('mission-dialog');
const missionGallery = byId('mission-gallery');
const missionList = byId('mission-list');
const missionError = byId('mission-error');
const practiceDeploy = byId('deploy-practice');
const missionPreviewTitle = byId('mission-preview-title');
const missionPreviewDetail = byId('mission-preview-detail');
const practiceLoadout = byId('practice-loadout');
const practiceLoadoutDetail = byId('practice-loadout-detail');
const megaVirusDeploy = byId('deploy-mega-virus');
const megaVirusStatus = byId('mega-virus-status');
const megaVirusThumb = byId('mega-virus-thumb');
const missionThumbnails = [...missionDialog.querySelectorAll('.mission-thumb')];
const missionEntries = [...missionList.querySelectorAll('[data-deploy-area]')].map(button => ({
  area: button.dataset.deployArea, button, bossPractice: false,
}));
missionEntries.push({ area: 'brain', button: megaVirusDeploy, bossPractice: true });
for (const entry of missionEntries) {
  const index = document.createElement('span');
  index.className = 'mission-index';
  index.setAttribute('aria-hidden', 'true');
  index.textContent = entry.bossPractice ? '✦' : String(CAMPAIGN_AREAS.indexOf(entry.area) + 1).padStart(2, '0');
  entry.status = document.createElement('span');
  entry.status.className = 'mission-status';
  entry.button.append(index, entry.status);
}
let selectedPracticeMission = missionEntries[0];
const continueButton = byId('continue-mission');
const continueLabel = byId('continue-mission-label');
const resumeCampaignButton = byId('resume-campaign');
const resumeCampaignLabel = byId('resume-campaign-label');
const replay = byId('replay');
const replayLabel = byId('replay-label');
const resultKicker = byId('result-kicker');
const returnMenu = byId('return-menu');
const resultLaunchError = byId('result-launch-error');
const resultTissueStat = byId('result-tissue-stat');
const resultNodes = byId('result-nodes');
const campaignReward = byId('campaign-reward');
const campaignProgress = byId('campaign-progress');
const upgradeNote = byId('campaign-upgrade-note');
const upgradeButtons = [...document.querySelectorAll('[data-upgrade]')];
const campaignReport = byId('campaign-report');
const campaignTissueList = byId('campaign-tissue-list');
const campaignAverage = byId('campaign-average');
const manual = byId('manual-dialog');
const resultDialog = byId('result-dialog');
const resultTitle = byId('result-title');
const extractionDialog = byId('extraction-dialog');
const extractionTissue = byId('extraction-tissue');
const extractionNodes = byId('extraction-nodes');
const extractionSuit = byId('extraction-suit');
const extractionAmmo = byId('extraction-ammo');
const extractionBonus = byId('extraction-bonus');
const extractNow = byId('extract-now');
const stayOvertime = byId('stay-overtime');
const settingsDialog = byId('settings-dialog');
const sensitivityControl = byId('look-sensitivity');
const sensitivityValue = byId('look-sensitivity-value');
const qualityControl = byId('graphics-quality');
const campaignEquipped = byId('campaign-equipped');
const branchReadout = byId('branch-readout');
const valveReadout = byId('valve-readout');
session.audio = new GameAudio();

// Menu, co-op and campaign state; what is shared with other modules is on `session`.
let coopClient;
let coopHost;
let coopBusy = false;
let coopClock = 0;
let campaign = null;
let selectedUpgrade = null;
let practice = null;
let loading = false;
let lastFrame = 0;
let animation = 0;

// Saved settings and progress.
let bestScore = Number(readSetting(bestKey)) || 0;
session.muted = readSetting(muteKey) === 'true';
let unlockedMission = Math.max(
  campaignAreas.indexOf(readSetting(unlockedKey)),
  readSetting(heartKey) === 'true' ? 2 : readSetting(junctionKey) === 'true' ? 1 : 0,
);
// Where a saved campaign resumes (which mission and the results so far); not the wave checkpoint.
let campaignCheckpoint = readCheckpoint();
let megaVirusReached = readSetting(megaVirusKey) === 'true';
session.trainingComplete = readSetting(tutorialKey) === 'true';
session.sensitivity = clamp(Number.parseFloat(readSetting(sensitivityKey)) || 1, 0.5, 2.5);
let graphicsQuality = readSetting(qualityKey) === 'low' || (LOW_MEMORY && readSetting(qualityKey) !== 'high') ? 'low' : 'high';
const savedLevel = key => {
  const value = Number.parseFloat(readSetting(key));
  return Number.isFinite(value) ? clamp(value, 0, 1) : 1;
};
let musicVolume = savedLevel(musicVolumeKey);
let effectsVolume = savedLevel(effectsVolumeKey);
session.weaponLoadout = readWeaponLoadout();

// Missions always start with the primary weapon in hand.
function readWeaponLoadout() {
  try {
    const saved = JSON.parse(readSetting(weaponLoadoutKey));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) return normalizeWeaponLoadout({ ...saved, slot: 'primary' });
  } catch { /* Recover from a malformed setting using the legacy preferences. */ }
  return legacyWeaponLoadout(readSetting(weaponModKey), readSetting(weaponFinishKey));
}

function readCheckpoint() {
  try {
    const saved = JSON.parse(readSetting(checkpointKey));
    if (!saved || !Array.isArray(saved.results) || saved.results.length >= campaignAreas.length) return null;
    if (saved.upgrade !== null && !Object.hasOwn(FIELD_UPGRADES, saved.upgrade)) return null;
    const valid = saved.results.every((result, index) => result?.area === campaignAreas[index] &&
      [result.tissue, result.score, result.kills].every(Number.isFinite) &&
      Array.isArray(result.nodes) && result.nodes.length >= 2 &&
      result.nodes.every(node => typeof node?.name === 'string' && Number.isFinite(node.health)));
    return valid && saved.results.length <= unlockedMission ? saved : null;
  } catch {
    return null;
  }
}

function saveCheckpoint(run) {
  campaignCheckpoint = run;
  writeSetting(checkpointKey, JSON.stringify(run));
}

function syncSettings() {
  sensitivityControl.value = session.sensitivity;
  sensitivityValue.value = session.sensitivity.toFixed(2) + '×';
  qualityControl.value = graphicsQuality;
}

function setMuted(value) {
  session.muted = value;
  session.audio.setMuted(value);
  syncControllerAudioHint();
  writeSetting(muteKey, value);
  setText(byId('audio-setting-state'), value ? 'Muted' : 'Sound on');
  document.querySelectorAll('[data-mute]').forEach(button => {
    button.setAttribute('aria-pressed', String(value));
    button.title = value ? 'Unmute audio' : 'Mute audio';
    button.querySelector('use').setAttribute('href', value ? '#muted' : '#sound');
    const state = button.querySelector('[data-audio-label]');
    if (state) setText(state, value ? 'Audio muted' : 'Audio on');
  });
}

function syncMusic() {
  let mode = 'silent';
  if (!session.paused && !document.hidden) {
    const counterattack = session.running && session.sim.gastric && session.sim.phase === 'intermission' && session.sim.enemies.length > 0;
    const recovering = session.running && ((session.sim.phase === 'intermission' && !counterattack) || session.sim.tutorial === 'repair' || session.sim.valve?.colonyDefeated);
    if (session.running && (session.sim.phase === 'combat' || counterattack) && !recovering) mode = 'combat';
    else if (!menu.hidden || recovering) mode = 'drift';
  }
  session.audio.setMusic(mode);
}

function displayBest() {
  const best = byId('high-score');
  best.hidden = bestScore === 0;
  setText(byId('high-score-value'), bestScore.toLocaleString());
}

function displayMissionAccess() {
  const unavailable = loading || !session.ready;
  const routeArea = deployment.mode === 'campaign' ? campaignArea() : null;
  for (const { button, bossPractice, area } of missionEntries) {
    button.disabled = unavailable || (bossPractice && !megaVirusReached) || (routeArea && (bossPractice || area !== routeArea));
  }
  deploy.disabled = missionSelect.disabled = armoryOpen.disabled = unavailable;
  coopOpen.disabled = unavailable;
  newCampaignButton.disabled = unavailable;
  practiceLoadout.disabled = unavailable;
  practiceDeploy.disabled = selectedPracticeMission.button.disabled;
  setText(megaVirusStatus, megaVirusReached ? 'Start at Wave 3 with fresh supplies.' : 'Reach the Mega Virus in Neural Cortex to unlock.');
  megaVirusThumb.hidden = !megaVirusReached || !megaVirusThumb.naturalWidth;
  resumeCampaignButton.hidden = !campaignCheckpoint;
  resumeCampaignButton.disabled = unavailable;
  newCampaignButton.hidden = !campaignCheckpoint;
  deploy.hidden = !!campaignCheckpoint;
  if (campaignCheckpoint) {
    const next = campaignCheckpoint.results.length;
    setText(resumeCampaignLabel, 'Mission ' + (next + 1) + ' of ' + campaignAreas.length + ' · ' + missionName(campaignAreas[next]));
  }
  drawOperator();
}

function drawOperator() {
  drawOperatorCard({
    secured: campaignCheckpoint ? campaignCheckpoint.results.length : Math.min(unlockedMission, campaignAreas.length),
    areas: campaignAreas, missionName, best: bestScore,
    difficulty: DIFFICULTIES[currentDifficulty()]?.name ?? 'Medium',
    loadout: session.weaponLoadout,
  });
}

function updatePracticeLoadout() {
  const id = practiceLoadout.value;
  const upgrade = FIELD_UPGRADES[id];
  setText(practiceLoadoutDetail, upgrade?.description ?? 'Standard equipment without a field upgrade.');
  upgradeCards?.sync();
}

function savedPracticeLoadout() {
  const saved = readSetting(practiceLoadoutKey);
  return Object.hasOwn(FIELD_UPGRADES, saved) ? saved : 'standard';
}

function setupLoadouts() {
  practiceLoadout.value = savedPracticeLoadout();
  upgradeCards = createUpgradeCards(byId('deploy-upgrades'), practiceLoadout);
  for (const button of upgradeButtons) {
    const { name, description } = FIELD_UPGRADES[button.dataset.upgrade];
    setText(button.querySelector('strong'), name);
    const detail = button.querySelector('[data-upgrade-detail]') ?? button.querySelector('span');
    setText(detail, description);
  }
  updatePracticeLoadout();
}

async function prepareGame() {
  await paintLoading();
  try {
    if (!session.world) session.world = new World(canvas);
    session.world.setQuality(graphicsQuality);
    const upgradeArt = new Image();
    upgradeArt.src = FIELD_UPGRADE_ART;
    const titleArt = new Image();
    titleArt.src = './assets/hero.webp';
    await Promise.all([
      session.world.prepareAll(campaignAreas, (done, total, label) => {
        loadingScreen.progress(4 + 76 * done / total, label || 'Preparing arenas and effects');
      }),
      session.audio.prepare(),
      ...Object.keys(ENEMY_MODELS).map(type => {
        const portrait = new Image();
        portrait.src = new URL('./assets/enemies/portraits/' + type + '.webp', import.meta.url).href;
        return portrait.decode();
      }),
      LOW_MEMORY ? Promise.resolve() : loadLab().then(lab => { if (!lab) throw new Error('The miniaturization lab could not load'); }),
      upgradeArt.decode(), titleArt.decode(),
      ...missionThumbnails.map(image => image.decode().catch(() => { image.hidden = true; })),
      document.fonts.ready,
    ]);
    applyRenderedPreviews(document, session.world.previews);
    loadingScreen.progress(81, 'Photographing the arsenal');
    await paintLoading();
    session.armoryArt = await prepareArmoryArt(session.world.renderer);
    // Desktop prepares all cards now; mobile uses the armory's existing first-visit cache.
    for (const [i, weapon] of (LOW_MEMORY ? [] : Object.keys(WEAPON_TYPES)).entries()) {
      const cards = session.armoryArt.thumbnailsFor(weapon);
      await Promise.all(Object.values(cards).flatMap(options => Object.values(options)).map(image => image.decode()));
      loadingScreen.progress(84 + 2 * i, 'Preparing ' + weaponName(weapon) + ' part cards');
      await paintLoading();
    }
    setupArmory();
    loadingScreen.progress(95, LOW_MEMORY ? 'Checking the insertion site' : 'Preparing the miniaturization lab and suit portraits');
    await paintLoading();
    if (!LOW_MEMORY) await getCoopClient().lobby.prepare();
    loadingScreen.progress(97, 'Checking your carried weapons');
    await session.world.prepareMission(new Simulation('artery', { weaponLoadout: session.weaponLoadout }), () => {});
    session.ready = true;
    displayMissionAccess();
    await loadingScreen.finish();
    if (new URL(location.href).searchParams.has('debug')) {
      window.__immune = { launch: area => { if (session.running) mainMenu(); return launch(area, null, { upgrade: null }); }, sim: () => session.sim, world: session.world, resume };
    }
    if (roomCode(new URL(location.href).searchParams.get('room'))) {
      const intro = byId('studio-intro');
      if (intro.open) intro.addEventListener('close', openCoop, { once: true });
      else openCoop();
    }
  } catch (error) {
    console.error('Could not prepare Immune Protocol', error);
    loadingScreen.fail('The device could not finish loading the game. Close other tabs and retry. A connection or graphics-memory limit may have interrupted preparation.');
  }
}

function roomCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  return code.length === COOP_CODE_LENGTH && [...code].every(char => COOP_CODE_ALPHABET.includes(char)) ? code : '';
}

function setInviteCode(code) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  if (url.href !== location.href) history.replaceState(null, '', url);
}

function setCoopStatus(message = '') {
  coopStatus.hidden = !message;
  setText(coopStatus, message);
}

function syncCoopIndicators() {
  if (!coopClient?.session) return;
  const { room, localPlayer, connected } = coopClient;
  const partners = room?.players.filter(player => player.id !== localPlayer?.id) ?? [];
  const allies = session.sim?.players?.filter(player => player.id !== coopClient.session.id) ?? [];
  const reconnectTime = room?.reconnectDeadline ? Math.max(0, Math.ceil((room.reconnectDeadline - Date.now()) / 1000)) : 0;
  const down = session.sim?.player?.downed;
  setText(byId('coop-ally'), partners.length ? partners.map(partner => {
    const ally = allies.find(player => player.id === partner.id);
    return partner.name + (ally?.downed ? ' · Down' : '');
  }).join(' / ') : 'Online co-op');
  setText(byId('coop-match-status'), !connected ? 'Reconnecting…'
    : room?.reconnectDeadline ? 'Waiting for teammate · ' + reconnectTime + 's'
      : down ? (session.sim.wave < session.sim.waves ? 'Suit down · Rejoin next wave' : 'Suit down · Teammate still active')
        : allies.length ? allies.map(ally => (ally.name || 'Teammate') + ': ' + (ally.downed ? 'Down' : Math.ceil(ally.health) + '%')).join(' / ') : 'Connected');
}

function syncCoopRoom() {
  const room = coopClient?.room;
  const session = coopClient?.session;
  coopEntry.hidden = !coopHost || !!session;
  coopLobby.hidden = !room || !session;
  byId('coop-create').disabled = coopBusy;
  byId('coop-join').querySelector('button').disabled = coopBusy;
  if (!room || !session) return;
  if (session.onlineRun && !session.running && room.phase === 'lobby') {
    mainMenu(true);
    openCoop();
    return;
  }
  const invite = new URL(location.pathname, location.origin);
  invite.searchParams.set('room', session.code);
  coopLink.value = invite.href;
  setText(byId('coop-room-code'), session.code);
  const roster = room.players.map(player => {
    const row = document.createElement('li');
    const name = document.createElement('strong');
    const status = document.createElement('span');
    name.textContent = player.name + (player.id === session.id ? ' (you)' : '');
    status.textContent = !player.connected ? 'Reconnecting' : player.ready ? 'Ready' : 'Preparing';
    status.dataset.ready = String(player.ready && player.connected);
    row.append(name, status);
    return row;
  });
  while (roster.length < COOP_MAX_PLAYERS) {
    const row = document.createElement('li');
    row.textContent = roster.length < COOP_MIN_PLAYERS ? 'Waiting for a teammate' : 'Optional third player';
    roster.push(row);
  }
  coopRoster.replaceChildren(...roster);
  const local = coopClient.localPlayer;
  coopReady.disabled = !coopClient.connected || !local || !['lobby', 'finished'].includes(room.phase);
  setText(coopReady.firstChild, local?.ready ? 'Cancel ready ' : 'Ready ');
  byId('coop-close').setAttribute('aria-label', 'Leave room and close online co-op');
  if (coopDialog.open) {
    setCoopStatus(!coopClient.connected ? 'Reconnecting to the room…' : room.phase === 'finished' ? 'Ready up at the mission checkpoint.'
      : room.players.length < COOP_MIN_PLAYERS ? 'Invite one or two friends to join.'
        : room.players.length < COOP_MAX_PLAYERS ? 'Ready up to deploy as a pair, or invite a third player before everyone is ready.'
          : 'All three players must ready up to deploy.');
  }
  if (session.onlineRun && resultDialog.open) syncCoopCheckpoint();
  syncCoopIndicators();
}

function clearCoopRoom(notifyServer) {
  coopClient?.stop(notifyServer);
  clearInterval(coopClock);
  coopClock = 0;
  coopBusy = false;
  setInviteCode('');
  byId('coop-close').setAttribute('aria-label', 'Close online co-op');
  syncCoopRoom();
}

function handleCoopEnd(message) {
  if (session.onlineRun) mainMenu();
  clearCoopRoom(false);
  if (!coopDialog.open) coopDialog.showModal();
  setCoopStatus(message);
  byId('coop-title').focus({ preventScroll: true });
}

function getCoopClient() {
  if (coopClient) return coopClient;
  coopClient = new CoopClient();
  coopClient.addEventListener('connection', event => {
    coopBusy = true;
    if (session.onlineRun) clearControls();
    if (coopDialog.open) setCoopStatus(event.detail === 'reconnecting' ? 'Reconnecting to the room…' : 'Connecting to the game server…');
    if (session.onlineRun && resultDialog.open) syncCoopCheckpoint();
    syncCoopIndicators();
  });
  coopClient.addEventListener('session', event => {
    coopBusy = false;
    setInviteCode(event.detail.code);
    if (!coopClock) coopClock = setInterval(syncCoopIndicators, 500);
  });
  coopClient.addEventListener('room', syncCoopRoom);
  coopClient.addEventListener('state', event => {
    const state = event.detail;
    const phase = coopClient.room?.phase;
    if (!session.running && (session.onlineRun || coopDialog.open) && ['playing', 'intermission'].includes(phase)) {
      launch(state.area, null, null, coopClient.view);
    } else if (!session.running && !session.onlineRun && coopDialog.open && phase === 'finished') {
      session.sim = coopClient.view;
      session.onlineRun = true;
      coopDialog.close();
      finish();
    } else if (session.onlineRun && session.running && session.paused && ['won', 'lost'].includes(state.phase)) {
      session.sim = coopClient.frame(0, input, performance.now());
      settingsDialog.close();
      armoryDialog.close();
      pauseDialog.close();
      session.paused = false;
      finish();
    }
  });
  coopClient.addEventListener('problem', event => {
    coopBusy = false;
    if (session.onlineRun && !coopClient.session) handleCoopEnd(event.detail);
    else {
      syncCoopRoom();
      setCoopStatus(event.detail);
    }
  });
  coopClient.addEventListener('ended', event => handleCoopEnd(event.detail));
  return coopClient;
}

async function openCoop() {
  if (!session.ready || session.running || coopDialog.open) return;
  const url = new URL(location.href);
  const code = roomCode(url.searchParams.get('room'));
  if (PUBLIC_COOP_ORIGIN && url.hostname.endsWith('.github.io')) {
    const online = new URL(PUBLIC_COOP_ORIGIN);
    if (code) online.searchParams.set('room', code);
    location.assign(online.href);
    return;
  }
  coopDialog.showModal();
  coopDialog.scrollTop = 0;
  byId('coop-title').focus({ preventScroll: true });
  if (!coopHost) {
    setCoopStatus('Finding the game server…');
    coopHost = await verifyCoopHost();
  }
  if (!coopDialog.open) return;
  if (!coopHost) {
    setCoopStatus('Open the multiplayer server’s game URL to create or join a room.');
    return;
  }
  if (code) coopCode.value = code;
  coopName.value = readSetting(coopNameKey) ?? '';
  const client = getCoopClient();
  if (LOW_MEMORY) {
    setCoopStatus('Preparing the miniaturization lab…');
    try { await client.lobby.prepare(); }
    catch (error) {
      console.error('Could not prepare the co-op lab', error);
      setCoopStatus('The lab could not finish loading. Close and reopen online co-op to retry.');
      return;
    }
    if (!coopDialog.open) return;
  }
  const saved = code && savedCoopSession(code);
  setCoopStatus(code ? 'You’ve been invited to room ' + code + '.' : '');
  if (saved && !client.session) client.connect({ type: 'resume', code, token: saved.token });
  syncCoopRoom();
}

function enterCoop(type, code) {
  if (!coopHost || coopBusy) return;
  const name = coopName.value.trim();
  writeSetting(coopNameKey, name);
  getCoopClient().connect({ type, name, code, loadout: session.weaponLoadout });
  syncCoopRoom();
}

// The checkpoint a mission can resume from: the start of the current wave once past the first,
// or of the lungs' airway objective. null when a retry would be the same as starting over.
function waveCheckpoint(sim = session.sim) {
  const checkpoint = sim?.checkpoint;
  return checkpoint && (checkpoint.wave > 1 || checkpoint.stage === 'airway') ? checkpoint : null;
}

function checkpointName(checkpoint) {
  return checkpoint.stage === 'airway' ? 'the airway' : checkpoint.overtime ? 'Overtime' : 'wave ' + checkpoint.wave;
}

// checkpoint: resume this mission at the start of a wave reached in an earlier attempt.
async function launch(area, run = null, drill = null, onlineState = null, checkpoint = null) {
  const junction = area === 'junction';
  const heart = area === 'heart';
  const index = campaignAreas.indexOf(area);
  if (!session.ready || loading || session.running || index < 0 || (!drill && !onlineState && index > unlockedMission)) return;
  if (drill?.bossPractice && (area !== 'brain' || !megaVirusReached)) return;
  const fromResult = resultDialog.open;
  const fromMissionList = missionDialog.open;
  const previousControl = document.activeElement;
  const previousSim = session.sim;
  const previousRun = campaign;
  const previousPractice = practice;
  const previousUpgrade = selectedUpgrade;
  loading = true;
  deploy.disabled = true;
  missionDialog.close();
  if (onlineState) {
    coopDialog.close();
    armoryDialog.close();
  }
  displayMissionAccess();
  byId('menu-error').hidden = true;
  missionError.hidden = true;
  resultLaunchError.hidden = true;
  resultDialog.close();
  game.hidden = false;
  requestMouse();
  const unlocked = Promise.resolve(session.audio.unlock()).catch(() => {});
  try {
    session.world.setArea(area);
    session.world.setQuality(graphicsQuality);
    const upgrade = run?.upgrade ?? drill?.upgrade;
    const nextSim = onlineState ?? new Simulation(area, {
      tutorial: area === 'artery' && !session.trainingComplete && !drill && !checkpoint,
      upgrades: upgrade ? [upgrade] : [],
      bossPractice: !!drill?.bossPractice,
      weaponLoadout: { ...session.weaponLoadout, slot: 'primary' },
    });
    loadingScreen.begin(missionName(area), 'Preparing the arena, your loadout and combat effects before insertion.', 'MISSION ' + String(index + 1).padStart(2, '0') + ' / ' + campaignAreas.length);
    await paintLoading();
    await session.world.prepareMission(nextSim, (value, label) => loadingScreen.progress(value, label));
    if (!onlineState) nextSim.start(checkpoint);
    session.sim = nextSim;
    session.onlineRun = Boolean(onlineState);
    coopHud.hidden = !session.onlineRun;
    campaign = run;
    practice = drill;
    selectedUpgrade = null;
    menu.hidden = true;
    touchControls.hidden = !isTouch || session.usingGamepad;
    clearControls();
    const equipped = upgrade && FIELD_UPGRADES[upgrade]?.name;
    campaignEquipped.hidden = !equipped;
    setText(campaignEquipped, equipped || '');
    game.dataset.area = session.sim.area;
    canvas.setAttribute('aria-label', 'First-person view of ' + missionName(area));
    canvas.focus({ preventScroll: true });
    branchReadout.hidden = !junction;
    valveReadout.hidden = !heart;
    gashMarker.hidden = gashEdge.hidden = true;
    delete game.dataset.valve;
    for (const branch of Object.values(branches)) branch.marker.hidden = true;
    lastFrame = 0;
    session.damageTimer = 0;
    resetHud();
    session.restoredNode = null;
    session.hitTimer = 0;
    session.guardHintUntil = 0;
    session.running = true;
    session.paused = false;
    session.audio.setActive(true);
    syncMusic();
    const mission = session.sim;
    Promise.resolve(unlocked).then(() => {
      if (session.running && !session.paused && session.sim === mission && session.sim.clock < 1.25) session.audio.play({ type: 'deploy' });
    }).catch(() => {});
    if (checkpoint) announce(checkpointName(checkpoint).toUpperCase(), 'RESUMED FROM CHECKPOINT', 3.2);
    else if (session.onlineRun) announce(missionName(area).toUpperCase(), 'CO-OP MISSION ' + (index + 1) + ' OF ' + campaignAreas.length, 2.7);
    else if (drill?.bossPractice) announce('MEGA VIRUS PRACTICE', 'SHOOT EXPOSED CORES', 1.9);
    else if (heart) announce('HEART VALVE', 'HIT THE COLONY · DEFEND THE FLANK', 3.2);
    else if (junction) announce('CAPILLARY JUNCTION', 'DEFEND BOTH INLETS', 2.8);
    else if (nextSim.organ) announce(missionName(area).toUpperCase(), ORGAN_MISSIONS[area].hazard.instruction.toUpperCase(), 2.4);
    else if (!session.sim.tutorial) announce('WAVE 01', (session.sim.nodes.length > 2 ? 'DEFEND ALL THREE' : 'DEFEND BOTH') + ' TISSUE NODES', 3.1);
    else {
      session.announcementTimer = 0;
      alertBox.replaceChildren();
    }
    drawHud();
    await loadingScreen.finish();
    canvas.focus({ preventScroll: true });
    if (run) saveCheckpoint(run);
    cancelAnimationFrame(animation);
    animation = requestAnimationFrame(frame);
    if (session.onlineRun) syncCoopRoom();
  } catch (error) {
    await loadingScreen.finish();
    console.error('Could not start Immune Protocol', error);
    session.running = false;
    session.onlineRun = false;
    coopHud.hidden = true;
    session.audio.setActive(false);
    releaseMouse();
    session.sim = previousSim;
    campaign = previousRun;
    practice = previousPractice;
    selectedUpgrade = previousUpgrade;
    if (fromResult) {
      game.dataset.area = session.sim.area;
      resultLaunchError.textContent = 'Could not start the mission. Try again.';
      resultLaunchError.hidden = false;
      resultDialog.showModal();
      previousControl?.focus();
      return;
    }
    game.hidden = true;
    menu.hidden = false;
    syncMusic();
    if (onlineState) {
      handleCoopEnd('Could not initialize co-op graphics. Enable WebGL 2 and try again.');
      return;
    }
    const message = fromMissionList ? missionError : byId('menu-error');
    message.textContent = 'Could not initialize 3D graphics. Try a browser with WebGL 2 and hardware acceleration enabled.';
    message.hidden = false;
    if (fromMissionList) missionDialog.showModal();
  } finally {
    loading = false;
    displayMissionAccess();
    if (fromMissionList && missionDialog.open) previousControl?.focus();
  }
}

// Solo runs name their difficulty on the pause screen and mission report.
function difficultyTag() {
  return !session.onlineRun && DIFFICULTIES[session.sim?.difficulty] ? ' · ' + DIFFICULTIES[session.sim.difficulty].name : '';
}

function pause() {
  if (!session.running || session.paused || session.sim.extractionPending) return;
  suspendCombat();
  setText(byId('pause-mission'), missionName(session.sim.area) + difficultyTag());
  setText(byId('pause-wave'), Math.min(session.sim.wave, session.sim.waves) + ' / ' + session.sim.waves);
  setText(byId('pause-score'), session.sim.score.toLocaleString());
  setText(byId('pause-tissue'), Math.round(session.sim.tissue) + '%');
  setText(byId('pause-objective'), practice?.bossPractice
    ? 'Follow the pulse to the core about to open and shoot the exposed tissue.' : missions[session.sim.area].briefing);
  byId('restart-mission').hidden = session.onlineRun;
  const checkpoint = session.onlineRun ? null : waveCheckpoint();
  restartWave.hidden = !checkpoint;
  if (checkpoint) setText(restartWave, 'Restart from ' + checkpointName(checkpoint));
  disarmQuit();
  setText(byId('pause-detail'), session.onlineRun ? 'The online match continues while this menu is open.' : session.usingGamepad
    ? 'Press Menu to resume the mission.' : isTouch
    ? 'Combat and wave timers are on hold.'
    : 'Resume to capture the mouse. If it stays free, drag the view or use the arrow keys to look.');
  pauseDialog.showModal();
}

function suspendCombat() {
  session.paused = true;
  cancelAnimationFrame(animation);
  animation = 0;
  clearControls();
  if (session.onlineRun) coopClient.neutralize();
  session.audio.setActive(false);
  syncMusic();
  releaseMouse();
}

function resume() {
  if (!session.running || !session.paused) return;
  pauseDialog.close();
  session.paused = false;
  lastFrame = 0;
  clearControls();
  session.audio.unlock().catch(() => {});
  session.audio.setActive(true);
  syncMusic();
  canvas.focus({ preventScroll: true });
  requestMouse();
  animation = requestAnimationFrame(frame);
}

function offerExtraction() {
  clearControls();
  session.audio.setActive(false);
  syncMusic();
  releaseMouse();
  setText(extractionTissue, Math.round(session.sim.tissue) + '%');
  drawNodeBreakdown(extractionNodes, session.sim.nodes);
  setText(extractionSuit, Math.ceil(session.sim.player.health) + '%');
  setText(extractionAmmo, session.sim.player.ammo + ' / ∞');
  setText(extractionBonus, '+' + session.sim.overtimeForecast.bonus.toLocaleString() + ' score');
  extractionDialog.showModal();
  extractNow.focus();
}

function chooseExtraction(choice) {
  if (!session.running || !extractionDialog.open || !session.sim.chooseExtraction(choice)) return;
  extractionDialog.close();
  clearControls();
  if (choice === 'extract') {
    finish();
    return;
  }
  lastFrame = 0;
  session.audio.unlock().catch(() => {});
  session.audio.setActive(true);
  syncMusic();
  requestMouse();
  applyEvents();
  animation = requestAnimationFrame(frame);
}

function mainMenu(keepRoom = false) {
  session.running = false;
  aiDebug.update(session.sim, performance.now(), false);
  session.paused = false;
  campaign = null;
  practice = null;
  selectedUpgrade = null;
  clearControls();
  session.audio.setActive(false);
  releaseMouse();
  cancelAnimationFrame(animation);
  coopDialog.close();
  settingsDialog.close();
  armoryDialog.close();
  missionDialog.close();
  pauseDialog.close();
  extractionDialog.close();
  resultDialog.close();
  if (!keepRoom && (coopClient?.session || session.onlineRun)) clearCoopRoom(true);
  session.onlineRun = false;
  coopHud.hidden = true;
  game.hidden = true;
  menu.hidden = false;
  syncMusic();
  displayBest();
  displayMissionAccess();
  (campaignCheckpoint ? resumeCampaignButton : deploy).focus();
}

// One deployment briefing serves Free Mode and the campaign. On the campaign route the
// secured missions and the next one show their status, and only the next one deploys.
let deployment = { mode: 'free', run: null };
let upgradeCards = null;

function campaignArea() {
  return deployment.run ? campaignAreas[deployment.run.results.length] : null;
}

function openDeployment(mode, run = null) {
  deployment = { mode, run };
  missionDialog.dataset.mode = mode;
  missionError.hidden = true;
  const next = run?.results.length ?? 0;
  setText(byId('deploy-mode'), mode === 'campaign'
    ? 'Campaign · Mission ' + (next + 1) + ' of ' + campaignAreas.length : 'Free Mode');
  setText(byId('mission-intro'), mode === 'free' ? 'Replay any mission. Campaign saves and records stay separate.'
    : next ? 'Your checkpoint is saved. Review the briefing and your kit, then continue.'
      : 'Ten missions from the bloodstream to the brain. Review the briefing and your kit, then begin.');
  setText(byId('deploy-go-label'), mode === 'free' ? 'Deploy' : next ? 'Continue campaign' : 'Begin campaign');
  practiceLoadout.value = mode === 'campaign' ? run.upgrade ?? 'standard' : savedPracticeLoadout();
  updatePracticeLoadout();
  for (const entry of missionEntries) {
    const index = campaignAreas.indexOf(entry.area);
    const status = mode !== 'campaign' || entry.bossPractice ? ''
      : index < next ? 'Secured' : index === next ? 'Next' : 'Locked';
    entry.button.dataset.status = status.toLowerCase();
    setText(entry.status, status);
  }
  drawLoadout(byId('deploy-loadout'), session.weaponLoadout);
  displayMissionAccess();
  missionDialog.showModal();
  selectPracticeMission(mode === 'campaign'
    ? missionEntries.find(entry => !entry.bossPractice && entry.area === campaignArea())
    : selectedPracticeMission.button.disabled ? missionEntries[0] : selectedPracticeMission);
}

function openFreeMode() {
  openDeployment('free');
}

function selectPracticeMission(entry) {
  if (entry.button.disabled) return;
  selectedPracticeMission = entry;
  for (const choice of missionEntries) {
    choice.button.tabIndex = choice === entry ? 0 : -1;
    choice.button.setAttribute('aria-checked', String(choice === entry));
  }
  const { name, briefing } = entry.bossPractice
    ? { name: 'Mega Virus Practice', briefing: 'Start at Wave 3. Shoot the cores as the membranes open.' }
    : missions[entry.area];
  setText(missionPreviewTitle, name);
  setText(missionPreviewDetail, briefing);
  const art = entry.button.querySelector('img');
  if (art?.src) byId('deploy-hero-art').src = art.src;
  setText(byId('deploy-hero-kicker'), entry.bossPractice ? 'Boss practice · Neural Cortex'
    : 'Mission ' + String(campaignAreas.indexOf(entry.area) + 1).padStart(2, '0') + ' of ' + campaignAreas.length);
  drawIntel(byId('deploy-intel'), byId('deploy-threats'), entry.area, entry.bossPractice);
  practiceDeploy.setAttribute('aria-label', 'Deploy to ' + name);
  missionError.hidden = true;
  entry.button.focus();
}

function returnFromResult() {
  const freeMode = !!practice;
  mainMenu();
  if (freeMode) {
    missionSelect.focus();
    openFreeMode();
  }
}

function startCampaign() {
  openDeployment('campaign', { results: [], upgrade: null });
}

function missionResult() {
  const nodes = session.sim.nodes.map(({ name, health }) => ({ name, health }));
  return { area: session.sim.area, tissue: session.sim.tissue, nodes, score: session.sim.score, kills: session.sim.kills };
}

function continueMission() {
  if (session.onlineRun) {
    readyAtCoopCheckpoint();
    return;
  }
  if (!campaign || !resultDialog.open || session.sim.phase !== 'won') return;
  const area = nextMission(session.sim.area);
  if (!area) return;
  launch(area, campaignCheckpoint);
}

function readyAtCoopCheckpoint() {
  if (resultDialog.open && coopClient.room?.phase === 'finished' && coopClient.localPlayer) {
    coopClient.setReady(!coopClient.localPlayer.ready, session.weaponLoadout);
  }
}

function syncCoopCheckpoint() {
  const room = coopClient.room;
  const next = room?.nextArea;
  const waiting = !coopClient.connected || room?.reconnectDeadline;
  const resume = session.sim.phase === 'won' ? null : waveCheckpoint();
  const action = next ? 'Ready for ' + missionName(next) : session.sim.phase === 'won' ? 'Play campaign again'
    : resume ? 'Retry from ' + checkpointName(resume) : 'Retry mission';
  const label = waiting ? 'Waiting for reconnection' : coopClient.localPlayer?.ready ? 'Ready · Cancel' : action;
  continueButton.disabled = replay.disabled = Boolean(waiting || room?.phase !== 'finished');
  setText(next ? continueLabel : replayLabel, label);
  setText(byId('coop-checkpoint-status'), (room?.players.filter(player => player.ready && player.connected).length ?? 0) + ' of ' + (room?.players.length ?? COOP_MIN_PLAYERS) + ' ready');
}

function updateUpgradeChoice() {
  for (const button of upgradeButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.upgrade === selectedUpgrade));
  }
  setText(upgradeNote, FIELD_UPGRADES[selectedUpgrade].name + ' selected for ' + missionName(nextMission(session.sim.area)) + '.');
  saveCheckpoint({ results: [...campaign.results, missionResult()], upgrade: selectedUpgrade });
}

function drawCampaignReport(results) {
  const rows = results.map(result => {
    const row = document.createElement('div');
    const title = document.createElement('dt');
    const tissue = document.createElement('dd');
    title.textContent = missionName(result.area);
    tissue.textContent = Math.round(result.tissue) + '%';
    const breakdown = document.createElement('small');
    breakdown.className = 'campaign-node-detail';
    breakdown.textContent = result.nodes.map(node => node.name + ' ' + Math.ceil(node.health) + '%').join(' · ');
    title.append(breakdown);
    row.append(title, tissue);
    return row;
  });
  campaignTissueList.replaceChildren(...rows);
  const total = results.reduce((sum, result) => sum + result.tissue, 0);
  setText(campaignAverage, Math.round(total / results.length) + '%');
}

function drawNodeBreakdown(container, nodes) {
  container.replaceChildren(...nodes.map(node => {
    const row = document.createElement('div');
    const label = document.createElement('dt');
    const value = document.createElement('dd');
    label.textContent = node.name;
    value.textContent = Math.ceil(node.health) + '%';
    row.append(label, value);
    return row;
  }));
  container.hidden = false;
}

function finish() {
  session.running = false;
  aiDebug.update(session.sim, performance.now(), false);
  extractionDialog.close();
  clearControls();
  releaseMouse();
  session.audio.setActive(false);
  syncMusic();
  const won = session.sim.phase === 'won';
  const junction = session.sim.area === 'junction';
  const heart = session.sim.area === 'heart';
  const bossPractice = !!practice?.bossPractice;
  // A lost mission offers to resume at its checkpoint (in co-op the squad's ready-up does that).
  const resume = won ? null : waveCheckpoint();
  const next = won ? (session.onlineRun ? coopClient.room?.nextArea : campaign ? nextMission(session.sim.area) : null) : null;
  const reward = Boolean(campaign && next);
  const complete = Boolean((campaign || session.onlineRun) && won && !next);
  if (campaign && next && campaignAreas.indexOf(next) > unlockedMission) {
    unlockedMission = campaignAreas.indexOf(next);
    writeSetting(unlockedKey, next);
  }
  if (reward) selectedUpgrade = campaign.upgrade ?? 'fast-sealer';
  if (complete && campaign) saveCheckpoint(null);
  displayMissionAccess();
  session.audio.play({ type: won ? 'won' : 'lost' });
  if (campaign && session.sim.score > bestScore) {
    bestScore = session.sim.score;
    writeSetting(bestKey, bestScore);
  }
  resultTitle.textContent = complete ? 'Campaign complete' : won && bossPractice ? 'Mega Virus defeated'
    : won ? (heart ? 'Valve stabilized' : junction ? 'Junction secured' : session.sim.organMission ? missionName(session.sim.area) + ' secured' : 'Artery secured') : 'Mission failed';
  resultKicker.lastChild.textContent = (session.onlineRun ? ' CO-OP REPORT' : practice ? ' FREE MODE REPORT' : ' MISSION REPORT') +
    difficultyTag().toUpperCase();
  setText(returnMenu, session.onlineRun ? 'Leave room' : practice ? 'Free Mode' : 'Main menu');
  let detail;
  const allNodes = session.sim.nodes.length > 2 ? 'All three tissue nodes' : 'Both tissue nodes';
  if (complete) detail = 'The Mega Virus is down. The infection is contained across all ' + campaignAreas.length + ' missions.';
  else if (won) {
    if (session.sim.overtimeBonus > 0) detail = 'Overtime cleared. +' + session.sim.overtimeBonus.toLocaleString() + ' score.';
    else if (session.sim.airway?.state === 'secured') detail = 'Both bronchi stayed open through a full breath.';
    else if (session.sim.gastric?.stage === 'drained') detail = 'The basin is drained and the lower passage is clear.';
    else if (session.sim.boss) detail = 'The Mega Virus is down and both tissue nodes survived.';
    else detail = next ? '' : allNodes + ' survived.';
    if (next) detail = [detail, missionName(next) + ' is open for deployment.'].filter(Boolean).join(' ');
  }
  else if (session.sim.overtime) {
    const cause = session.sim.failedNode ? session.sim.failedNode.name + ' failed.' : 'Your suit failed.';
    detail = cause + (resume ? '' : ' Redeploy to retry Capillary Junction from Wave 1.');
  }
  else detail = session.sim.failedNode ? session.sim.failedNode.name + ' tissue failed under pathogen attack.'
    : session.onlineRun ? 'Every suit went down under pathogen attack.' : 'Your suit failed under pathogen attack.';
  if (resume) detail += ' Your progress is saved at the start of ' + checkpointName(resume) + '.';
  byId('result-detail').textContent = detail;
  const result = missionResult();
  const results = complete ? (session.onlineRun ? coopClient.room.results : [...campaign.results, result]) : [result];
  byId('result-score').textContent = results.reduce((sum, result) => sum + result.score, 0).toLocaleString();
  byId('result-kills').textContent = results.reduce((sum, result) => sum + result.kills, 0).toLocaleString();
  byId('result-tissue').textContent = Math.round(result.tissue) + '%';
  resultTissueStat.hidden = complete;
  if (complete) resultNodes.hidden = true;
  else drawNodeBreakdown(resultNodes, result.nodes);
  continueButton.hidden = !next;
  if (next) setText(continueLabel, 'Enter ' + missionName(next));
  campaignReward.hidden = !reward;
  campaignReport.hidden = !complete;
  if (reward) {
    setText(campaignProgress, 'Mission ' + (campaignAreas.indexOf(session.sim.area) + 1) + ' of ' + campaignAreas.length);
    updateUpgradeChoice();
  }
  if (complete) drawCampaignReport(results);
  // A co-op campaign in progress keeps every won mission on the server, including this one.
  drawPlayerScores(session.onlineRun ? (won ? coopClient.room?.results ?? [] : []) : results, complete);
  setText(replayLabel, complete ? 'Restart campaign' : resume ? 'Retry from ' + checkpointName(resume) : bossPractice ? 'Practice again' : campaign ? 'Retry mission' : 'Redeploy');
  restartFromStart.hidden = !resume || session.onlineRun;
  replay.hidden = reward || Boolean(session.onlineRun && next);
  continueButton.disabled = replay.disabled = false;
  byId('coop-checkpoint-status').hidden = !session.onlineRun;
  if (session.onlineRun) syncCoopCheckpoint();
  replay.classList.toggle('primary', !next);
  replay.classList.toggle('outline', !!next);
  resultDialog.showModal();
  resultDialog.scrollTop = 0;
  resultTitle.focus({ preventScroll: true });
}

function frame(now) {
  animation = 0;
  if (!session.running) return;
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0;
  lastFrame = now;
  if (!session.paused) {
    const controller = controls.xboxState;
    input.moveX = clamp(Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + touch.x + (controller?.moveX ?? 0), -1, 1);
    input.moveZ = clamp(Number(keys.has('KeyW')) - Number(keys.has('KeyS')) + touch.z + (controller?.moveZ ?? 0), -1, 1);
    input.lookX += (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'))) * dt * 825;
    input.lookY += (Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'))) * dt * 650;
    input.lookX += (controller?.lookX ?? 0) * dt * 1150 * session.sensitivity;
    input.lookY += (controller?.lookY ?? 0) * dt * 920 * session.sensitivity;
    input.fire = controls.fireTap || controls.leftButton || touch.fire || keys.has('Space') || !!controller?.fire;
    input.reload = controls.reloadTap || keys.has('KeyR') || touch.reload;
    input.repair = keys.has('KeyE') || touch.repair || !!controller?.repair;
    input.deploy = controls.deployTap;
    input.swap = controls.swapTap;
    input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || !!controller?.sprint;
    input.aim = controls.rightButton || !!controller?.aim;
    session.hitTimer = Math.max(0, session.hitTimer - dt);
    session.damageTimer = Math.max(0, session.damageTimer - dt);
    if (session.announcementTimer > 0) {
      session.announcementTimer -= dt;
      if (session.announcementTimer <= 0) alertBox.replaceChildren();
    }
    if (dt > 0) {
      const phase = session.sim.phase;
      const tutorial = session.sim.tutorial;
      const colonyDefeated = session.sim.valve?.colonyDefeated;
      const enemiesActive = session.sim.enemies.length > 0;
      if (session.onlineRun) session.sim = coopClient.frame(dt, input, now) ?? session.sim;
      else session.sim.step(dt, input);
      if (!session.onlineRun && !megaVirusReached && session.sim.boss && !practice?.bossPractice) {
        megaVirusReached = true;
        writeSetting(megaVirusKey, 'true');
      }
      if (session.sim.phase !== phase || session.sim.tutorial !== tutorial || session.sim.valve?.colonyDefeated !== colonyDefeated ||
        (session.sim.gastric && session.sim.phase === 'intermission' && (session.sim.enemies.length > 0) !== enemiesActive)) syncMusic();
      applyEvents();
      controls.fireTap = false;
      controls.reloadTap = false;
      controls.deployTap = false;
      controls.swapTap = false;
      touch.reload = false;
    }
    const aiming = session.world.render(session.sim, dt, input, reducedMotion);
    aiDebug.update(session.sim, now, session.running);
    input.lookX = 0;
    input.lookY = 0;
    drawHud();
    drawMarkers();
    drawAttackers();
    drawBranches();
    drawCombatFeedback(aiming);
    if (session.sim.extractionPending) {
      offerExtraction();
      return;
    }
    if (session.sim.phase === 'won' || session.sim.phase === 'lost') {
      finish();
      return;
    }
  }
  animation = requestAnimationFrame(frame);
}

const diseaseGuide = createDiseaseGuide(byId('guide-dialog'), { missionName });
byId('guide').addEventListener('click', () => diseaseGuide.open());

byId('manual').addEventListener('click', () => {
  const active = byId(session.usingGamepad ? 'controller-manual' : isTouch ? 'touch-manual' : 'keyboard-manual');
  for (const id of ['controller-manual', 'touch-manual', 'keyboard-manual']) {
    byId(id).open = byId(id) === active;
  }
  byId('manual-controls-title').after(active);
  manual.showModal();
  manual.scrollTop = 0;
  byId('manual-title').focus({ preventScroll: true });
});
for (const button of supplyButtons) {
  button.addEventListener('click', () => {
    if (!session.running || session.paused || session.sim.extractionPending || !selectJunctionSupply(button.dataset.junctionSupply)) return;
    drawJunctionStatus();
    drawTurretHud();
  });
}

function selectJunctionSupply(choice) {
  return session.onlineRun ? coopClient.send({ type: 'supply', choice }) : session.sim.selectJunctionSupply(choice);
}
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => byId(button.dataset.close).close()));
document.querySelectorAll('[data-settings]').forEach(button => button.addEventListener('click', () => {
  if (!settingsDialog.open) settingsDialog.showModal();
}));
byId('settings-close').addEventListener('click', () => settingsDialog.close());
sensitivityControl.addEventListener('input', () => {
  session.sensitivity = clamp(sensitivityControl.valueAsNumber, 0.5, 2.5);
  sensitivityValue.value = session.sensitivity.toFixed(2) + '×';
  writeSetting(sensitivityKey, session.sensitivity);
});
function syncMix() {
  setText(byId('music-volume-value'), Math.round(musicVolume * 100) + '%');
  setText(byId('effects-volume-value'), Math.round(effectsVolume * 100) + '%');
  session.audio.setMix(musicVolume, effectsVolume);
}
for (const [id, key] of [['music-volume', musicVolumeKey], ['effects-volume', effectsVolumeKey]]) {
  const control = byId(id);
  control.value = id === 'music-volume' ? musicVolume : effectsVolume;
  control.addEventListener('input', () => {
    const value = clamp(control.valueAsNumber, 0, 1);
    if (id === 'music-volume') musicVolume = value;
    else effectsVolume = value;
    writeSetting(key, value);
    syncMix();
  });
}
syncMix();
qualityControl.addEventListener('change', () => {
  graphicsQuality = qualityControl.value;
  writeSetting(qualityKey, graphicsQuality);
  if (!session.world) return;
  session.world.setQuality(graphicsQuality);
  if (session.paused) session.world.render(session.sim, 0, input, reducedMotion);
});
menu.addEventListener('click', () => {
  if (!loading) session.audio.unlock().catch(() => {});
}, { once: true });
document.querySelectorAll('[data-mute]').forEach(button => button.addEventListener('click', () => {
  setMuted(!session.muted);
  if (!session.muted) session.audio.unlock().catch(() => {});
}));
deploy.addEventListener('click', startCampaign);
coopOpen.addEventListener('click', openCoop);
byId('coop-create').addEventListener('click', () => enterCoop('create'));
byId('coop-join').addEventListener('submit', event => {
  event.preventDefault();
  const code = roomCode(coopCode.value);
  if (!code) {
    setCoopStatus('Enter the eight-character room code from your invite.');
    coopCode.focus();
    return;
  }
  enterCoop('join', code);
});
byId('coop-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(coopLink.value);
    setCoopStatus('Invite link copied.');
  } catch {
    coopLink.focus();
    coopLink.select();
    setCoopStatus('Copy the selected invite link and send it to your friend.');
  }
});
byId('coop-customize').addEventListener('click', () => openArmory());
coopReady.addEventListener('click', () => {
  if (!coopClient?.localPlayer) return;
  session.audio.unlock().catch(() => {});
  coopClient.setReady(!coopClient.localPlayer.ready, session.weaponLoadout);
});
byId('coop-leave').addEventListener('click', () => {
  clearCoopRoom(true);
  setCoopStatus('You left the room.');
  coopName.focus();
});
function closeCoop() {
  clearCoopRoom(true);
  coopDialog.close();
}
byId('coop-close').addEventListener('click', closeCoop);
coopDialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeCoop();
});
newCampaignButton.addEventListener('click', () => {
  if (!campaignCheckpoint) return;
  const area = campaignAreas[campaignCheckpoint.results.length];
  setText(newCampaignDetail, 'Starting over replaces your saved checkpoint at ' + missionName(area) + '.');
  newCampaignDialog.showModal();
});
byId('confirm-new-campaign').addEventListener('click', () => {
  newCampaignDialog.close();
  startCampaign();
});
resumeCampaignButton.addEventListener('click', () => {
  if (campaignCheckpoint) openDeployment('campaign', campaignCheckpoint);
});
missionSelect.addEventListener('click', openFreeMode);
practiceLoadout.addEventListener('change', () => {
  if (deployment.mode === 'free') writeSetting(practiceLoadoutKey, practiceLoadout.value);
  updatePracticeLoadout();
});
byId('deploy-armory').addEventListener('click', () => openArmory());
armoryDialog.addEventListener('close', () => {
  drawLoadout(byId('deploy-loadout'), session.weaponLoadout);
  drawOperator();
});
missionDialog.addEventListener('close', drawOperator);
for (const entry of missionEntries) {
  entry.button.addEventListener('click', () => selectPracticeMission(entry));
}
missionGallery.addEventListener('keydown', event => {
  const available = missionEntries.filter(({ button }) => !button.disabled);
  const current = available.indexOf(selectedPracticeMission);
  if (current < 0) return;
  const count = available.length;
  const columns = getComputedStyle(missionList).gridTemplateColumns.split(' ').length;
  const bossAvailable = available[count - 1].bossPractice;
  const destinations = {
    ArrowLeft: (current + count - 1) % count,
    ArrowRight: (current + 1) % count,
    ArrowUp: current >= columns ? current - columns : current,
    ArrowDown: current + columns < count ? current + columns : bossAvailable ? count - 1 : current,
    Home: 0,
    End: count - 1,
  };
  if (!Object.hasOwn(destinations, event.key)) return;
  event.preventDefault();
  selectPracticeMission(available[destinations[event.key]]);
});
practiceDeploy.addEventListener('click', () => {
  const { area, bossPractice } = selectedPracticeMission;
  if (deployment.mode === 'campaign') {
    const upgrade = practiceLoadout.value === 'standard' ? null : practiceLoadout.value;
    launch(area, { ...deployment.run, upgrade });
  } else {
    launch(area, null, { upgrade: practiceLoadout.value, bossPractice });
  }
});
continueButton.addEventListener('click', continueMission);
for (const button of upgradeButtons) {
  button.addEventListener('click', () => {
    if (!resultDialog.open || campaignReward.hidden) return;
    selectedUpgrade = button.dataset.upgrade;
    updateUpgradeChoice();
  });
}
replay.addEventListener('click', () => {
  if (session.onlineRun) {
    readyAtCoopCheckpoint();
  } else if (campaign && session.sim.area === campaignAreas.at(-1) && session.sim.phase === 'won') launch('artery', { results: [], upgrade: null });
  else if (session.sim.phase === 'lost' && waveCheckpoint()) launch(session.sim.area, campaign, practice, null, waveCheckpoint());
  else launch(session.sim.area, campaign, practice);
});
const restartFromStart = byId('restart-from-start');
restartFromStart.addEventListener('click', () => launch(session.sim.area, campaign, practice));
returnMenu.addEventListener('click', returnFromResult);
// Quitting ends the run, so the first press asks for a second.
const quitButton = byId('quit');
let quitArmed = 0;
function disarmQuit() {
  clearTimeout(quitArmed);
  quitArmed = 0;
  quitButton.classList.remove('is-armed');
  setText(quitButton, 'Quit to main menu');
}
quitButton.addEventListener('click', () => {
  if (quitArmed) {
    disarmQuit();
    mainMenu();
    return;
  }
  quitButton.classList.add('is-armed');
  setText(quitButton, 'Press again to quit');
  quitArmed = setTimeout(disarmQuit, 4000);
});
pauseDialog.addEventListener('close', disarmQuit);
const restartWave = byId('restart-wave');
restartWave.addEventListener('click', () => {
  const checkpoint = waveCheckpoint();
  if (!session.running || session.onlineRun || !checkpoint) return;
  const area = session.sim.area;
  const run = campaign;
  const drill = practice;
  mainMenu();
  launch(area, run, drill, null, checkpoint);
});
byId('restart-mission').addEventListener('click', () => {
  if (!session.running || session.onlineRun) return;
  const area = session.sim.area;
  const run = campaign;
  const drill = practice;
  mainMenu();
  launch(area, run, drill);
});
byId('pause-manual').addEventListener('click', () => byId('manual').click());
byId('pause').addEventListener('click', pause);
byId('resume').addEventListener('click', resume);
extractNow.addEventListener('click', () => chooseExtraction('extract'));
stayOvertime.addEventListener('click', () => chooseExtraction('stay'));
touchTurret.addEventListener('click', () => {
  if (session.running && !session.paused && !session.sim.extractionPending && !session.sim.tutorial && (session.sim.turretCharges > 0 || session.sim.canRedeployTurret)) controls.deployTap = true;
});
extractionDialog.addEventListener('cancel', event => event.preventDefault());
pauseDialog.addEventListener('cancel', event => { event.preventDefault(); resume(); });
resultDialog.addEventListener('cancel', event => { event.preventDefault(); returnFromResult(); });

Object.assign(commands, { pause, syncMusic, selectJunctionSupply, toggleAiDebug: all => aiDebug.toggle(all) });
// Changing weapons in the armory cancels a co-op ready, so teammates see the new loadout.
armoryEvents.changed = loadout => {
  if (coopClient?.localPlayer?.ready && ['lobby', 'finished'].includes(coopClient.room?.phase)) coopClient.setReady(false, loadout);
};
setMuted(session.muted);
syncSettings();
syncMusic();
displayBest();
setupLoadouts();
displayMissionAccess();
prepareGame();
if (typeof navigator.getGamepads === 'function') requestAnimationFrame(controllerFrame);
