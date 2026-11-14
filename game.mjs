import { Simulation, JUNCTION_INLETS, RULES } from './simulation.mjs';
import { ORGAN_MISSIONS } from './organs.mjs';
import { FIELD_UPGRADES } from './loadouts.mjs';
import { GameAudio } from './audio.mjs';

const byId = id => document.getElementById(id);
const menu = byId('menu');
const game = byId('game');
const canvas = byId('world');
const deploy = byId('deploy');
const deployLabel = deploy.querySelector('span');
const missionSelect = byId('mission-select');
const missionDialog = byId('mission-dialog');
const missionCount = byId('mission-count');
const missionError = byId('mission-error');
const practiceLoadout = byId('practice-loadout');
const practiceLoadoutDetail = byId('practice-loadout-detail');
const megaVirusDeploy = byId('deploy-mega-virus');
const megaVirusStatus = byId('mega-virus-status');
const missionEntries = [...document.querySelectorAll('[data-deploy-area]')].map(button => ({
  area: button.dataset.deployArea,
  button,
  label: button.querySelector('[data-mission-name]'),
  status: document.querySelector('[data-mission-status="' + button.dataset.deployArea + '"]'),
}));
const continueButton = byId('continue-mission');
const continueLabel = byId('continue-mission-label');
const resumeCampaignButton = byId('resume-campaign');
const resumeCampaignLabel = byId('resume-campaign-label');
const replay = byId('replay');
const replayLabel = byId('replay-label');
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
const pauseDialog = byId('pause-dialog');
const resultDialog = byId('result-dialog');
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
const reticle = byId('reticle');
const hitMarker = byId('hit-marker');
const damageFlash = byId('damage-flash');
const alertBox = byId('game-alert');
const nodeRows = [...document.querySelectorAll('[data-tissue-node]')].map(row => ({
  row,
  name: row.querySelector('[data-node-name]'),
  value: row.querySelector('[data-node-value]'),
  meter: row.querySelector('[data-node-meter]'),
  state: row.querySelector('[data-node-state]'),
}));
const nodeMarkers = [
  { marker: byId('objective-marker'), label: byId('marker-label'), distance: byId('marker-distance'), edge: byId('objective-edge'), edgeLabel: byId('objective-edge-label') },
  { marker: byId('secondary-marker'), label: byId('secondary-marker-label'), distance: byId('secondary-marker-distance'), edge: byId('secondary-edge'), edgeLabel: byId('secondary-edge-label') },
];
const turretStatus = byId('turret-status');
const turretStatusValue = byId('turret-status-value');
const turretMarker = byId('turret-marker');
const turretMarkerDistance = byId('turret-marker-distance');
const touchTurret = byId('touch-turret');
const gashMarker = byId('gash-marker');
const gashDistance = byId('gash-distance');
const gashLabel = byId('gash-label');
const gashEdge = byId('gash-edge');
const gashEdgeLabel = byId('gash-edge-label');
const gashStatus = byId('gash-status');
const trainingHint = byId('training-hint');
const trainingTitle = byId('training-title');
const trainingDetail = byId('training-detail');
const tissueAttackers = byId('tissue-attackers');
const attackerMarkers = new Map();
const actionPrompt = byId('action-prompt');
const joystick = byId('joystick');
const touchControls = byId('touch-controls');

const suitValue = byId('health-value');
const equipmentLabel = byId('equipment-label');
const campaignEquipped = byId('campaign-equipped');
const ammoValue = byId('ammo-value');
const reserveValue = byId('reserve-value');
const waveMode = byId('wave-mode');
const waveValue = byId('wave-value');
const branchReadout = byId('branch-readout');
const junctionWaveName = byId('junction-wave-name');
const junctionForecast = byId('junction-forecast');
const junctionSurge = byId('junction-surge');
const junctionSurgeTarget = byId('junction-surge-target');
const junctionSurgeThreat = byId('junction-surge-threat');
const junctionSurgeTime = byId('junction-surge-time');
const junctionSupply = byId('junction-supply');
const junctionSupplyPlan = byId('junction-supply-plan');
const junctionSupplyNote = byId('junction-supply-note');
const supplyButtons = [...document.querySelectorAll('[data-junction-supply]')];
const valveReadout = byId('valve-readout');
const valveFill = byId('valve-fill');
const colonyStatus = byId('colony-status');
const flankStatus = byId('flank-status');
const organHazard = byId('organ-hazard');
const organHazardLabel = byId('organ-hazard-label');
const organHazardDetail = byId('organ-hazard-detail');
const organHazardTime = byId('organ-hazard-time');
const bossHud = byId('boss-hud');
const bossPhase = byId('boss-phase');
const bossHealth = byId('boss-health');
const bossHealthFill = byId('boss-health-fill');
const bossStatus = byId('boss-status');
const bossStatusDetail = byId('boss-status-detail');
const bossTime = byId('boss-time');
const bossMarker = byId('boss-marker');
const bossMarkerLabel = byId('boss-marker-label');
const airwayHud = byId('airway-hud');
const airwayStatus = byId('airway-status');
const airwayDetail = byId('airway-detail');
const airwayTime = byId('airway-time');
const airwayHold = byId('airway-hold');
const airwayReadouts = ['left', 'right'].map(side => ({
  status: byId('airway-' + side + '-status'),
  label: byId('airway-' + side + '-label'),
}));
const gastricHud = byId('gastric-hud');
const gastricStatus = byId('gastric-status');
const gastricDetail = byId('gastric-detail');
const gastricTime = byId('gastric-time');
const gastricFlow = byId('gastric-flow');
const gastricValves = ['intake', 'drain'].map(id => ({
  row: byId('gastric-' + id),
  state: byId('gastric-' + id + '-state'),
  progress: byId('gastric-' + id + '-progress'),
  id,
}));
const gastricMarker = byId('gastric-marker');
const gastricMarkerLabel = byId('gastric-marker-label');
const gastricMarkerDistance = byId('gastric-marker-distance');
const gastricEdge = byId('gastric-edge');
const gastricEdgeLabel = byId('gastric-edge-label');
const branches = {
  left: { name: 'AMBER', badge: byId('branch-left'), marker: byId('inlet-left') },
  right: { name: 'TEAL', badge: byId('branch-right'), marker: byId('inlet-right') },
};
const threats = byId('threats');
const reloadState = byId('reload-state');
const promptText = byId('prompt-text');
const repairMeter = byId('repair-meter');
const repairFill = byId('repair-fill');
const healthMeter = byId('health-meter');
const healthFill = byId('health-fill');

const audio = new GameAudio();
const keys = new Set();
const touch = { fire: false, repair: false, reload: false, x: 0, z: 0 };
const input = { moveX: 0, moveZ: 0, lookX: 0, lookY: 0, fire: false, reload: false, repair: false, deploy: false, sprint: false, aim: false };
const isTouch = matchMedia('(pointer: coarse)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const controlKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyR', 'KeyQ', 'KeyP', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Escape']);
const pad = number => String(number).padStart(2, '0');
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const bestKey = 'immune-protocol.best-score';
const muteKey = 'immune-protocol.muted';
const junctionKey = 'immune-protocol.junction-unlocked';
const heartKey = 'immune-protocol.heart-unlocked';
const tutorialKey = 'immune-protocol.training-complete';
const sensitivityKey = 'immune-protocol.look-sensitivity';
const qualityKey = 'immune-protocol.graphics-quality';
const checkpointKey = 'immune-protocol.campaign-checkpoint';
const unlockedKey = 'immune-protocol.unlocked-mission';
const practiceLoadoutKey = 'immune-protocol.practice-loadout';
const megaVirusKey = 'immune-protocol.mega-virus-reached';
const campaignAreas = ['artery', 'junction', 'heart', 'lungs', 'stomach', 'intestines', 'ear', 'brain'];
const missions = {
  artery: { name: 'Arterial Junction', briefing: 'Defend the core and lateral branch through five waves.' },
  junction: { name: 'Capillary Junction', briefing: 'Read the attack forecast and defend both inlets.' },
  heart: { name: 'Heart Valve', briefing: 'Time your shots through the valve and defend the outer wall.' },
  ...ORGAN_MISSIONS,
};
const missionName = area => missions[area].name;
const nextMission = area => campaignAreas[campaignAreas.indexOf(area) + 1];
const attackWarnings = {
  'virus-windup': 'VIRUS ABOUT TO LUNGE',
  'spore-windup': 'SPORE CHARGING',
  'bacillus-windup': 'BACILLUS TEARING TISSUE',
  'guard-windup': 'SHELLBACK TEARING TISSUE',
  'splitter-windup': 'SPLITTER ABOUT TO LUNGE',
};
const supplyKeys = { Digit1: 'left', Digit2: 'right', Digit3: 'ammo', Digit4: 'turret' };

let world;
let sim;
let campaign = null;
let selectedUpgrade = null;
let practice = null;
let running = false;
let loading = false;
let paused = false;
let locked = false;
let leftButton = false;
let rightButton = false;
let fireTap = false;
let reloadTap = false;
let deployTap = false;
let lookPointer = null;
let stickPointer = null;
let hitTimer = 0;
let damageTimer = 0;
const nodeHitUntil = new Map();
let restoredNode = null;
let announcementTimer = 0;
let guardHintUntil = 0;
let lastFrame = 0;
let animation = 0;
let drawnWave = '';
let bestScore = Number(readSetting(bestKey)) || 0;
let muted = readSetting(muteKey) === 'true';
let unlockedMission = Math.max(
  campaignAreas.indexOf(readSetting(unlockedKey)),
  readSetting(heartKey) === 'true' ? 2 : readSetting(junctionKey) === 'true' ? 1 : 0,
);
let checkpoint = readCheckpoint();
let megaVirusReached = readSetting(megaVirusKey) === 'true';
let trainingComplete = readSetting(tutorialKey) === 'true';
let sensitivity = clamp(Number.parseFloat(readSetting(sensitivityKey)) || 1, 0.5, 2.5);
let graphicsQuality = readSetting(qualityKey) === 'low' ? 'low' : 'high';

function readSetting(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeSetting(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Private browsing may block storage. */ }
}

function readCheckpoint() {
  try {
    const saved = JSON.parse(readSetting(checkpointKey));
    if (!saved || !Array.isArray(saved.results) || saved.results.length >= campaignAreas.length) return null;
    if (saved.upgrade !== null && !Object.hasOwn(FIELD_UPGRADES, saved.upgrade)) return null;
    const valid = saved.results.every((result, index) => result?.area === campaignAreas[index] &&
      [result.tissue, result.score, result.kills].every(Number.isFinite) &&
      Array.isArray(result.nodes) && result.nodes.length === 2 &&
      result.nodes.every(node => typeof node?.name === 'string' && Number.isFinite(node.health)));
    return valid && saved.results.length <= unlockedMission ? saved : null;
  } catch {
    return null;
  }
}

function saveCheckpoint(run) {
  checkpoint = run;
  writeSetting(checkpointKey, JSON.stringify(run));
}

function syncSettings() {
  sensitivityControl.value = sensitivity;
  sensitivityValue.value = sensitivity.toFixed(2) + '×';
  qualityControl.value = graphicsQuality;
}

function setMuted(value) {
  muted = value;
  audio.setMuted(value);
  writeSetting(muteKey, value);
  document.querySelectorAll('[data-mute]').forEach(button => {
    const label = value ? 'Unmute audio' : 'Mute audio';
    button.setAttribute('aria-pressed', String(value));
    button.setAttribute('aria-label', label);
    button.title = label;
    button.querySelector('use').setAttribute('href', value ? '#muted' : '#sound');
  });
}

function syncMusic() {
  let mode = 'silent';
  if (!paused && !document.hidden) {
    const counterattack = running && sim.gastric && sim.phase === 'intermission' && sim.enemies.length > 0;
    const recovering = running && ((sim.phase === 'intermission' && !counterattack) || sim.tutorial === 'repair' || sim.valve?.colonyDefeated);
    if (running && (sim.phase === 'combat' || counterattack) && !recovering) mode = 'combat';
    else if (!menu.hidden || recovering) mode = 'drift';
  }
  audio.setMusic(mode);
}

function displayBest() {
  const best = byId('high-score');
  best.hidden = bestScore === 0;
  best.textContent = 'BEST SCORE ' + bestScore.toLocaleString();
}

function displayMissionAccess() {
  for (const { area, button, label, status } of missionEntries) {
    const index = campaignAreas.indexOf(area);
    const available = index >= 0 && index <= unlockedMission;
    button.disabled = loading || !available;
    setText(label, missionName(area));
    setText(status, available ? missions[area].briefing : 'Clear ' + missionName(campaignAreas[index - 1]) + ' to unlock.');
  }
  missionSelect.disabled = loading;
  practiceLoadout.disabled = loading;
  megaVirusDeploy.disabled = loading || !megaVirusReached || unlockedMission < campaignAreas.indexOf('brain');
  setText(megaVirusStatus, megaVirusReached ? 'Start at Wave 3 with fresh supplies.' : 'Reach the Mega Virus in Neural Cortex to unlock.');
  setText(missionCount, (unlockedMission + 1) + ' of ' + campaignAreas.length + ' missions unlocked');
  resumeCampaignButton.hidden = !checkpoint;
  resumeCampaignButton.disabled = loading;
  if (deployLabel) setText(deployLabel, checkpoint ? 'Start new campaign' : 'Start campaign');
  if (checkpoint) setText(resumeCampaignLabel, 'Resume at ' + missionName(campaignAreas[checkpoint.results.length]));
}

function updatePracticeLoadout() {
  const id = practiceLoadout.value;
  const upgrade = FIELD_UPGRADES[id];
  setText(practiceLoadoutDetail, upgrade?.description ?? 'Standard equipment without a field upgrade.');
}

function setupLoadouts() {
  const saved = readSetting(practiceLoadoutKey);
  practiceLoadout.value = Object.hasOwn(FIELD_UPGRADES, saved) ? saved : 'standard';
  for (const button of upgradeButtons) {
    const { name, description } = FIELD_UPGRADES[button.dataset.upgrade];
    setText(button.querySelector('strong'), name);
    const detail = button.querySelector('[data-upgrade-detail]') ?? button.querySelector('span');
    setText(detail, description);
  }
  updatePracticeLoadout();
}

function requestMouse() {
  if (isTouch || !canvas.requestPointerLock) return;
  try {
    const pending = canvas.requestPointerLock();
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
  } catch { /* Drag and arrow controls work in an embedded browser. */ }
}

function releaseMouse() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function clearControls() {
  keys.clear();
  leftButton = false;
  rightButton = false;
  fireTap = false;
  reloadTap = false;
  deployTap = false;
  lookPointer = null;
  stickPointer = null;
  touch.fire = false;
  touch.repair = false;
  touch.reload = false;
  touch.x = 0;
  touch.z = 0;
  input.lookX = 0;
  input.lookY = 0;
  joystick.firstElementChild.style.transform = '';
}

function announce(title, detail = '', duration = 2.45) {
  const titleNode = document.createTextNode(title);
  const subtitle = document.createElement('small');
  subtitle.textContent = detail;
  alertBox.replaceChildren(titleNode);
  if (detail) alertBox.append(subtitle);
  announcementTimer = duration;
}

async function launch(area, run = null, drill = null) {
  const junction = area === 'junction';
  const heart = area === 'heart';
  const index = campaignAreas.indexOf(area);
  if (loading || running || index < 0 || index > unlockedMission) return;
  if (drill?.bossPractice && (area !== 'brain' || !megaVirusReached)) return;
  const fromResult = resultDialog.open;
  const fromMissionList = missionDialog.open;
  const previousControl = document.activeElement;
  const previousSim = sim;
  const previousRun = campaign;
  const previousPractice = practice;
  const previousUpgrade = selectedUpgrade;
  loading = true;
  deploy.disabled = true;
  missionDialog.close();
  displayMissionAccess();
  byId('menu-error').hidden = true;
  missionError.hidden = true;
  resultLaunchError.hidden = true;
  resultDialog.close();
  game.hidden = false;
  requestMouse();
  const unlocked = Promise.resolve(audio.unlock()).catch(() => {});
  try {
    const { World } = await import('./world.mjs');
    if (!world) world = new World(canvas);
    world.setArea(area);
    world.setQuality(graphicsQuality);
    const upgrade = run?.upgrade ?? drill?.upgrade;
    const nextSim = new Simulation(area, {
      tutorial: area === 'artery' && !trainingComplete && !drill,
      upgrades: upgrade ? [upgrade] : [],
      bossPractice: !!drill?.bossPractice,
    });
    nextSim.start();
    sim = nextSim;
    campaign = run;
    practice = drill;
    selectedUpgrade = null;
    menu.hidden = true;
    touchControls.hidden = !isTouch;
    clearControls();
    const equipped = upgrade && FIELD_UPGRADES[upgrade]?.name;
    campaignEquipped.hidden = !equipped;
    setText(campaignEquipped, equipped || '');
    game.dataset.area = sim.area;
    canvas.setAttribute('aria-label', 'First-person view of ' + missionName(area));
    branchReadout.hidden = !junction;
    valveReadout.hidden = !heart;
    gashMarker.hidden = gashEdge.hidden = true;
    delete game.dataset.valve;
    for (const branch of Object.values(branches)) branch.marker.hidden = true;
    lastFrame = 0;
    damageTimer = 0;
    nodeHitUntil.clear();
    restoredNode = null;
    attackerMarkers.clear();
    tissueAttackers.replaceChildren();
    hitTimer = 0;
    guardHintUntil = 0;
    drawnWave = '';
    running = true;
    paused = false;
    audio.setActive(true);
    syncMusic();
    const mission = sim;
    Promise.resolve(unlocked).then(() => {
      if (running && !paused && sim === mission && sim.clock < 1.25) audio.play({ type: 'deploy' });
    }).catch(() => {});
    if (drill?.bossPractice) announce('MEGA VIRUS PRACTICE', 'WATCH FOR THE PULSING CORE', 3.2);
    else if (heart) announce('HEART VALVE', 'HIT THE COLONY · DEFEND THE FLANK', 3.2);
    else if (junction) announce('CAPILLARY JUNCTION', 'DEFEND BOTH INLETS', 2.8);
    else if (nextSim.organ) announce(missionName(area).toUpperCase(), missions[area].briefing, 3.5);
    else if (!sim.tutorial) announce('WAVE 01', 'DEFEND BOTH TISSUE NODES', 3.1);
    else {
      announcementTimer = 0;
      alertBox.replaceChildren();
    }
    drawHud();
    if (run) saveCheckpoint(run);
    cancelAnimationFrame(animation);
    animation = requestAnimationFrame(frame);
  } catch (error) {
    console.error('Could not start Immune Protocol', error);
    running = false;
    audio.setActive(false);
    releaseMouse();
    sim = previousSim;
    campaign = previousRun;
    practice = previousPractice;
    selectedUpgrade = previousUpgrade;
    if (fromResult) {
      game.dataset.area = sim.area;
      resultLaunchError.textContent = 'Could not start the mission. Try again.';
      resultLaunchError.hidden = false;
      resultDialog.showModal();
      previousControl?.focus();
      return;
    }
    game.hidden = true;
    menu.hidden = false;
    syncMusic();
    const message = fromMissionList ? missionError : byId('menu-error');
    message.textContent = 'Could not initialize 3D graphics. Try a browser with WebGL 2 and hardware acceleration enabled.';
    message.hidden = false;
    if (fromMissionList) missionDialog.showModal();
  } finally {
    deploy.disabled = false;
    loading = false;
    displayMissionAccess();
    if (fromMissionList && missionDialog.open) previousControl?.focus();
  }
}

function pause() {
  if (!running || paused || sim.extractionPending) return;
  paused = true;
  cancelAnimationFrame(animation);
  animation = 0;
  clearControls();
  audio.setActive(false);
  syncMusic();
  releaseMouse();
  byId('pause-detail').textContent = isTouch
    ? 'Resume when you’re ready to return to the fight.'
    : 'Resume to capture the mouse. If it stays free, drag the view or use the arrow keys to look.';
  pauseDialog.showModal();
}

function resume() {
  if (!running || !paused) return;
  pauseDialog.close();
  paused = false;
  lastFrame = 0;
  clearControls();
  audio.unlock().catch(() => {});
  audio.setActive(true);
  syncMusic();
  requestMouse();
  animation = requestAnimationFrame(frame);
}

function offerExtraction() {
  clearControls();
  audio.setActive(false);
  syncMusic();
  releaseMouse();
  setText(extractionTissue, Math.round(sim.tissue) + '%');
  drawNodeBreakdown(extractionNodes, sim.nodes);
  setText(extractionSuit, Math.ceil(sim.player.health) + '%');
  setText(extractionAmmo, sim.player.ammo + ' / ' + sim.player.reserve);
  setText(extractionBonus, '+' + sim.overtimeForecast.bonus.toLocaleString() + ' score');
  extractionDialog.showModal();
  extractNow.focus();
}

function chooseExtraction(choice) {
  if (!running || !extractionDialog.open || !sim.chooseExtraction(choice)) return;
  extractionDialog.close();
  clearControls();
  if (choice === 'extract') {
    finish();
    return;
  }
  lastFrame = 0;
  audio.unlock().catch(() => {});
  audio.setActive(true);
  syncMusic();
  requestMouse();
  applyEvents();
  animation = requestAnimationFrame(frame);
}

function mainMenu() {
  running = false;
  paused = false;
  campaign = null;
  practice = null;
  selectedUpgrade = null;
  clearControls();
  audio.setActive(false);
  releaseMouse();
  cancelAnimationFrame(animation);
  settingsDialog.close();
  missionDialog.close();
  pauseDialog.close();
  extractionDialog.close();
  resultDialog.close();
  game.hidden = true;
  menu.hidden = false;
  syncMusic();
  displayBest();
  displayMissionAccess();
  (checkpoint ? resumeCampaignButton : deploy).focus();
}

function startCampaign() {
  launch('artery', { results: [], upgrade: null });
}

function missionResult() {
  const nodes = sim.nodes.map(({ name, health }) => ({ name, health }));
  return { area: sim.area, tissue: sim.tissue, nodes, score: sim.score, kills: sim.kills };
}

function continueMission() {
  if (!resultDialog.open || sim.phase !== 'won') return;
  const area = nextMission(sim.area);
  if (!area) return;
  const run = campaign ? checkpoint : null;
  launch(area, run, practice);
}

function updateUpgradeChoice() {
  for (const button of upgradeButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.upgrade === selectedUpgrade));
  }
  setText(upgradeNote, FIELD_UPGRADES[selectedUpgrade].name + ' selected for ' + missionName(nextMission(sim.area)) + '.');
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
  running = false;
  extractionDialog.close();
  clearControls();
  releaseMouse();
  audio.setActive(false);
  syncMusic();
  const won = sim.phase === 'won';
  const junction = sim.area === 'junction';
  const heart = sim.area === 'heart';
  const bossPractice = !!practice?.bossPractice;
  const next = won && !bossPractice ? nextMission(sim.area) : null;
  const reward = Boolean(campaign && next);
  const complete = Boolean(campaign && won && !next);
  if (next && campaignAreas.indexOf(next) > unlockedMission) {
    unlockedMission = campaignAreas.indexOf(next);
    writeSetting(unlockedKey, next);
  }
  if (reward) selectedUpgrade = campaign.upgrade ?? 'fast-sealer';
  if (complete) saveCheckpoint(null);
  displayMissionAccess();
  audio.play({ type: won ? 'won' : 'lost' });
  if (!bossPractice && sim.score > bestScore) {
    bestScore = sim.score;
    writeSetting(bestKey, bestScore);
  }
  byId('result-title').textContent = complete ? 'Campaign complete' : won && bossPractice ? 'Mega Virus defeated'
    : won ? (heart ? 'Valve stabilized' : junction ? 'Junction secured' : sim.organMission ? missionName(sim.area) + ' secured' : 'Artery secured') : 'Mission failed';
  let detail;
  if (complete) detail = 'The Mega Virus is down. The infection is contained across all eight missions.';
  else if (won) {
    const opening = next ? missionName(next) + ' is open for deployment.' : 'The Mega Virus is down and both tissue nodes survived.';
    detail = sim.overtimeBonus > 0 ? 'Overtime cleared. +' + sim.overtimeBonus.toLocaleString() + ' score. ' + opening : opening;
    if (sim.airway?.state === 'secured') detail = 'Both bronchi stayed open through a full breath. ' + opening;
    if (sim.gastric?.stage === 'drained') detail = 'The basin is drained and the lower passage is clear. ' + opening;
  }
  else if (sim.overtime) {
    const cause = sim.failedNode ? sim.failedNode.name + ' failed.' : 'Your suit failed.';
    detail = cause + ' Redeploy to retry Capillary Junction from Wave 1.';
  }
  else detail = sim.failedNode ? sim.failedNode.name + ' tissue failed under pathogen attack.' : 'Your suit failed under pathogen attack.';
  byId('result-detail').textContent = detail;
  const result = missionResult();
  const results = complete ? [...campaign.results, result] : [result];
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
    setText(campaignProgress, 'Mission ' + (campaignAreas.indexOf(sim.area) + 1) + ' of ' + campaignAreas.length);
    updateUpgradeChoice();
  }
  if (complete) drawCampaignReport(results);
  setText(replayLabel, complete ? 'Restart campaign' : bossPractice ? 'Practice again' : campaign ? 'Retry mission' : 'Redeploy');
  replay.hidden = reward;
  replay.classList.toggle('primary', !next);
  replay.classList.toggle('outline', !!next);
  resultDialog.showModal();
  if (reward) upgradeButtons[0]?.focus();
  else if (next) continueButton.focus();
}

function setText(element, value) {
  const text = String(value);
  if (element.textContent !== text) element.textContent = text;
}

function fillMeter(meter, fill, value) {
  if (meter.getAttribute('aria-valuenow') === String(value)) return;
  fill.style.width = value + '%';
  meter.setAttribute('aria-valuenow', String(value));
  meter.parentElement.classList.toggle('critical', value <= 32);
}

function drawTraining() {
  const stage = sim.tutorial;
  trainingHint.hidden = !stage;
  if (!stage) return;
  trainingHint.dataset.stage = stage;
  if (stage === 'observe') {
    setText(trainingTitle, 'Watch the tissue node');
    setText(trainingDetail, 'A pathogen is approaching the membrane.');
  } else if (stage === 'intercept') {
    setText(trainingTitle, 'Shoot the attached pathogen');
    setText(trainingDetail, isTouch ? 'Drag to aim and hold Fire.' : 'Aim at the attacker and fire.');
  } else {
    setText(trainingTitle, 'Seal the wound');
    setText(trainingDetail, sim.nearTissue ? '' : 'Move to the tissue node to repair it.');
  }
  trainingDetail.hidden = !trainingDetail.textContent;
}

function drawValve(valve) {
  const open = valve.phase === 'open';
  const phase = valve.exposed ? 'exposed' : valve.phase;
  if (game.dataset.valve !== phase) game.dataset.valve = phase;
  let label = 'CLOSED';
  if (open) label = valve.exposed ? 'OPEN' : valve.remaining > valve.duration / 2 ? 'OPENING' : 'CLOSING';
  setText(waveMode, 'HEART VALVE');
  setText(waveValue, label);
  setText(threats, (open ? 'CLOSES IN ' : 'OPENS IN ') + Math.ceil(valve.remaining) + 's');
  valveFill.style.width = (100 * clamp(valve.remaining / valve.duration, 0, 1)).toFixed(1) + '%';
  const colony = sim.enemies.find(enemy => enemy.type === 'colony');
  const health = colony ? Math.ceil(100 * colony.health / colony.maxHealth) : 0;
  const adds = sim.enemies.length - Number(!!colony);
  setText(colonyStatus, valve.colonyDefeated ? 'COLONY NEUTRALIZED' : 'COLONY ' + health + '%');
  flankStatus.hidden = adds === 0;
  setText(flankStatus, adds + ' FLANK ' + (adds === 1 ? 'THREAT' : 'THREATS'));
}

function drawJunctionStatus() {
  const junction = sim.area === 'junction';
  const current = sim.junctionWave;
  const forecast = sim.junctionForecast;
  const surge = sim.junctionSurge;
  const planning = junction && sim.phase === 'intermission' && !sim.settling && !!forecast;
  junctionWaveName.hidden = !junction || !current;
  junctionForecast.hidden = !planning;
  junctionSupply.hidden = !planning;
  junctionSupplyPlan.hidden = !planning;
  junctionSurge.hidden = !surge;
  if (surge) {
    junctionSurge.dataset.branch = surge.branch;
    junctionSurge.dataset.urgent = String(surge.remaining <= 3);
    setText(junctionSurgeTarget, surge.nodeName);
    setText(junctionSurgeThreat, surge.threat);
    setText(junctionSurgeTime, Math.max(1, Math.ceil(surge.remaining)) + 's');
  }
  gashStatus.hidden = !sim.gash;
  if (sim.gash) setText(gashStatus, branches[sim.gash.branch].name + ' GASH · LEAKING');
  if (current) setText(junctionWaveName, current.name);
  if (!planning) return;

  setText(junctionForecast, 'NEXT WAVE · ' + forecast.name);
  setText(junctionSupplyPlan, forecast.surges.slice(0, 2).map(group =>
    (group.branch === 'left' ? 'Amber' : 'Teal') + ' ' + group.threat.toLowerCase()
  ).join(' → '));
  const choice = sim.junctionSupply;
  for (const button of supplyButtons) {
    const option = button.dataset.junctionSupply;
    const pressed = String(option === choice);
    if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
    const disabled = sim.junctionSupplyLocked || (option === 'turret' && !sim.turret);
    if (button.disabled !== disabled) button.disabled = disabled;
  }
  let note = 'Choose one support option.';
  if (sim.junctionSupplyLocked) note = 'Turret moved. Support used for this wave.';
  else if (choice === 'turret') note = isTouch ? 'Face clear ground and tap Turret to move it.' : 'Face clear ground and press Q to move the turret.';
  else if (choice === 'ammo') note = 'Extra ammo selected.';
  else if (choice) note = branches[choice].name + ' inlet reinforcement selected.';
  setText(junctionSupplyNote, note);
}

function nodeStatus(node) {
  if (node.health <= 0) return 'FAILED';
  if (sim.gash?.nodeId === node.id) return 'GASH';
  if (node.underAttack || nodeHitUntil.get(node.id) > sim.clock) return 'UNDER ATTACK';
  if (sim.repairTarget === node) return 'REPAIRING';
  if (node.health <= 32) return 'CRITICAL';
  if (restoredNode?.id === node.id && restoredNode.until > sim.clock && node.health === 100) return 'RESTORED';
  return '';
}

function drawNodeHud() {
  for (const [index, node] of sim.nodes.entries()) {
    const { row, name, value, meter, state } = nodeRows[index];
    row.hidden = index > 0 && !!sim.tutorial;
    if (row.hidden) continue;
    const label = nodeStatus(node);
    const integrity = Math.ceil(node.health);
    setText(name, node.name);
    setText(value, integrity + '%');
    fillMeter(meter, meter.firstElementChild, integrity);
    setText(state, label);
    state.hidden = !label;
    row.classList.toggle('under-attack', label === 'UNDER ATTACK' || label === 'GASH');
  }
}

function drawTurretHud() {
  turretStatus.hidden = !!sim.tutorial;
  const turret = sim.turret;
  const moving = sim.canRedeployTurret;
  const ready = (sim.turretCharges > 0 || moving) && !sim.tutorial;
  touchTurret.hidden = !!sim.tutorial;
  touchTurret.disabled = !ready;
  const state = ready ? (sim.turretPlacement ? 'ready' : 'blocked') :
    turret?.jammed ? 'jammed' : turret?.targetId == null ? 'online' : 'engaging';
  turretStatus.dataset.state = state;
  setText(turretStatusValue, {
    online: 'TURRET ONLINE', engaging: 'TURRET ENGAGING', jammed: 'TURRET JAMMED',
    ready: moving ? 'REDEPLOY READY' : 'TURRET READY', blocked: 'FIND CLEAR GROUND',
  }[state]);
}

function drawOrganHazard() {
  const hazard = sim.organ;
  organHazard.hidden = !hazard || sim.boss?.state === 'defeated' || (sim.phase !== 'combat' && sim.phase !== 'intermission');
  if (!hazard) return;
  organHazard.dataset.phase = hazard.phase;
  setText(organHazardLabel, hazard.label);
  setText(organHazardDetail, hazard.detail);
  organHazardTime.hidden = !!sim.boss;
  const leadTime = hazard.phase === 'recovery' && !sim.boss ? ORGAN_MISSIONS[sim.area].hazard.warning : 0;
  setText(organHazardTime, Math.max(1, Math.ceil(hazard.remaining + leadTime)) + 's');
}

function drawBossHud() {
  const boss = sim.boss;
  bossHud.hidden = !boss;
  if (!boss) return;
  const { state, phase, health, maxHealth, weakPoint } = boss;
  bossHud.dataset.state = state;
  setText(bossPhase, 'Phase ' + phase + ' / 3');
  const percent = Math.ceil(health * 100 / maxHealth);
  if (bossHealth.getAttribute('aria-valuenow') !== String(percent)) {
    bossHealth.setAttribute('aria-valuenow', percent);
    bossHealthFill.style.width = percent + '%';
  }
  const status = {
    sealed: ['Shell sealed', 'Clear the swarm or repair'],
    warning: ['Core pulsing', weakPoint?.label + ' opens next'],
    exposed: ['Core exposed', 'Shoot the ' + weakPoint?.label?.toLowerCase()],
    defeated: ['Mega Virus down', sim.enemies.length ? 'Clear surviving pathogens' : 'Both tissue nodes secure'],
  }[state];
  setText(bossStatus, status[0]);
  setText(bossStatusDetail, status[1]);
  bossTime.hidden = state === 'defeated';
  setText(bossTime, Math.max(1, Math.ceil(boss.remaining)) + 's');
}

function drawAirwayHud() {
  const airway = sim.airway;
  airwayHud.hidden = !airway;
  if (!airway) return;
  const { state, remaining, duration, ports, minimumIntegrity, incoming } = airway;
  airwayHud.dataset.state = state;
  for (const [index, { nodeId, open, progress }] of ports.entries()) {
    const { status, label } = airwayReadouts[index];
    status.dataset.state = open ? 'open' : sim.repairTarget?.id === nodeId ? 'repairing' : 'blocked';
    setText(label, open ? 'Open' : progress > 0 ? 'Blocked · ' + Math.floor(progress * 100) + '% cleared' : 'Blocked');
  }
  const holding = state === 'holding';
  const secured = state === 'secured';
  setText(airwayStatus, secured ? 'Airflow restored' : holding ? 'Maintain both airways' : 'Reopen both bronchi');
  const target = incoming?.names.length === 1 ? incoming.names[0] : 'Both bronchi';
  const detail = secured ? 'Clear remaining pathogens' : holding ?
    'Keep both nodes at ' + minimumIntegrity + '% or higher' : 'Repair each blocked bronchus';
  setText(airwayDetail, incoming ? 'Attack on ' + target.toLowerCase() + ' in ' + Math.max(1, Math.ceil(incoming.remaining)) + 's' : detail);
  setText(airwayTime, holding ? Math.max(1, Math.ceil(remaining)) + 's' : '');
  airwayHold.hidden = state === 'reopen';
  const progress = secured ? 100 : Math.floor(100 * (1 - remaining / duration));
  if (airwayHold.value !== progress) airwayHold.value = progress;
}

function currentGastricValve() {
  const gastric = sim.gastric;
  return gastric?.stage === 'intake' || gastric?.stage === 'drain' ? gastric[gastric.stage] : null;
}

function gastricProgress(valve) {
  const partial = sim.repairTarget === valve ? sim.repairProgress * sim.repairAmount / sim.gastric.sealPoints : 0;
  return valve.progress >= 1 ? 100 : Math.min(99, Math.floor((valve.progress + partial) * 100));
}

function drawGastricHud() {
  const gastric = sim.gastric;
  gastricHud.hidden = !gastric || gastric.stage === 'flooded';
  if (gastricHud.hidden) return;
  const { stage, remaining, flankRemaining, incoming } = gastric;
  gastricHud.dataset.state = stage === 'draining' ? 'drain' : stage;
  const target = currentGastricValve();
  for (const { row, state, progress, id } of gastricValves) {
    const valve = gastric[id];
    const done = valve.progress >= 1;
    const active = valve === target;
    const working = active && sim.repairTarget === valve;
    row.dataset.state = done ? 'done' : working ? 'repairing' : active ? 'ready' : 'locked';
    setText(state, done ? (id === 'intake' ? 'Closed' : 'Open') : working ? 'Working' : active ? 'Ready' : 'Locked');
    const value = gastricProgress(valve);
    if (value !== progress.value) progress.value = value;
  }
  const notes = {
    intake: ['Close the intake', 'Head to the west bank', 'Acid in the central basin'],
    drain: ['Open the drain', 'Cross to the east bank', 'Acid rerouted to the drain channel'],
    draining: ['Basin draining', 'Watch the lower passage', 'Acid level falling'],
    drained: ['Lower passage open', 'Defend both tissue nodes', 'Basin drained'],
  }[stage];
  setText(gastricStatus, notes[0]);
  setText(gastricFlow, notes[2]);
  const imminent = stage === 'drained' && flankRemaining > 0;
  setText(gastricDetail, imminent ? 'Flank attack from the lower passage' : incoming ? 'Attack on ' + incoming.name : notes[1]);
  const timer = stage === 'draining' ? remaining : imminent ? flankRemaining : incoming?.remaining;
  setText(gastricTime, timer > 0 ? Math.ceil(timer) + 's' : '');
}

function drawHud() {
  const { player, tissue, wave, waves, remaining, phase, intermission, valve } = sim;
  const suitPercent = Math.ceil(player.health);
  drawNodeHud();
  drawTurretHud();
  drawOrganHazard();
  drawBossHud();
  drawAirwayHud();
  drawGastricHud();
  setText(suitValue, suitPercent);
  fillMeter(healthMeter, healthFill, suitPercent);
  setText(equipmentLabel, sim.repairing ? 'TISSUE SEALER' : 'NEEDLE CARBINE');
  ammoValue.hidden = reserveValue.hidden = reloadState.hidden = sim.repairing;
  setText(ammoValue, pad(player.ammo));
  setText(reserveValue, ' / ' + pad(player.reserve));
  setText(reloadState, sim.reloading ? 'RELOADING' : player.ammo === 0 ? 'MAGAZINE EMPTY' : 'FULL AUTO');
  const junction = sim.area === 'junction';
  const waveLabel = pad(wave) + ' / ' + pad(waves);
  if (valve) drawValve(valve);
  else {
    setText(waveMode, junction || sim.organMission ? missionName(sim.area).toUpperCase() : 'INFECTION WAVE');
    if (waveLabel !== drawnWave) {
      drawnWave = waveLabel;
      const total = document.createElement('span');
      total.textContent = '/ ' + pad(waves);
      waveValue.replaceChildren(document.createTextNode(pad(wave) + ' '), total);
    }
    let status = remaining + (remaining === 1 ? ' THREAT LEFT' : ' THREATS LEFT');
    if (sim.boss || sim.airway || currentGastricValve() || sim.gastric?.stage === 'draining') status = sim.enemies.length ?
      sim.enemies.length + (sim.enemies.length === 1 ? ' PATHOGEN ACTIVE' : ' PATHOGENS ACTIVE') : '';
    else if (sim.tutorial) status = 'FIELD TRAINING';
    else if (sim.extractionPending) status = 'EXTRACTION READY';
    else if (phase === 'intermission') {
      status = sim.settling && sim.gash ? 'SEAL GASH TO EXTRACT'
        : (sim.settling ? 'EXTRACT IN ' : 'NEXT WAVE IN ') + Math.ceil(intermission) + 's';
    }
    else if (remaining === 0 && sim.projectiles.length) status = 'SPORE SHOTS IN FLIGHT';
    setText(threats, status);
  }
  const nearby = sim.nearNode;
  const repairingNode = sim.repairTarget;
  const restoringHere = !!nearby && restoredNode?.id === nearby.id && restoredNode.until > sim.clock && nearby.health === 100;
  const repairKey = isTouch ? 'HOLD REPAIR' : 'HOLD E';
  const blockedPort = sim.airway?.ports.find(port => port.nodeId === nearby?.id && !port.open);
  const nearValve = sim.nearGastricValve;
  const valveTarget = currentGastricValve();
  const workingValve = !!valveTarget && repairingNode === valveTarget;
  const repairing = sim.repairing && (!restoringHere || !!blockedPort || workingValve);
  let prompt = '';
  if (repairing && sim.gash && sim.repairTarget === sim.gash) prompt = 'SEALING GASH';
  else if (sim.gash && sim.nearGash) {
    const sealed = Math.floor(100 * (1 - sim.gash.sealRemaining / sim.gash.sealRequired));
    prompt = repairKey + ' TO SEAL GASH' + (sealed ? ' · ' + sealed + '%' : '');
  }
  else if (sim.gash && sim.settling) prompt = 'MOVE TO THE GASH TO SEAL IT';
  else if (workingValve || (valveTarget && nearValve === valveTarget)) {
    const intake = valveTarget === sim.gastric.intake;
    prompt = repairing && workingValve
      ? (intake ? 'CLOSING INTAKE VALVE' : 'OPENING DRAIN VALVE')
      : repairKey + (intake ? ' TO CLOSE INTAKE VALVE' : ' TO OPEN DRAIN VALVE');
  }
  else if (blockedPort && sim.canRepair) prompt = repairing ?
    'REOPENING ' + blockedPort.name.toUpperCase() : repairKey + ' TO REOPEN ' + blockedPort.name.toUpperCase();
  else if (restoringHere) prompt = nearby.name.toUpperCase() + ' RESTORED · 100%';
  else if (repairing) prompt = 'REPAIRING ' + repairingNode.name.toUpperCase();
  else if (sim.canRepair && nearby) prompt = repairKey + ' TO REPAIR ' + nearby.name.toUpperCase();
  else if (sim.gastric?.stage === 'intake' && nearValve === sim.gastric.drain) prompt = 'CLOSE THE INTAKE FIRST';
  else if (sim.organ?.repairBlocked && nearby?.id === sim.organ.nodeId && nearby.health < 100) {
    prompt = nearby.name.toUpperCase() + ' REPAIRS BLOCKED DURING OVERLOAD';
  }
  else if (valve && nearby === sim.objective && nearby.health < 100 && valve.phase !== 'closed' && valve.colonyDefeated) {
    prompt = 'REPAIR ' + nearby.name.toUpperCase() + ' WHEN THE VALVE CLOSES';
  }
  else if (valve?.exposed && !valve.colonyDefeated && player.ammo > 0) prompt = 'SHOOT THE EXPOSED COLONY';
  else if (sim.settling && tissue < 100) prompt = 'MOVE TO A DAMAGED NODE TO REPAIR';
  else if (player.ammo === 0) {
    prompt = player.reserve ? (isTouch ? 'RELOAD CARBINE' : 'PRESS R TO RELOAD') : 'AWAITING RESUPPLY';
  } else if (phase === 'intermission' && tissue < 100) {
    prompt = 'MOVE TO A DAMAGED NODE TO REPAIR';
  }
  actionPrompt.hidden = !prompt;
  actionPrompt.classList.toggle('restored', restoringHere);
  setText(promptText, prompt);
  repairMeter.hidden = !repairing;
  if (repairing) {
    const gash = sim.repairTarget === sim.gash && sim.gash;
    const port = sim.airway?.ports.find(item => item.nodeId === sim.repairTarget?.id && !item.open);
    const value = gash ? Math.floor(100 * clamp(
      (gash.sealRequired - gash.sealRemaining + sim.repairProgress * sim.repairAmount) / gash.sealRequired, 0, 1,
    )) : workingValve ? gastricProgress(valveTarget)
      : port ? Math.min(99, Math.floor(100 * (port.progress + sim.repairProgress * sim.repairAmount / sim.airway.sealPoints)))
      : Math.floor(sim.repairProgress * 100);
    repairFill.style.width = value + '%';
    if (repairMeter.getAttribute('aria-valuenow') !== String(value)) repairMeter.setAttribute('aria-valuenow', value);
  }
  drawTraining();
  drawJunctionStatus();
}

function drawMarkers() {
  const player = sim.player;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const top = worldMarkerTop(width <= 720 ? 120 : 132);
  const edgePositions = [];
  for (const [index, node] of sim.nodes.entries()) {
    const { marker, label, distance: distanceLabel, edge, edgeLabel } = nodeMarkers[index];
    const { x, y, z } = node;
    const dx = x - player.x;
    const dz = z - player.z;
    const distance = Math.hypot(dx, dz);
    const valveNode = index === 0 && !!sim.valve;
    const point = world.project(x, y + (valveNode ? .96 : 1.65), z);
    const visible = point.visible && point.y >= top && point.y < height * .84 && point.x > 58 && point.x < width - 58;
    const concealed = (index > 0 && !!sim.tutorial) || (valveNode && sim.valve.exposed && !sim.valve.colonyDefeated) || sim.gash?.nodeId === node.id;
    const status = nodeStatus(node);
    const port = sim.airway?.ports[index];
    const markerName = port?.name ?? node.name;
    const danger = status === 'UNDER ATTACK' || status === 'CRITICAL';
    const nearby = distance <= RULES.repairRadius && !danger;
    marker.hidden = concealed || !visible || nearby;
    edge.hidden = concealed || visible || nearby;
    for (const element of [marker, edge]) {
      element.classList.toggle('under-attack', status === 'UNDER ATTACK');
      element.classList.toggle('critical', node.health <= 32);
    }
    if (!marker.hidden) {
      marker.style.left = point.x + 'px';
      marker.style.top = point.y + 'px';
      setText(label, markerName);
      setText(distanceLabel, (port && !port.open ? 'Blocked · ' : '') + Math.round(distance) + ' m');
    }
    if (!edge.hidden) {
      const position = positionEdgeMarker(edge, point, dx, dz, top, width, height, edgePositions);
      edgePositions.push(position);
      setText(edgeLabel, markerName + ' · ' + (danger ? Math.ceil(node.health) + '%' : port && !port.open ? 'Blocked' : Math.round(distance) + ' m'));
    }
  }
  drawGash(edgePositions);
  drawTurretMarker(top, width, height);
  drawGastricMarker(top, width, height, edgePositions);
  const weakPoint = sim.boss?.state === 'exposed' ? sim.boss.weakPoint : null;
  bossMarker.hidden = true;
  if (weakPoint) {
    const point = world.project(weakPoint.x, weakPoint.y + weakPoint.radius + .24, weakPoint.z);
    const hazardBounds = organHazard.getBoundingClientRect();
    const clear = organHazard.hidden || point.y > hazardBounds.bottom + 28 ||
      point.x + 50 < hazardBounds.left || point.x - 50 > hazardBounds.right;
    if (point.visible && clear && point.y > top + 12 && point.y < height * .76 && point.x > 51 && point.x < width - 51) {
      bossMarker.style.left = point.x + 'px';
      bossMarker.style.top = point.y + 'px';
      setText(bossMarkerLabel, weakPoint.label);
      bossMarker.hidden = false;
    }
  }
}

function drawGastricMarker(top, width, height, occupied) {
  const target = currentGastricValve();
  gastricMarker.hidden = gastricEdge.hidden = !target || sim.nearGastricValve === target;
  if (gastricMarker.hidden) return;
  const dx = target.x - sim.player.x;
  const dz = target.z - sim.player.z;
  const point = world.project(target.x, target.y + 1.8, target.z);
  const distance = Math.round(Math.hypot(dx, dz)) + ' m';
  const label = target === sim.gastric.intake ? 'Close intake' : 'Open drain';
  const visible = point.visible && point.y >= top && point.y < height * .84 && point.x > 65 && point.x < width - 65;
  gastricMarker.hidden = !visible;
  gastricEdge.hidden = visible;
  if (visible) {
    gastricMarker.style.left = point.x + 'px';
    gastricMarker.style.top = point.y + 'px';
    setText(gastricMarkerLabel, label);
    setText(gastricMarkerDistance, distance);
  } else {
    positionEdgeMarker(gastricEdge, point, dx, dz, top, width, height, occupied);
    setText(gastricEdgeLabel, label + ' · ' + distance);
  }
}

function positionEdgeMarker(edge, point, dx, dz, top, width, height, occupied) {
  const player = sim.player;
  const side = dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw);
  const forward = -dx * Math.sin(player.yaw) - dz * Math.cos(player.yaw);
  const insetX = Math.min(84, width * 0.23);
  const halfWidth = Math.max(12, width / 2 - insetX);
  const bottom = Math.max(top + 20, height * (isTouch ? 0.68 : 0.8));
  const middleY = (top + bottom) / 2;
  const halfHeight = (bottom - top) / 2;
  // A point behind the view projects to the wrong side of the camera.
  const towardX = forward > 0 ? point.x - width / 2 : Math.sign(side || 1) * width;
  const towardY = forward > 0 ? point.y - middleY : 0;
  const scale = 1 / Math.max(Math.abs(towardX) / halfWidth, Math.abs(towardY) / halfHeight, 0.01);
  const x = width / 2 + towardX * scale;
  let y = middleY + towardY * scale;
  for (const other of occupied) {
    if (Math.abs(other.x - x) < 130 && Math.abs(other.y - y) < 38) y = y + 40 <= bottom ? y + 40 : y - 40;
  }
  edge.style.setProperty('--objective-x', x + 'px');
  edge.style.setProperty('--objective-y', y + 'px');
  edge.style.setProperty('--objective-angle', Math.atan2(towardX, -towardY) + 'rad');
  return { x, y };
}

function drawGash(edgePositions) {
  const gash = sim.gash;
  if (!gash) {
    gashMarker.hidden = gashEdge.hidden = true;
    return;
  }
  const { x, y, z, branch } = gash;
  const dx = x - sim.player.x;
  const dz = z - sim.player.z;
  const point = world.project(x, y + 1.25, z);
  const width = window.innerWidth;
  const height = window.innerHeight;
  const top = worldMarkerTop(width <= 720 ? 112 : 128);
  const readable = point.visible && point.y >= top && point.y < height * .83 && point.x > 60 && point.x < width - 60;
  gashMarker.hidden = sim.nearGash || !readable;
  gashEdge.hidden = sim.nearGash || readable;
  const label = branches[branch].name + ' GASH';
  if (!gashMarker.hidden) {
    gashMarker.style.left = point.x + 'px';
    gashMarker.style.top = point.y + 'px';
    setText(gashLabel, label);
    setText(gashDistance, Math.round(Math.hypot(dx, dz)) + ' m');
  }
  if (!gashEdge.hidden) {
    positionEdgeMarker(gashEdge, point, dx, dz, top, width, height, edgePositions);
    setText(gashEdgeLabel, label);
  }
}

function drawTurretMarker(top, width, height) {
  const turret = sim.turret;
  if (!turret) {
    turretMarker.hidden = true;
    return;
  }
  const distance = Math.hypot(turret.x - sim.player.x, turret.z - sim.player.z);
  const point = world.project(turret.x, turret.y + 1.75, turret.z);
  turretMarker.hidden = !point.visible || distance < 4 || point.y < top || point.y > height * .78 || point.x < 52 || point.x > width - 52;
  if (turretMarker.hidden) return;
  turretMarker.style.left = point.x + 'px';
  turretMarker.style.top = point.y + 'px';
  setText(turretMarkerDistance, Math.round(distance) + ' m');
}

function worldMarkerTop(defaultTop) {
  return window.innerWidth <= 480 ? Math.max(defaultTop, 156) : defaultTop;
}

function drawAttackers() {
  const active = new Set();
  const captions = [];
  for (const enemy of sim.enemies) {
    const telegraph = enemy.type + '-windup';
    const warning = enemy.tutorial ? '' : enemy.action.endsWith('-windup') ?
      attackWarnings[telegraph] ?? attackWarnings[enemy.action] : '';
    if (!enemy.attackingTissue && !warning) continue;
    const point = world.project(enemy.x, enemy.y + enemy.radius + .17, enemy.z);
    if (!point.visible || point.y < worldMarkerTop(105) || point.x < 17 || point.x > window.innerWidth - 17) continue;
    active.add(enemy.id);
    let icon = attackerMarkers.get(enemy.id);
    if (!icon) {
      icon = document.createElement('div');
      icon.className = 'attacker-marker';
      const label = document.createElement('strong');
      if (enemy.branch) icon.dataset.branch = enemy.branch;
      icon.append(label, document.createElement('span'));
      attackerMarkers.set(enemy.id, icon);
      tissueAttackers.append(icon);
    }
    const node = sim.nodes.find(node => node.id === enemy.nodeId);
    const label = (enemy.latched ? 'LATCHED · ' : 'ATTACKING · ') + (node?.name.toUpperCase() ?? 'TISSUE');
    const text = warning && enemy.actionTarget === 'player' ? warning + ' · MOVE' : warning || label;
    icon.classList.toggle('winding-up', !!warning);
    setText(icon.firstElementChild, text);
    const showCaption = point.x >= 65 && point.x <= window.innerWidth - 65 &&
      !captions.some(other => Math.abs(other.x - point.x) < 125 && Math.abs(other.y - point.y) < 24);
    icon.classList.toggle('compact', !showCaption);
    if (showCaption) captions.push(point);
    icon.style.left = point.x + 'px';
    icon.style.top = point.y + 'px';
  }
  for (const [id, icon] of attackerMarkers) {
    if (active.has(id)) continue;
    icon.remove();
    attackerMarkers.delete(id);
  }
}

function drawBranches() {
  if (sim.area !== 'junction') return;
  for (const [side, branch] of Object.entries(branches)) {
    let count = 0;
    let striking = false;
    for (const enemy of sim.enemies) {
      if (enemy.branch !== side) continue;
      count++;
      striking ||= enemy.attackingTissue;
    }
    setText(branch.badge, branch.name + ' ' + count);
    branch.badge.classList.toggle('active', count > 0);
    branch.badge.classList.toggle('striking', striking);
    branch.badge.classList.toggle('reinforced', sim.reinforcement?.branch === side);
    const { x, y, z } = JUNCTION_INLETS[side];
    const point = world.project(x, y + 1.8, z);
    branch.marker.hidden = !point.visible || point.y < worldMarkerTop(127) || point.x < 56 || point.x > window.innerWidth - 56;
    if (!branch.marker.hidden) {
      branch.marker.style.left = point.x + 'px';
      branch.marker.style.top = point.y + 'px';
    }
  }
}

function applyEvents() {
  for (const event of sim.events) {
    if (event.type === 'tutorial' && event.stage === 'complete') {
      trainingComplete = true;
      writeSetting(tutorialKey, true);
      announce('DEFEND BOTH TISSUE NODES', isTouch ? 'TAP TURRET TO DEPLOY' : 'PRESS Q TO DEPLOY YOUR TURRET', 3.8);
      audio.play({ type: 'wave', stage: 'start' });
    }
    if (['branch', 'valve', 'enemyAttack', 'damage', 'hit', 'kill', 'turret', 'organ', 'guard', 'boss', 'airway', 'gastric'].includes(event.type) && Number.isFinite(event.x)) {
      const { x, z, yaw } = sim.player;
      const dx = event.x - x;
      const dz = event.z - z;
      const distance = Math.hypot(dx, dz);
      const pan = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / Math.max(1, distance);
      audio.play({ ...event, pan, distance });
    } else if (event.type !== 'mission') audio.play(event);
    if (event.type === 'boss') {
      if (event.stage === 'phase' && event.phase > 1) {
        const text = event.phase === 2 ? 'THE SIGNAL IS JUMPING BETWEEN CORES' : 'SHELLBACKS AND SPLITTERS INBOUND';
        announce('MEGA VIRUS · PHASE ' + event.phase, text, 2.5);
      } else if (event.stage === 'defeated') {
        announce('MEGA VIRUS DOWN', 'CLEAR SURVIVING PATHOGENS', 2.5);
      }
    }
    if (event.type === 'airway') {
      if (event.stage === 'start') announce('AIRWAY OBSTRUCTION', 'MOVE TO EACH BRONCHUS AND HOLD REPAIR', 3);
      if (event.stage === 'opened') announce(event.name.toUpperCase() + ' OPEN', 'WATCH THE TISSUE INTEGRITY', 1.8);
      if (event.stage === 'blocked') announce(event.name.toUpperCase() + ' BLOCKED', 'REOPEN IT TO RESTART THE BREATH', 2.6);
      if (event.stage === 'hold') announce('BOTH BRONCHI OPEN', 'HOLD THROUGH ONE FULL BREATH', 2.8);
      if (event.stage === 'secured') announce('AIRFLOW RESTORED', sim.enemies.length ? 'CLEAR SURVIVING PATHOGENS' : '', 2.4);
      if (event.stage === 'incoming') announce('PATHOGENS INBOUND', event.name.toUpperCase(), 1.9);
    }
    if (event.type === 'gastric') {
      if (event.stage === 'start') announce('CLOSE THE INTAKE', 'HOLD REPAIR AT THE WEST BANK', 2.8);
      if (event.stage === 'intake-closed') announce('INTAKE CLOSED', 'ACID REROUTED · HEAD TO THE DRAIN', 2.7);
      if (event.stage === 'draining') announce('DRAIN OPEN', 'WATCH THE LOWER PASSAGE', 2.5);
      if (event.stage === 'flank') announce('FLANK ATTACK', 'DEFEND BOTH TISSUE NODES', 2.5);
      if (event.stage === 'counterattack') announce('PATHOGENS INBOUND', event.name, 2);
    }
    if (event.type === 'turret') {
      if (event.stage === 'deployed') announce('AUTO-TURRET ONLINE', 'COVERING THIS POSITION', 1.8);
      if (event.stage === 'redeployed') announce('AUTO-TURRET REDEPLOYED', 'COVERING THE NEW POSITION', 1.8);
      if (event.stage === 'invalid') announce('PLACEMENT BLOCKED', 'FACE CLEAR GROUND AND TRY AGAIN', 1.8);
    }
    if (event.type === 'surge' && event.stage === 'arrival') {
      announce(event.threat.toUpperCase(), 'INBOUND TO ' + event.nodeName.toUpperCase(), 1.65);
    }
    if (event.type === 'guard' && event.stage === 'block' && event.source !== 'turret' && sim.clock >= guardHintUntil) {
      announce('FRONTAL SHELL', 'FLANK THE SHELLBACK TO HIT ITS EXPOSED TISSUE', 1.8);
      guardHintUntil = sim.clock + 4;
    }
    if (event.type === 'gash') {
      const lane = branches[event.branch].name;
      if (event.stage === 'open') announce(lane + ' GASH OPEN', 'SEAL IT TO STOP TISSUE LOSS', 2.5);
      else if (event.stage === 'closed') {
        announce(lane + ' GASH SEALED', sim.settling ? 'PREPARE FOR EXTRACTION' : 'TISSUE LOSS STOPPED', 2.2);
        if (sim.nodes.some(node => node.id === event.nodeId && node.health < 100)) audio.play({ type: 'repair', complete: true });
      }
    }
    if (event.type === 'kill' && event.enemyType === 'colony' && sim.tissue < 100) {
      announce('COLONY NEUTRALIZED', 'CLEAR THE FLANK AND RESTORE BOTH NODES', 3);
    }
    if (event.type === 'shot' && event.hit) {
      hitTimer = 0.19;
      hitMarker.classList.toggle('critical', Boolean(event.crit));
    }
    if (event.type === 'damage' && event.target === 'player') damageTimer = 0.46;
    if (event.type === 'damage' && event.target === 'tissue') {
      if (event.nodeId) nodeHitUntil.set(event.nodeId, sim.clock + .9);
      if (restoredNode?.id === event.nodeId) restoredNode = null;
    }
    if (event.type === 'repair' && event.complete && event.nodeId) {
      restoredNode = { id: event.nodeId, until: sim.clock + 2.4 };
      if (sim.settling) {
        announcementTimer = 0;
        alertBox.replaceChildren();
      }
    }
    if (event.type === 'wave') {
      if (event.stage === 'start') {
        const pattern = sim.junctionWave;
        const lane = pattern && branches[pattern.lane]?.name;
        const support = sim.events.find(item => item.type === 'junctionSupply')?.choice;
        let detail = lane ? lane + ' INLET' : 'PATHOGENS INBOUND';
        if (sim.boss) detail = 'WATCH FOR THE PULSING CORE';
        else if (sim.overtime) detail = 'TEAL BREACH · AMBER SPORE PRESSURE';
        else if (support === 'ammo') detail = 'EXTRA AMMO DELIVERED';
        else if (support === 'turret') detail = 'TURRET IN POSITION';
        else if (support) detail = branches[support].name + ' INLET REINFORCED';
        announce(sim.boss ? 'MEGA VIRUS' : pattern ? pattern.name.toUpperCase() : sim.organWave?.toUpperCase() ?? 'WAVE ' + pad(event.wave), detail);
      } else if (sim.settling) {
        announce('INLETS CLEAR', sim.gash ? 'SEAL THE GASH TO EXTRACT' : 'REPAIR TISSUE BEFORE EXTRACTION', 2.8);
      } else if (event.wave < sim.waves && sim.gastric?.stage !== 'intake') {
        announce('WAVE CONTAINED', sim.junctionForecast ? 'CHOOSE SUPPORT FOR THE NEXT WAVE' : 'RESUPPLIED  /  REPAIR TISSUE', 3);
      }
    }
  }
}

function drawCombatFeedback(aiming) {
  reticle.classList.toggle('aim', aiming);
  hitMarker.style.opacity = String(clamp(hitTimer * 7, 0, 1));
  damageFlash.style.opacity = String(damageTimer * (reducedMotion ? 0.42 : 1.6));
}

function frame(now) {
  animation = 0;
  if (!running) return;
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0;
  lastFrame = now;
  if (!paused) {
    input.moveX = Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + touch.x;
    input.moveZ = Number(keys.has('KeyW')) - Number(keys.has('KeyS')) + touch.z;
    input.lookX += (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'))) * dt * 825;
    input.lookY += (Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'))) * dt * 650;
    input.fire = fireTap || leftButton || touch.fire || keys.has('Space');
    input.reload = reloadTap || keys.has('KeyR') || touch.reload;
    input.repair = keys.has('KeyE') || touch.repair;
    input.deploy = deployTap;
    input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    input.aim = rightButton;
    hitTimer = Math.max(0, hitTimer - dt);
    damageTimer = Math.max(0, damageTimer - dt);
    if (announcementTimer > 0) {
      announcementTimer -= dt;
      if (announcementTimer <= 0) alertBox.replaceChildren();
    }
    if (dt > 0) {
      const phase = sim.phase;
      const tutorial = sim.tutorial;
      const colonyDefeated = sim.valve?.colonyDefeated;
      const enemiesActive = sim.enemies.length > 0;
      sim.step(dt, input);
      if (!megaVirusReached && sim.boss && !practice?.bossPractice) {
        megaVirusReached = true;
        writeSetting(megaVirusKey, 'true');
      }
      if (sim.phase !== phase || sim.tutorial !== tutorial || sim.valve?.colonyDefeated !== colonyDefeated ||
        (sim.gastric && sim.phase === 'intermission' && (sim.enemies.length > 0) !== enemiesActive)) syncMusic();
      applyEvents();
      fireTap = false;
      reloadTap = false;
      deployTap = false;
      touch.reload = false;
    }
    const aiming = world.render(sim, dt, input, reducedMotion);
    input.lookX = 0;
    input.lookY = 0;
    drawHud();
    drawMarkers();
    drawAttackers();
    drawBranches();
    drawCombatFeedback(aiming);
    if (sim.extractionPending) {
      offerExtraction();
      return;
    }
    if (sim.phase === 'won' || sim.phase === 'lost') {
      finish();
      return;
    }
  }
  animation = requestAnimationFrame(frame);
}

byId('manual').addEventListener('click', () => manual.showModal());
byId('touch-manual').hidden = !isTouch;
for (const button of supplyButtons) {
  button.addEventListener('click', () => {
    if (!running || paused || sim.extractionPending || !sim.selectJunctionSupply(button.dataset.junctionSupply)) return;
    drawJunctionStatus();
    drawTurretHud();
  });
}
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => byId(button.dataset.close).close()));
document.querySelectorAll('[data-settings]').forEach(button => button.addEventListener('click', () => {
  if (!settingsDialog.open) settingsDialog.showModal();
}));
byId('settings-close').addEventListener('click', () => settingsDialog.close());
sensitivityControl.addEventListener('input', () => {
  sensitivity = clamp(sensitivityControl.valueAsNumber, 0.5, 2.5);
  sensitivityValue.value = sensitivity.toFixed(2) + '×';
  writeSetting(sensitivityKey, sensitivity);
});
qualityControl.addEventListener('change', () => {
  graphicsQuality = qualityControl.value;
  writeSetting(qualityKey, graphicsQuality);
  if (!world) return;
  world.setQuality(graphicsQuality);
  if (paused) world.render(sim, 0, input, reducedMotion);
});
menu.addEventListener('click', () => {
  if (!loading) audio.unlock().catch(() => {});
}, { once: true });
document.querySelectorAll('[data-mute]').forEach(button => button.addEventListener('click', () => {
  setMuted(!muted);
  if (!muted) audio.unlock().catch(() => {});
}));
deploy.addEventListener('click', startCampaign);
resumeCampaignButton.addEventListener('click', () => {
  if (checkpoint) launch(campaignAreas[checkpoint.results.length], checkpoint);
});
missionSelect.addEventListener('click', () => {
  missionError.hidden = true;
  missionDialog.showModal();
});
practiceLoadout.addEventListener('change', () => {
  writeSetting(practiceLoadoutKey, practiceLoadout.value);
  updatePracticeLoadout();
});
for (const { area, button } of missionEntries) {
  button.addEventListener('click', () => launch(area, null, { upgrade: practiceLoadout.value }));
}
megaVirusDeploy.addEventListener('click', () => launch('brain', null, { upgrade: practiceLoadout.value, bossPractice: true }));
continueButton.addEventListener('click', continueMission);
for (const button of upgradeButtons) {
  button.addEventListener('click', () => {
    if (!resultDialog.open || campaignReward.hidden) return;
    selectedUpgrade = button.dataset.upgrade;
    updateUpgradeChoice();
  });
}
replay.addEventListener('click', () => {
  if (campaign && sim.area === campaignAreas.at(-1) && sim.phase === 'won') startCampaign();
  else launch(sim.area, campaign, practice);
});
byId('return-menu').addEventListener('click', mainMenu);
byId('quit').addEventListener('click', mainMenu);
byId('pause').addEventListener('click', pause);
byId('resume').addEventListener('click', resume);
extractNow.addEventListener('click', () => chooseExtraction('extract'));
stayOvertime.addEventListener('click', () => chooseExtraction('stay'));
touchTurret.addEventListener('click', () => {
  if (running && !paused && !sim.extractionPending && !sim.tutorial && (sim.turretCharges > 0 || sim.canRedeployTurret)) deployTap = true;
});
extractionDialog.addEventListener('cancel', event => event.preventDefault());
pauseDialog.addEventListener('cancel', event => { event.preventDefault(); resume(); });
resultDialog.addEventListener('cancel', event => { event.preventDefault(); mainMenu(); });

document.addEventListener('pointerlockchange', () => {
  const wasLocked = locked;
  locked = document.pointerLockElement === canvas;
  if (wasLocked && !locked && running && !paused) pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  syncMusic();
});
window.addEventListener('blur', () => { if (running) pause(); });
window.addEventListener('keydown', event => {
  if (!running || paused || sim.extractionPending) return;
  const supply = supplyKeys[event.code];
  if (supply && !junctionSupply.hidden) {
    event.preventDefault();
    if (!event.repeat && sim.selectJunctionSupply(supply)) {
      drawJunctionStatus();
      drawTurretHud();
    }
    return;
  }
  if (!controlKeys.has(event.code)) return;
  if (event.code === 'Space' && !junctionSupply.hidden && supplyButtons.includes(document.activeElement)) return;
  event.preventDefault();
  if ((event.code === 'Escape' || event.code === 'KeyP') && !event.repeat) {
    pause();
    return;
  }
  if (!event.repeat && event.code === 'Space') fireTap = true;
  if (!event.repeat && event.code === 'KeyR') reloadTap = true;
  if (!event.repeat && event.code === 'KeyQ' && !sim.tutorial && (sim.turretCharges > 0 || sim.canRedeployTurret)) deployTap = true;
  keys.add(event.code);
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('mousemove', event => {
  if (running && !paused && !sim.extractionPending && locked) {
    input.lookX += event.movementX * sensitivity;
    input.lookY += event.movementY * sensitivity;
  }
});
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('mousedown', event => {
  if (!running || paused || sim.extractionPending) return;
  if (event.button === 0) {
    leftButton = true;
    fireTap = true;
  }
  if (event.button === 2) rightButton = true;
});
window.addEventListener('mouseup', event => {
  if (event.button === 0) leftButton = false;
  if (event.button === 2) rightButton = false;
});
canvas.addEventListener('pointerdown', event => {
  if (!running || paused || sim.extractionPending || locked) return;
  if (event.pointerType === 'touch') event.preventDefault();
  lookPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (locked || lookPointer?.id !== event.pointerId) return;
  const multiplier = sensitivity * (event.pointerType === 'touch' ? 1.35 : 1);
  input.lookX += (event.clientX - lookPointer.x) * multiplier;
  input.lookY += (event.clientY - lookPointer.y) * multiplier;
  lookPointer.x = event.clientX;
  lookPointer.y = event.clientY;
});
window.addEventListener('pointerup', event => {
  if (event.pointerId === lookPointer?.id) lookPointer = null;
});
canvas.addEventListener('pointercancel', () => { lookPointer = null; leftButton = false; rightButton = false; });
joystick.addEventListener('pointerdown', event => {
  if (!running || paused || sim.extractionPending) return;
  event.preventDefault();
  stickPointer = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  moveStick(event);
});
joystick.addEventListener('pointermove', moveStick);
function moveStick(event) {
  if (event.pointerId !== stickPointer) return;
  const rect = joystick.getBoundingClientRect();
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const radius = Math.min(rect.width, rect.height) * 0.34;
  const divisor = Math.max(radius, Math.hypot(dx, dy));
  touch.x = dx / divisor;
  touch.z = -dy / divisor;
  joystick.firstElementChild.style.transform = 'translate(' + touch.x * radius + 'px,' + -touch.z * radius + 'px)';
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  joystick.addEventListener(type, event => {
    if (event.pointerId !== stickPointer) return;
    stickPointer = null;
    touch.x = 0;
    touch.z = 0;
    joystick.firstElementChild.style.transform = '';
  });
}
touchControls.querySelectorAll('[data-touch]:not([data-touch="turret"])').forEach(button => {
  const name = button.dataset.touch;
  button.addEventListener('pointerdown', event => {
    if (!running || paused || sim.extractionPending) return;
    event.preventDefault();
    touch[name] = true;
    if (name === 'fire') fireTap = true;
    button.setPointerCapture(event.pointerId);
  });
  if (name !== 'reload') {
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => { touch[name] = false; });
  }
});

setMuted(muted);
syncSettings();
audio.preloadEffects();
syncMusic();
displayBest();
setupLoadouts();
displayMissionAccess();
