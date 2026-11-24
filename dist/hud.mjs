// The in-mission HUD: tissue node readouts, the wave panel and boss bar, objective-specific
// panels (valve, airway, gastric, junction), suit and ammo, the action prompt, the scoreboard,
// and the markers projected from the 3D world (nodes, gash, turret, nests, caches, bosses,
// attackers, inlets). It only reads the game; field-events.mjs and game.mjs change it.
import './interface-setup.mjs';
import { JUNCTION_INLETS, RULES } from './simulation.mjs';
import { ORGAN_MISSIONS } from './organs.mjs';
import { drawWeaponHud, weaponName } from './arsenal-ui.mjs';
import { levelBossStatus } from './level-bosses.mjs';
import { compactHud, shortNodeName, importantNode, fieldTargets } from './hud-layout.mjs';
import { floorHeight } from './arena-scene.mjs';
import { session } from './session.mjs';
import { ABILITIES } from './abilities.mjs';
import { actionKey, padActionKey } from './keybinds.mjs';
import { byId, isTouch, reducedMotion, pad, clamp, setText } from './dom.mjs';
import { missionName } from './mission-text.mjs';

export const game = byId('game');
let compact = false, layoutKey = '';
function syncHudLayout() {
  const width = window.innerWidth, height = window.innerHeight;
  const key = `${width}:${height}:${isTouch}:${session.sim.nodes.length}:${!!session.sim.tutorial}`;
  if (key === layoutKey) return;
  layoutKey = key; compact = compactHud(width, height, isTouch);
  game.dataset.hud = compact ? 'compact' : 'full';
  game.style.setProperty('--hud-nodes', String(session.sim.tutorial ? 1 : session.sim.nodes.length));
}
const scoreboard = byId('scoreboard');
const reticle = byId('reticle');
export const hitMarker = byId('hit-marker');
const damageFlash = byId('damage-flash');

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
  { marker: byId('tertiary-marker'), label: byId('tertiary-marker-label'), distance: byId('tertiary-marker-distance'), edge: byId('tertiary-edge'), edgeLabel: byId('tertiary-edge-label') },
];

const waveOutro = byId('wave-outro');
const waveOutroTitle = byId('wave-outro-title');
const waveOutroCount = byId('wave-outro-count');
const waveOutroDetail = byId('wave-outro-detail');
const waveOutroFill = byId('wave-outro-fill');

let outroSecond = 0;

export const turretStatus = byId('turret-status');
const turretStatusValue = byId('turret-status-value');
const turretMarker = byId('turret-marker');
const turretMarkerDistance = byId('turret-marker-distance');
export const touchTurret = byId('touch-turret');
export const gashMarker = byId('gash-marker');
const gashDistance = byId('gash-distance');
const gashLabel = byId('gash-label');
export const gashEdge = byId('gash-edge');
const gashEdgeLabel = byId('gash-edge-label');
const gashStatus = byId('gash-status');
const trainingHint = byId('training-hint');
const trainingTitle = byId('training-title');
const trainingDetail = byId('training-detail');
const tissueAttackers = byId('tissue-attackers');
const attackerMarkers = new Map();
const actionPrompt = byId('action-prompt');
const suitValue = byId('health-value');
const equipmentLabel = byId('equipment-label');
const ammoValue = byId('ammo-value');
const reserveValue = byId('reserve-value');
const waveMode = byId('wave-mode');
const waveValue = byId('wave-value');
const junctionWaveName = byId('junction-wave-name');
const junctionForecast = byId('junction-forecast');
const junctionSurge = byId('junction-surge');
const junctionSurgeTarget = byId('junction-surge-target');
const junctionSurgeThreat = byId('junction-surge-threat');
const junctionSurgeTime = byId('junction-surge-time');
export const junctionSupply = byId('junction-supply');
const junctionSupplyPlan = byId('junction-supply-plan');
const junctionSupplyNote = byId('junction-supply-note');
export const supplyButtons = [...document.querySelectorAll('[data-junction-supply]')];
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

export const branches = {
  left: { name: 'AMBER', badge: byId('branch-left'), marker: byId('inlet-left') },
  right: { name: 'TEAL', badge: byId('branch-right'), marker: byId('inlet-right') },
};

const threats = byId('threats');
const suitPanel = byId('player-panel');
const suitStatus = byId('suit-status');
const ammoPanel = byId('ammo-panel');
const reloadState = byId('reload-state');
const reloadProgress = byId('reload-progress');
const promptText = byId('prompt-text');
const repairMeter = byId('repair-meter');
const repairFill = byId('repair-fill');
const healthMeter = byId('health-meter');
const healthFill = byId('health-fill');

const attackWarnings = {
  'virus-windup': 'VIRUS ABOUT TO LUNGE',
  'spore-windup': 'SPORE CHARGING',
  'bacillus-windup': 'BACILLUS TEARING TISSUE',
  'guard-windup': 'SHELLBACK TEARING TISSUE',
  'splitter-windup': 'SPLITTER ABOUT TO LUNGE',
  'phage-windup': 'PHAGE ABOUT TO POUNCE',
  'flagellate-windup': 'WHIPTAIL ABOUT TO LUNGE',
  'blister-windup': 'BLISTER MORTAR CHARGING',
  'filovirus-windup': 'FILOVIRUS STRANGLING TISSUE',
  'amoeba-windup': 'AMOEBA ENGULFING TISSUE',
  'rogue-windup': 'ROGUE CELL INVADING TISSUE',
};

export const nodeHitUntil = new Map();

let drawnWave = '';

function fillMeter(meter, fill, value) {
  if (meter.getAttribute('aria-valuenow') === String(value)) return;
  fill.style.width = value + '%';
  meter.setAttribute('aria-valuenow', String(value));
  meter.parentElement.classList.toggle('critical', value <= 32);
}

function drawTraining() {
  const stage = session.sim.tutorial;
  trainingHint.hidden = !stage;
  if (!stage) return;
  trainingHint.dataset.stage = stage;
  if (stage === 'observe') {
    setText(trainingTitle, 'Watch the tissue node');
    setText(trainingDetail, 'A pathogen is approaching the membrane.');
  } else if (stage === 'intercept') {
    setText(trainingTitle, 'Shoot the attached pathogen');
    setText(trainingDetail, session.usingGamepad ? 'Aim with the right stick and hold ' + padActionKey('fire') + '.'
      : isTouch ? 'Drag to aim and hold Fire.' : 'Aim at the attacker and fire.');
  } else {
    setText(trainingTitle, 'Seal the wound');
    setText(trainingDetail, session.sim.nearTissue ? '' : 'Move to the tissue node to repair it.');
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
  const colony = session.sim.enemies.find(enemy => enemy.type === 'colony');
  const health = colony ? Math.ceil(100 * colony.health / colony.maxHealth) : 0;
  const adds = session.sim.enemies.length - Number(!!colony);
  setText(colonyStatus, valve.colonyDefeated ? 'COLONY NEUTRALIZED' : 'COLONY ' + health + '%');
  flankStatus.hidden = adds === 0;
  setText(flankStatus, adds + ' FLANK ' + (adds === 1 ? 'THREAT' : 'THREATS'));
}

export function drawJunctionStatus() {
  const junction = session.sim.area === 'junction';
  const current = session.sim.junctionWave;
  const forecast = session.sim.junctionForecast;
  const surge = session.sim.junctionSurge;
  const planning = junction && session.sim.phase === 'intermission' && !session.sim.settling && !!forecast;
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
  gashStatus.hidden = !session.sim.gash;
  if (session.sim.gash) setText(gashStatus, branches[session.sim.gash.branch].name + ' GASH · LEAKING');
  if (current) setText(junctionWaveName, current.name);
  if (!planning) return;

  setText(junctionForecast, 'NEXT WAVE · ' + forecast.name);
  setText(junctionSupplyPlan, forecast.surges.slice(0, 2).map(group =>
    (group.branch === 'left' ? 'Amber' : 'Teal') + ' ' + group.threat.toLowerCase()
  ).join(' → '));
  const choice = session.sim.junctionSupply;
  for (const button of supplyButtons) {
    const option = button.dataset.junctionSupply;
    const pressed = String(option === choice);
    if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
    const disabled = session.sim.junctionSupplyLocked;
    if (button.disabled !== disabled) button.disabled = disabled;
  }
  let note = 'Choose one support option.';
  if (choice === 'ammo') note = 'Magazines will be loaded at the start of the next wave.';
  else if (choice) note = branches[choice].name + ' inlet reinforcement selected.';
  setText(junctionSupplyNote, note);
}

function nodeStatus(node) {
  if (node.health <= 0) return 'FAILED';
  if (session.sim.gash?.nodeId === node.id) return 'GASH';
  if (node.underAttack || nodeHitUntil.get(node.id) > session.sim.clock) return 'UNDER ATTACK';
  if (session.sim.repairTarget === node) return 'REPAIRING';
  if (node.health <= 32) return 'CRITICAL';
  if (session.restoredNode?.id === node.id && session.restoredNode.until > session.sim.clock && node.health === 100) return 'RESTORED';
  return '';
}

// Shown between the last kill of a wave and the wave-clear / armory or mission report.
function drawWaveOutro() {
  const outro = session.sim.outro;
  waveOutro.hidden = !outro || session.sim.phase !== 'combat' && !session.sim.valve && !session.sim.airway;
  if (waveOutro.hidden) {
    outroSecond = 0;
    return;
  }
  const seconds = Math.max(1, Math.ceil(outro.remaining));
  const finalWave = outro.final || !!session.sim.valve || !!session.sim.airway;
  waveOutro.dataset.final = String(finalWave);
  setText(waveOutroTitle, finalWave ? 'AREA SECURED' : 'WAVE ' + pad(session.sim.wave) + ' CLEARED');
  setText(waveOutroCount, String(seconds));
  setText(waveOutroDetail, finalWave ? 'Mission report in' : session.sim.area === 'junction' || session.onlineRun ? 'Regroup in' : 'Armory opens in');
  waveOutroFill.style.transform = 'scaleX(' + clamp(outro.remaining / outro.duration, 0, 1).toFixed(3) + ')';
  if (seconds !== outroSecond) {
    if (outroSecond) session.audio.play({ type: 'outroTick', final: finalWave });
    outroSecond = seconds;
  }
}

function drawNodeHud() {
  for (const row of nodeRows.slice(session.sim.nodes.length)) row.row.hidden = true;
  for (const marker of nodeMarkers.slice(session.sim.nodes.length)) marker.marker.hidden = marker.edge.hidden = true;
  for (const [index, node] of session.sim.nodes.entries()) {
    const { row, name, value, meter, state } = nodeRows[index];
    row.hidden = index > 0 && !!session.sim.tutorial;
    if (row.hidden) continue;
    const label = nodeStatus(node);
    const integrity = Math.ceil(node.health);
    setText(name, compact ? shortNodeName(node, session.sim.nodes) : node.name);
    if (meter.getAttribute('aria-label') !== node.name + ' integrity') {
      meter.removeAttribute('aria-labelledby'); meter.setAttribute('aria-label', node.name + ' integrity');
      row.title = node.name;
    }
    setText(value, integrity + '%');
    fillMeter(meter, meter.firstElementChild, integrity);
    setText(state, label);
    state.hidden = !label;
    row.classList.toggle('under-attack', label === 'UNDER ATTACK' || label === 'GASH');
  }
}

const abilityHud = byId('ability-hud');
// The suit's throwables and how soon its dash and bash are ready (read by the canvas HUD).
export function drawAbilityHud() {
  const state = session.sim.ability;
  abilityHud.hidden = !state || !!session.sim.tutorial;
  if (abilityHud.hidden) return;
  const gamepad = session.usingGamepad;
  const set = (key, value) => { if (abilityHud.dataset[key] !== value) abilityHud.dataset[key] = value; };
  set('grenades', String(state.grenades));
  set('stuns', String(state.stuns));
  set('dash', (1 - state.dashCooldown / ABILITIES.dash.cooldown).toFixed(2));
  set('bash', (1 - state.meleeCooldown / ABILITIES.melee.cooldown).toFixed(2));
  set('keys', gamepad ? ['grenade', 'stun', 'dash', 'melee'].map(padActionKey).join('|') : isTouch ? '|||' : ['grenade', 'stun', 'dash', 'melee'].map(actionKey).join('|'));
}

export function drawTurretHud() {
  turretStatus.hidden = !!session.sim.tutorial;
  const turret = session.sim.turret;
  const ready = !turret && session.sim.turretCharges > 0 && !session.sim.tutorial;
  touchTurret.hidden = !!session.sim.tutorial;
  touchTurret.disabled = !ready && !turret;
  const state = ready ? (session.sim.turretPlacement ? 'ready' : 'blocked') : turret?.carried ? 'moving' :
    turret?.jammed ? 'jammed' : turret?.targetId == null ? 'online' : 'engaging';
  turretStatus.dataset.state = state;
  touchTurret.dataset.state = state;
  setText(touchTurret, compact && turret ? state === 'jammed' ? 'Jammed' : 'Move' : 'Turret');
  setText(turretStatusValue, {
    online: 'TURRET ONLINE', engaging: 'TURRET ENGAGING', jammed: 'TURRET JAMMED', moving: 'MOVING TURRET',
    ready: 'TURRET READY', blocked: 'FIND CLEAR GROUND',
  }[state]);
}

function drawOrganHazard() {
  const hazard = session.sim.organ;
  organHazard.hidden = !hazard || session.sim.boss?.state === 'defeated' || (session.sim.phase !== 'combat' && session.sim.phase !== 'intermission');
  if (!hazard) return;
  organHazard.dataset.phase = hazard.phase;
  setText(organHazardLabel, hazard.label);
  setText(organHazardDetail, hazard.detail);
  organHazardTime.hidden = !!session.sim.boss;
  const leadTime = hazard.phase === 'recovery' && !session.sim.boss ? ORGAN_MISSIONS[session.sim.area].hazard.warning : 0;
  setText(organHazardTime, Math.max(1, Math.ceil(hazard.remaining + leadTime)) + 's');
}

function drawBossHud() {
  const boss = session.sim.boss;
  const levelBoss = boss ? null : levelBossStatus(session.sim);
  bossHud.hidden = !boss && !levelBoss;
  const name = levelBoss?.name ?? 'Mega Virus';
  setText(byId('boss-name'), name);
  if (bossHealth.getAttribute('aria-label') !== name + ' health') bossHealth.setAttribute('aria-label', name + ' health');
  if (levelBoss) {
    // The same bar serves every level boss: its name and health. What it is doing shows only in
    // the boss itself.
    bossHud.dataset.state = 'warning';
    setText(bossPhase, '');
    const percent = Math.ceil(levelBoss.health * 100 / levelBoss.maxHealth);
    if (bossHealth.getAttribute('aria-valuenow') !== String(percent)) {
      bossHealth.setAttribute('aria-valuenow', percent);
      bossHealthFill.style.width = percent + '%';
    }
    setText(bossStatus, percent + '%');
    setText(bossStatusDetail, '');
    bossTime.hidden = true;
    return;
  }
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
    defeated: ['Mega Virus down', session.sim.enemies.length ? 'Clear surviving pathogens' : 'Both tissue nodes secure'],
  }[state];
  setText(bossStatus, status[0]);
  setText(bossStatusDetail, status[1]);
  bossTime.hidden = state === 'defeated';
  setText(bossTime, Math.max(1, Math.ceil(boss.remaining)) + 's');
}

function drawAirwayHud() {
  const airway = session.sim.airway;
  airwayHud.hidden = !airway;
  if (!airway) return;
  const { state, remaining, duration, ports, minimumIntegrity, incoming } = airway;
  airwayHud.dataset.state = state;
  for (const [index, { nodeId, open, progress }] of ports.entries()) {
    const { status, label } = airwayReadouts[index];
    status.dataset.state = open ? 'open' : session.sim.repairTarget?.id === nodeId ? 'repairing' : 'blocked';
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
  const gastric = session.sim.gastric;
  return gastric?.stage === 'intake' || gastric?.stage === 'drain' ? gastric[gastric.stage] : null;
}

function gastricProgress(valve) {
  const partial = session.sim.repairTarget === valve ? session.sim.repairProgress * session.sim.repairAmount / session.sim.gastric.sealPoints : 0;
  return valve.progress >= 1 ? 100 : Math.min(99, Math.floor((valve.progress + partial) * 100));
}

function drawGastricHud() {
  const gastric = session.sim.gastric;
  gastricHud.hidden = !gastric || gastric.stage === 'flooded';
  if (gastricHud.hidden) return;
  const { stage, remaining, flankRemaining, incoming } = gastric;
  gastricHud.dataset.state = stage === 'draining' ? 'drain' : stage;
  const target = currentGastricValve();
  for (const { row, state, progress, id } of gastricValves) {
    const valve = gastric[id];
    const done = valve.progress >= 1;
    const active = valve === target;
    const working = active && session.sim.repairTarget === valve;
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

// Score on screen: one line per player with points and kills, and the team total in co-op.
let drawnScores = '';

// Clears what the HUD remembers between frames, for a fresh mission.
export function resetHud() {
  drawnWave = '';
  drawnScores = '';
  outroSecond = 0;
  nodeHitUntil.clear();
  attackerMarkers.clear();
  tissueAttackers.replaceChildren();
  for (const view of fieldMarkers.values()) {
    view.marker.remove();
    view.edge.remove();
  }
  fieldMarkers.clear();
}

function drawScoreboard() {
  const squad = session.onlineRun ? session.sim.players ?? [] : [];
  const rows = squad.map(player => ({
    name: player.name || 'Player', score: player.score ?? 0, kills: player.kills ?? 0, self: player.id === session.sim.player.id,
  }));
  rows.push({ name: squad.length ? 'Team' : 'Score', score: session.sim.score, kills: session.sim.kills, team: squad.length > 0 });
  const signature = rows.map(row => row.name + ':' + Math.round(row.score) + ':' + row.kills).join('|');
  if (signature === drawnScores) return;
  drawnScores = signature;
  scoreboard.replaceChildren(...rows.map(row => {
    const item = document.createElement('li');
    const name = document.createElement('span');
    const score = document.createElement('strong');
    const kills = document.createElement('small');
    name.textContent = row.name;
    score.textContent = Math.round(row.score).toLocaleString();
    kills.textContent = row.kills + (row.kills === 1 ? ' kill' : ' kills');
    if (row.self) item.dataset.self = 'true';
    if (row.team) item.dataset.team = 'true';
    item.append(name, score, kills);
    return item;
  }));
}

// Mission points and kills per player, with the campaign total so far beside them in co-op.
export function drawPlayerScores(results, complete) {
  const section = byId('result-players');
  section.hidden = !session.onlineRun;
  if (!session.onlineRun) return;
  const totals = new Map();
  for (const result of results) {
    for (const player of result.players ?? []) {
      const total = totals.get(player.id) ?? { name: player.name, score: 0, kills: 0 };
      total.score += player.score ?? 0;
      total.kills += player.kills ?? 0;
      totals.set(player.id, total);
    }
  }
  setText(byId('result-players-title'), complete ? 'Campaign score by player' : 'Score by player');
  setText(byId('result-players-caption'), complete ? results.length + ' missions' : missionName(session.sim.area));
  const squad = complete ? [...totals].map(([id, total]) => ({ id, ...total })) : session.sim.players ?? [];
  const ranked = [...squad].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  byId('result-player-list').replaceChildren(...ranked.map(player => {
    const row = document.createElement('div');
    const name = document.createElement('dt');
    const score = document.createElement('dd');
    const kills = player.kills ?? 0;
    name.textContent = (player.name || 'Player') + (player.id === session.sim.player.id ? ' (you)' : '');
    const detail = document.createElement('small');
    detail.className = 'campaign-node-detail';
    const campaignTotal = totals.get(player.id);
    detail.textContent = kills + (kills === 1 ? ' pathogen' : ' pathogens') + ' neutralized' +
      (!complete && campaignTotal && results.length > 1 ? ' · Campaign ' + Math.round(campaignTotal.score).toLocaleString() : '');
    name.append(detail);
    score.textContent = Math.round(player.score ?? 0).toLocaleString();
    row.append(name, score);
    return row;
  }));
}

export function drawHud() {
  syncHudLayout();
  const { player, tissue, wave, waves, remaining, phase, intermission, valve } = session.sim;
  drawScoreboard();
  const suitPercent = Math.ceil(player.health);
  drawNodeHud();
  drawWaveOutro();
  drawTurretHud();
  drawAbilityHud();
  drawOrganHazard();
  drawBossHud();
  drawAirwayHud();
  drawGastricHud();
  const suitCritical = suitPercent <= 25;
  suitPanel.classList.toggle('critical', suitCritical);
  setText(suitStatus, suitCritical ? 'SUIT CRITICAL' : 'SUIT INTEGRITY');
  setText(suitValue, suitPercent + '%');
  fillMeter(healthMeter, healthFill, suitPercent);
  setText(equipmentLabel, session.sim.repairing ? 'TISSUE SEALER' : session.sim.switching > 0 ? 'DRAWING ' + weaponName(session.sim) : weaponName(session.sim));
  ammoValue.hidden = reserveValue.hidden = session.sim.repairing;
  setText(ammoValue, pad(player.ammo));
  let ammoStatus = 'ready';
  let ammoMessage = '';
  if (!session.sim.repairing) {
    if (session.sim.reloading > 0) {
      ammoStatus = 'reloading';
      ammoMessage = compact ? 'RELOAD' : 'RELOADING';
    } else if (player.ammo === 0) {
      ammoStatus = 'empty';
      ammoMessage = compact ? 'EMPTY' : 'MAGAZINE EMPTY';
    } else if (player.ammo <= Math.ceil(session.sim.magazineSize / 5)) {
      ammoStatus = 'low';
      ammoMessage = compact ? 'LOW' : 'MAGAZINE LOW';
    }
  }
  if (ammoPanel.dataset.state !== ammoStatus) ammoPanel.dataset.state = ammoStatus;
  setText(reloadState, ammoMessage);
  reloadProgress.hidden = ammoStatus !== 'reloading';
  if (!reloadProgress.hidden) reloadProgress.value = Math.floor(session.sim.reloadProgress * 100);
  const junction = session.sim.area === 'junction';
  const waveLabel = pad(wave) + ' / ' + pad(waves);
  if (valve) drawValve(valve);
  else {
    setText(waveMode, junction || session.sim.organMission ? missionName(session.sim.area).toUpperCase() : 'INFECTION WAVE');
    if (waveLabel !== drawnWave) {
      drawnWave = waveLabel;
      const total = document.createElement('span');
      total.textContent = '/ ' + pad(waves);
      waveValue.replaceChildren(document.createTextNode(pad(wave) + ' '), total);
    }
    let status = remaining + (remaining === 1 ? ' THREAT LEFT' : ' THREATS LEFT');
    if (session.sim.boss || session.sim.airway || currentGastricValve() || session.sim.gastric?.stage === 'draining') status = session.sim.enemies.length ?
      session.sim.enemies.length + (session.sim.enemies.length === 1 ? ' PATHOGEN ACTIVE' : ' PATHOGENS ACTIVE') : '';
    else if (session.sim.tutorial) status = 'FIELD TRAINING';
    else if (session.sim.extractionPending) status = 'EXTRACTION READY';
    else if (phase === 'intermission') {
      status = session.sim.settling && session.sim.gash ? 'SEAL GASH TO EXTRACT'
        : (session.sim.settling ? 'EXTRACT IN ' : 'NEXT WAVE IN ') + Math.ceil(intermission) + 's';
    }
    else if (remaining === 0 && session.sim.projectiles.length) status = 'SPORE SHOTS IN FLIGHT';
    else if (remaining > 0 && session.sim.enemies.length === remaining && session.sim.enemies.every(enemy => enemy.nest)) status = remaining === 1 ? 'DESTROY THE BROOD NEST' : 'DESTROY THE BROOD NESTS';
    else if (session.sim.outro) status = 'AREA CLEAR';
    setText(threats, status);
  }
  const nearby = session.sim.nearNode;
  const repairingNode = session.sim.repairTarget;
  const restoringHere = !!nearby && session.restoredNode?.id === nearby.id && session.restoredNode.until > session.sim.clock && nearby.health === 100;
  const repairKey = session.usingGamepad ? 'HOLD ' + padActionKey('repair').toUpperCase() : isTouch ? 'HOLD REPAIR' : 'HOLD E';
  const blockedPort = session.sim.airway?.ports.find(port => port.nodeId === nearby?.id && !port.open);
  const nearValve = session.sim.nearGastricValve;
  const valveTarget = currentGastricValve();
  const workingValve = !!valveTarget && repairingNode === valveTarget;
  const repairing = session.sim.repairing && (!restoringHere || !!blockedPort || workingValve);
  let prompt = '';
  if (repairing && session.sim.gash && session.sim.repairTarget === session.sim.gash) prompt = 'SEALING GASH';
  else if (session.sim.gash && session.sim.nearGash) {
    const sealed = Math.floor(100 * (1 - session.sim.gash.sealRemaining / session.sim.gash.sealRequired));
    prompt = repairKey + ' TO SEAL GASH' + (sealed ? ' · ' + sealed + '%' : '');
  }
  else if (session.sim.gash && session.sim.settling) prompt = 'MOVE TO THE GASH TO SEAL IT';
  else if (workingValve || (valveTarget && nearValve === valveTarget)) {
    const intake = valveTarget === session.sim.gastric.intake;
    prompt = repairing && workingValve
      ? (intake ? 'CLOSING INTAKE VALVE' : 'OPENING DRAIN VALVE')
      : repairKey + (intake ? ' TO CLOSE INTAKE VALVE' : ' TO OPEN DRAIN VALVE');
  }
  else if (blockedPort && session.sim.canRepair) prompt = repairing ?
    'REOPENING ' + blockedPort.name.toUpperCase() : repairKey + ' TO REOPEN ' + blockedPort.name.toUpperCase();
  else if (restoringHere) prompt = nearby.name.toUpperCase() + ' RESTORED · 100%';
  else if (repairing) prompt = 'REPAIRING ' + repairingNode.name.toUpperCase();
  else if (session.sim.canRepair && nearby) prompt = repairKey + ' TO REPAIR ' + nearby.name.toUpperCase();
  else if (session.sim.gastric?.stage === 'intake' && nearValve === session.sim.gastric.drain) prompt = 'CLOSE THE INTAKE FIRST';
  else if (session.sim.organ?.repairBlocked && nearby?.id === session.sim.organ.nodeId && nearby.health < 100) {
    prompt = nearby.name.toUpperCase() + ' REPAIRS BLOCKED DURING OVERLOAD';
  }
  else if (valve && nearby === session.sim.objective && nearby.health < 100 && valve.phase !== 'closed' && valve.colonyDefeated) {
    prompt = 'REPAIR ' + nearby.name.toUpperCase() + ' WHEN THE VALVE CLOSES';
  }
  else if (valve?.exposed && !valve.colonyDefeated && player.ammo > 0) prompt = 'SHOOT THE EXPOSED COLONY';
  else if (session.sim.settling && tissue < 100) prompt = 'MOVE TO A DAMAGED NODE TO REPAIR';
  else if (player.ammo === 0) {
    prompt = session.usingGamepad ? 'PRESS ' + padActionKey('reload').toUpperCase() + ' TO RELOAD' : isTouch ? 'RELOAD CARBINE' : 'PRESS R TO RELOAD';
  } else if (phase === 'intermission' && tissue < 100) {
    prompt = 'MOVE TO A DAMAGED NODE TO REPAIR';
  }
  actionPrompt.hidden = !prompt;
  actionPrompt.classList.toggle('restored', restoringHere);
  setText(promptText, prompt);
  repairMeter.hidden = !repairing;
  if (repairing) {
    const gash = session.sim.repairTarget === session.sim.gash && session.sim.gash;
    const port = session.sim.airway?.ports.find(item => item.nodeId === session.sim.repairTarget?.id && !item.open);
    const value = gash ? Math.floor(100 * clamp(
      (gash.sealRequired - gash.sealRemaining + session.sim.repairProgress * session.sim.repairAmount) / gash.sealRequired, 0, 1,
    )) : workingValve ? gastricProgress(valveTarget)
      : port ? Math.min(99, Math.floor(100 * (port.progress + session.sim.repairProgress * session.sim.repairAmount / session.sim.airway.sealPoints)))
      : Math.floor(session.sim.repairProgress * 100);
    repairFill.style.width = value + '%';
    if (repairMeter.getAttribute('aria-valuenow') !== String(value)) repairMeter.setAttribute('aria-valuenow', value);
  }
  drawTraining();
  drawJunctionStatus();
}

export function drawMarkers() {
  const player = session.sim.player;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const top = worldMarkerTop(width <= 720 ? 120 : 132);
  const edgePositions = [];
  for (const [index, node] of session.sim.nodes.entries()) {
    const { marker, label, distance: distanceLabel, edge, edgeLabel } = nodeMarkers[index];
    const { x, y, z } = node;
    const dx = x - player.x;
    const dz = z - player.z;
    const distance = Math.hypot(dx, dz);
    const valveNode = index === 0 && !!session.sim.valve;
    const point = session.world.project(x, y + (valveNode ? .96 : 1.65), z);
    const visible = point.visible && point.y >= top && point.y < worldMarkerBottom(height, .84) && point.x > 58 && point.x < width - 58;
    const concealed = (index > 0 && !!session.sim.tutorial) || (valveNode && session.sim.valve.exposed && !session.sim.valve.colonyDefeated) || session.sim.gash?.nodeId === node.id;
    const status = nodeStatus(node);
    const port = session.sim.airway?.ports[index];
    const markerName = port?.name ?? (compact ? shortNodeName(node, session.sim.nodes) : node.name);
    const danger = status === 'UNDER ATTACK' || status === 'CRITICAL';
    const nearby = distance <= RULES.repairRadius && !danger;
    marker.hidden = concealed || !visible || nearby;
    edge.hidden = concealed || visible || nearby;
    const important = importantNode(node, session.sim);
    if (compact && !important) edge.hidden = true;
    for (const element of [marker, edge]) {
      element.classList.toggle('quiet', compact && !important);
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
  drawFieldMarkers(top, width, height, edgePositions);
  const weakPoint = session.sim.boss?.state === 'exposed' ? session.sim.boss.weakPoint : null;
  bossMarker.hidden = true;
  if (weakPoint) {
    const point = session.world.project(weakPoint.x, weakPoint.y + weakPoint.radius + .24, weakPoint.z);
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
  gastricMarker.hidden = gastricEdge.hidden = !target || session.sim.nearGastricValve === target;
  if (gastricMarker.hidden) return;
  const dx = target.x - session.sim.player.x;
  const dz = target.z - session.sim.player.z;
  const point = session.world.project(target.x, target.y + 1.8, target.z);
  const distance = Math.round(Math.hypot(dx, dz)) + ' m';
  const label = target === session.sim.gastric.intake ? 'Close intake' : 'Open drain';
  const visible = point.visible && point.y >= top && point.y < worldMarkerBottom(height, .84) && point.x > 65 && point.x < width - 65;
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
  const player = session.sim.player;
  const side = dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw);
  const forward = -dx * Math.sin(player.yaw) - dz * Math.cos(player.yaw);
  const insetX = compact ? (width > height ? 100 : 64) : Math.min(84, width * 0.23);
  const halfWidth = Math.max(12, width / 2 - insetX);
  const bottom = Math.max(top + 20, compact ? height - 170 : height * (isTouch ? 0.68 : 0.8));
  const middleY = (top + bottom) / 2;
  const halfHeight = (bottom - top) / 2;
  // A point behind the view projects to the wrong side of the camera.
  const towardX = forward > 0 ? point.x - width / 2 : Math.sign(side || 1) * width;
  const towardY = forward > 0 ? point.y - middleY : 0;
  const scale = 1 / Math.max(Math.abs(towardX) / halfWidth, Math.abs(towardY) / halfHeight, 0.01);
  const x = width / 2 + towardX * scale;
  let y = middleY + towardY * scale;
  for (const other of occupied) {
    if (Math.abs(other.x - x) < (compact ? 110 : 130) && Math.abs(other.y - y) < (compact ? 28 : 38)) {
      const step = compact ? 30 : 40;
      y = y + step <= bottom ? y + step : Math.max(top, y - step);
    }
  }
  edge.style.setProperty('--objective-x', x + 'px');
  edge.style.setProperty('--objective-y', y + 'px');
  edge.style.setProperty('--objective-angle', Math.atan2(towardX, -towardY) + 'rad');
  return { x, y };
}

function drawGash(edgePositions) {
  const gash = session.sim.gash;
  if (!gash) {
    gashMarker.hidden = gashEdge.hidden = true;
    return;
  }
  const { x, y, z, branch } = gash;
  const dx = x - session.sim.player.x;
  const dz = z - session.sim.player.z;
  const point = session.world.project(x, y + 1.25, z);
  const width = window.innerWidth;
  const height = window.innerHeight;
  const top = worldMarkerTop(width <= 720 ? 112 : 128);
  const readable = point.visible && point.y >= top && point.y < worldMarkerBottom(height, .83) && point.x > 60 && point.x < width - 60;
  gashMarker.hidden = session.sim.nearGash || !readable;
  gashEdge.hidden = session.sim.nearGash || readable;
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

// Brood nests and antibody caches get a marker in view and an arrow at the screen edge otherwise,
// so they can be found from across the arena.
const fieldMarkers = new Map();

function drawFieldMarkers(top, width, height, occupied) {
  const targets = [];
  const encounter = session.sim.encounter;
  for (const enemy of session.sim.enemies) {
    if (enemy.nest) targets.push({ key: 'nest' + enemy.id, kind: 'nest', label: 'BROOD NEST', x: enemy.x, y: enemy.y + enemy.radius + .5, z: enemy.z,
      detail: Math.ceil(100 * enemy.health / enemy.maxHealth) + '%' });
  }
  const boss = session.sim.enemies.find(enemy => enemy.boss);
  if (boss) {
    targets.push({ key: 'boss' + boss.id, kind: 'boss', label: boss.name.toUpperCase(), x: boss.x, y: boss.y + boss.radius + .8, z: boss.z,
      detail: boss.hidden ? 'burrowed' : Math.ceil(100 * boss.health / boss.maxHealth) + '%' });
  }
  for (const pickup of session.sim.pickups ?? []) {
    targets.push({ key: 'cache' + pickup.id, kind: 'cache', label: 'ANTIBODY CACHE', x: pickup.x, y: pickup.y + 1.1, z: pickup.z,
      detail: Math.ceil(pickup.remaining) + 's' });
  }
  const live = new Set();
  for (const target of fieldTargets(targets, session.sim.player, compact)) {
    live.add(target.key);
    let view = fieldMarkers.get(target.key);
    if (!view) {
      const marker = turretMarker.cloneNode(true);
      const edge = gashEdge.cloneNode(true);
      for (const element of [marker, edge, ...marker.querySelectorAll('[id]'), ...edge.querySelectorAll('[id]')]) element.removeAttribute('id');
      marker.className = 'objective-marker field-marker';
      edge.className = 'objective-edge field-edge';
      marker.dataset.kind = edge.dataset.kind = target.kind;
      view = { marker, edge, label: marker.querySelector('strong'), detail: marker.querySelector('small'), edgeLabel: edge.querySelector('strong') };
      fieldMarkers.set(target.key, view);
      byId('field-markers').append(marker, edge);
    }
    const dx = target.x - session.sim.player.x;
    const dz = target.z - session.sim.player.z;
    const range = Math.round(Math.hypot(dx, dz)) + ' m';
    const point = session.world.project(target.x, target.y, target.z);
    const visible = point.visible && point.y >= top && point.y < worldMarkerBottom(height, .84) && point.x > 60 && point.x < width - 60;
    view.marker.hidden = !visible;
    view.edge.hidden = visible;
    if (visible) {
      const quiet = compact && target.kind === 'cache' && Math.hypot(dx, dz) > 14;
      view.marker.classList.toggle('quiet', quiet);
      view.marker.style.left = point.x + 'px';
      view.marker.style.top = point.y + 'px';
      setText(view.label, target.label);
      setText(view.detail, range + ' · ' + target.detail);
    } else {
      occupied.push(positionEdgeMarker(view.edge, point, dx, dz, top, width, height, occupied));
      setText(view.edgeLabel, target.label + ' · ' + range);
    }
  }
  for (const [key, view] of fieldMarkers) {
    if (live.has(key)) continue;
    view.marker.remove();
    view.edge.remove();
    fieldMarkers.delete(key);
  }
}

function drawTurretMarker(top, width, height) {
  const turret = session.sim.turret;
  if (!turret) {
    turretMarker.hidden = true;
    return;
  }
  const distance = Math.hypot(turret.x - session.sim.player.x, turret.z - session.sim.player.z);
  const point = session.world.project(turret.x, turret.y + 1.75, turret.z);
  turretMarker.hidden = !point.visible || distance < 4 || point.y < top || point.y > worldMarkerBottom(height, .78) || point.x < 52 || point.x > width - 52;
  if (turretMarker.hidden) return;
  turretMarker.style.left = point.x + 'px';
  turretMarker.style.top = point.y + 'px';
  setText(turretMarkerDistance, Math.round(distance) + ' m');
}

function worldMarkerTop(defaultTop) {
  if (compact) return window.innerWidth > window.innerHeight ? 83 : 165;
  return window.innerWidth <= 480 ? Math.max(defaultTop, 156) : defaultTop;
}

function worldMarkerBottom(height, fraction) {
  return compact ? height - 170 : height * fraction;
}

// Pathogens are read from the pathogens themselves: no icon, text or overlay marks what one is
// doing. Clears anything a previous build left on screen.
export function drawAttackers() {
  for (const icon of attackerMarkers.values()) icon.remove();
  attackerMarkers.clear();
}

export function drawBranches() {
  if (session.sim.area !== 'junction') return;
  for (const [side, branch] of Object.entries(branches)) {
    let count = 0;
    let striking = false;
    for (const enemy of session.sim.enemies) {
      if (enemy.branch !== side) continue;
      count++;
      striking ||= enemy.attackingTissue;
    }
    setText(branch.badge, branch.name + ' ' + count);
    branch.badge.classList.toggle('active', count > 0);
    branch.badge.classList.toggle('striking', striking);
    branch.badge.classList.toggle('reinforced', session.sim.reinforcement?.branch === side);
    const { x, y, z } = JUNCTION_INLETS[side];
    const point = session.world.project(x, y + 1.8, z);
    branch.marker.hidden = !point.visible || point.y < worldMarkerTop(127) || point.x < 56 || point.x > window.innerWidth - 56;
    if (!branch.marker.hidden) {
      branch.marker.style.left = point.x + 'px';
      branch.marker.style.top = point.y + 'px';
    }
  }
}

export function drawCombatFeedback(aiming) {
  reticle.classList.toggle('aim', aiming);
  drawWeaponHud(session.sim, aiming, session.world.weaponPose.aim > .86);
  hitMarker.style.opacity = String(clamp(session.hitTimer * 7, 0, 1));
  damageFlash.style.opacity = String(session.damageTimer * (session.reduceMotion ? 0.42 : 1.6) * (session.options?.['damage-flash'] ?? 1));
}
