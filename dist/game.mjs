import { Simulation, OBJECTIVE } from './simulation.mjs';
import { GameAudio } from './audio.mjs';

const byId = id => document.getElementById(id);
const menu = byId('menu');
const game = byId('game');
const canvas = byId('world');
const deploy = byId('deploy');
const manual = byId('manual-dialog');
const pauseDialog = byId('pause-dialog');
const resultDialog = byId('result-dialog');
const reticle = byId('reticle');
const hitMarker = byId('hit-marker');
const damageFlash = byId('damage-flash');
const alertBox = byId('game-alert');
const marker = byId('objective-marker');
const actionPrompt = byId('action-prompt');
const joystick = byId('joystick');
const touchControls = byId('touch-controls');

const suitValue = byId('health-value');
const tissueValue = byId('tissue-value');
const ammoValue = byId('ammo-value');
const reserveValue = byId('reserve-value');
const waveValue = byId('wave-value');
const hostState = byId('host-state');
const threats = byId('threats');
const reloadState = byId('reload-state');
const markerDistance = byId('marker-distance');
const promptText = byId('prompt-text');
const repairMeter = byId('repair-meter');
const repairFill = byId('repair-fill');
const healthMeter = byId('health-meter');
const tissueMeter = byId('tissue-meter');
const healthFill = byId('health-fill');
const tissueFill = byId('tissue-fill');

const audio = new GameAudio();
const keys = new Set();
const touch = { fire: false, repair: false, reload: false, x: 0, z: 0 };
const input = { moveX: 0, moveZ: 0, lookX: 0, lookY: 0, fire: false, reload: false, repair: false, sprint: false, aim: false };
const isTouch = matchMedia('(pointer: coarse)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const controlKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyR', 'KeyP', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Escape']);
const pad = number => String(number).padStart(2, '0');
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const bestKey = 'immune-protocol.best-score';
const muteKey = 'immune-protocol.muted';

let world;
let sim;
let running = false;
let loading = false;
let paused = false;
let locked = false;
let leftButton = false;
let rightButton = false;
let fireTap = false;
let reloadTap = false;
let lookPointer = null;
let stickPointer = null;
let hitTimer = 0;
let damageTimer = 0;
let announcementTimer = 0;
let lastFrame = 0;
let animation = 0;
let drawnWave = '';
let bestScore = Number(readSetting(bestKey)) || 0;
let muted = readSetting(muteKey) === 'true';

function readSetting(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeSetting(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Private browsing may block storage. */ }
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

function displayBest() {
  const best = byId('high-score');
  best.hidden = bestScore === 0;
  best.textContent = 'BEST SCORE ' + bestScore.toLocaleString();
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

async function launch() {
  if (loading || running) return;
  loading = true;
  deploy.disabled = true;
  byId('menu-error').hidden = true;
  resultDialog.close();
  game.hidden = false;
  requestMouse();
  const unlocked = Promise.resolve(audio.unlock()).catch(() => {});
  try {
    const { World } = await import('./world.mjs');
    if (!world) world = new World(canvas);
    menu.hidden = true;
    touchControls.hidden = !isTouch;
    clearControls();
    sim = new Simulation();
    sim.start();
    lastFrame = 0;
    damageTimer = 0;
    hitTimer = 0;
    drawnWave = '';
    running = true;
    paused = false;
    audio.setActive(true);
    Promise.resolve(unlocked).then(() => {
      if (running && !paused) audio.play({ type: 'deploy' });
    }).catch(() => {});
    announce('WAVE 01', 'DEFEND THE TISSUE NODE', 3.1);
    drawHud();
    cancelAnimationFrame(animation);
    animation = requestAnimationFrame(frame);
  } catch (error) {
    console.error('Could not start Immune Protocol', error);
    releaseMouse();
    game.hidden = true;
    menu.hidden = false;
    const message = byId('menu-error');
    message.textContent = 'Could not initialize 3D graphics. Try a browser with WebGL 2 and hardware acceleration enabled.';
    message.hidden = false;
  } finally {
    deploy.disabled = false;
    loading = false;
  }
}

function pause() {
  if (!running || paused) return;
  paused = true;
  cancelAnimationFrame(animation);
  animation = 0;
  clearControls();
  audio.setActive(false);
  releaseMouse();
  byId('pause-detail').textContent = isTouch
    ? 'Resume when you’re ready to re-enter the artery.'
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
  requestMouse();
  animation = requestAnimationFrame(frame);
}

function mainMenu() {
  running = false;
  paused = false;
  clearControls();
  audio.setActive(false);
  releaseMouse();
  cancelAnimationFrame(animation);
  pauseDialog.close();
  resultDialog.close();
  game.hidden = true;
  menu.hidden = false;
  displayBest();
  deploy.focus();
}

function finish() {
  running = false;
  clearControls();
  releaseMouse();
  audio.setActive(false);
  const won = sim.phase === 'won';
  audio.play({ type: won ? 'won' : 'lost' });
  if (sim.score > bestScore) {
    bestScore = sim.score;
    writeSetting(bestKey, bestScore);
  }
  byId('result-title').textContent = won ? 'Host stabilized' : 'Mission failed';
  byId('result-detail').textContent = won
    ? 'All five waves were contained. The arterial junction is secure.'
    : (sim.tissue <= 0 ? 'The infection overwhelmed the tissue node.' : 'Your suit failed under pathogen attack.');
  byId('result-score').textContent = sim.score.toLocaleString();
  byId('result-kills').textContent = sim.kills;
  byId('result-tissue').textContent = Math.ceil(sim.tissue) + '%';
  resultDialog.showModal();
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

function drawHud() {
  const { player, tissue, wave, waves, remaining, phase, intermission } = sim;
  const tissuePercent = Math.ceil(tissue);
  const suitPercent = Math.ceil(player.health);
  setText(suitValue, suitPercent);
  setText(tissueValue, tissuePercent + '%');
  fillMeter(healthMeter, healthFill, suitPercent);
  fillMeter(tissueMeter, tissueFill, tissuePercent);
  setText(hostState, sim.repairing ? 'REPAIR ACTIVE' : tissuePercent <= 32 ? 'TISSUE CRITICAL' : tissuePercent < 75 ? 'TISSUE COMPROMISED' : 'VITALS STABLE');
  setText(ammoValue, pad(player.ammo));
  setText(reserveValue, ' / ' + pad(player.reserve));
  setText(reloadState, sim.reloading ? 'RELOADING' : player.ammo === 0 ? 'MAGAZINE EMPTY' : 'FULL AUTO');
  const waveLabel = pad(wave) + ' / ' + pad(waves);
  if (waveLabel !== drawnWave) {
    drawnWave = waveLabel;
    const total = document.createElement('span');
    total.textContent = '/ ' + pad(waves);
    waveValue.replaceChildren(document.createTextNode(pad(wave) + ' '), total);
  }
  setText(threats, phase === 'intermission'
    ? 'NEXT WAVE IN ' + Math.ceil(intermission) + 's'
    : remaining + (remaining === 1 ? ' THREAT LEFT' : ' THREATS LEFT'));
  actionPrompt.hidden = !sim.nearTissue && player.ammo > 0;
  if (!actionPrompt.hidden) {
    promptText.textContent = sim.canRepair ? (isTouch ? 'HOLD REPAIR TO RESTORE TISSUE' : 'HOLD E TO REPAIR TISSUE')
      : player.ammo === 0 ? (player.reserve ? (isTouch ? 'RELOAD CARBINE' : 'PRESS R TO RELOAD') : 'AWAITING RESUPPLY') : 'TISSUE AT FULL INTEGRITY';
    repairMeter.hidden = !sim.repairing;
    if (sim.repairing) repairFill.style.width = sim.repairProgress * 100 + '%';
  }
}

function drawMarker() {
  const distance = Math.hypot(sim.player.x - OBJECTIVE.x, sim.player.z - OBJECTIVE.z);
  const point = world.project(OBJECTIVE.x, OBJECTIVE.y + 1.65, OBJECTIVE.z);
  marker.hidden = !point.visible || distance < 3.2;
  if (!marker.hidden) {
    marker.style.left = point.x + 'px';
    marker.style.top = point.y + 'px';
    markerDistance.textContent = Math.round(distance) + ' m';
  }
}

function applyEvents() {
  for (const event of sim.events) {
    if (event.type !== 'mission') audio.play(event);
    if (event.type === 'shot' && event.hit) {
      hitTimer = 0.19;
      hitMarker.classList.toggle('critical', Boolean(event.crit));
    }
    if (event.type === 'damage' && event.target === 'player') damageTimer = 0.46;
    if (event.type === 'wave') {
      if (event.stage === 'start') announce('WAVE ' + pad(event.wave), 'PATHOGENS INBOUND');
      else if (event.wave < sim.waves) announce('WAVE CONTAINED', 'RESUPPLIED  /  REPAIR TISSUE', 3);
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
    input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    input.aim = rightButton;
    hitTimer = Math.max(0, hitTimer - dt);
    damageTimer = Math.max(0, damageTimer - dt);
    if (announcementTimer > 0) {
      announcementTimer -= dt;
      if (announcementTimer <= 0) alertBox.replaceChildren();
    }
    if (dt > 0) {
      sim.step(dt, input);
      applyEvents();
      fireTap = false;
      reloadTap = false;
      touch.reload = false;
    }
    const aiming = world.render(sim, dt, input, reducedMotion);
    input.lookX = 0;
    input.lookY = 0;
    drawHud();
    drawMarker();
    drawCombatFeedback(aiming);
    if (sim.phase === 'won' || sim.phase === 'lost') {
      finish();
      return;
    }
  }
  animation = requestAnimationFrame(frame);
}

byId('manual').addEventListener('click', () => manual.showModal());
byId('touch-manual').hidden = !isTouch;
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => byId(button.dataset.close).close()));
document.querySelectorAll('[data-mute]').forEach(button => button.addEventListener('click', () => setMuted(!muted)));
deploy.addEventListener('click', launch);
byId('replay').addEventListener('click', launch);
byId('return-menu').addEventListener('click', mainMenu);
byId('quit').addEventListener('click', mainMenu);
byId('pause').addEventListener('click', pause);
byId('resume').addEventListener('click', resume);
pauseDialog.addEventListener('cancel', event => { event.preventDefault(); resume(); });
resultDialog.addEventListener('cancel', event => { event.preventDefault(); mainMenu(); });

document.addEventListener('pointerlockchange', () => {
  const wasLocked = locked;
  locked = document.pointerLockElement === canvas;
  if (wasLocked && !locked && running && !paused) pause();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('blur', () => { if (running) pause(); });
window.addEventListener('keydown', event => {
  if (!running || paused || !controlKeys.has(event.code)) return;
  event.preventDefault();
  if ((event.code === 'Escape' || event.code === 'KeyP') && !event.repeat) {
    pause();
    return;
  }
  if (!event.repeat && event.code === 'Space') fireTap = true;
  if (!event.repeat && event.code === 'KeyR') reloadTap = true;
  keys.add(event.code);
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('mousemove', event => {
  if (running && !paused && locked) {
    input.lookX += event.movementX;
    input.lookY += event.movementY;
  }
});
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('mousedown', event => {
  if (!running || paused) return;
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
  if (!running || paused || locked) return;
  if (event.pointerType === 'touch') event.preventDefault();
  lookPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (locked || lookPointer?.id !== event.pointerId) return;
  const multiplier = event.pointerType === 'touch' ? 1.35 : 1;
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
touchControls.querySelectorAll('[data-touch]').forEach(button => {
  const name = button.dataset.touch;
  button.addEventListener('pointerdown', event => {
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
displayBest();
