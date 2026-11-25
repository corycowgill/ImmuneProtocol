// Player input: keyboard, mouse (with pointer lock), touch controls and Xbox-style controllers.
// Listeners record what is held and what was tapped into `controls`; the game loop reads and
// clears those each frame. The game hands over the few things input can trigger (pause, the
// music mix, junction support) through `commands` when it starts.
import './interface-setup.mjs';
import { GamepadInput, SprintLatch } from './gamepad.mjs';
import { GamepadMenu } from './gamepad-menu.mjs';
import { session } from './session.mjs';
import { byId, isTouch, setText } from './dom.mjs';
import { gameUi } from './ui-browser.mjs';
import { turretStatus, junctionSupply, supplyButtons, drawJunctionStatus, drawTurretHud } from './hud.mjs';
import { actionFor, padActionKey, padButtonOf, padFamilyOf, padHeld, padPressed, setPadFamily } from './keybinds.mjs';

// What is held and what was tapped since the last frame, plus pointer and controller state.
export const controls = {
  leftButton: false, rightButton: false,
  fireTap: false, reloadTap: false, deployTap: false, swapTap: false,
  // One-frame ability presses: jump, dash, melee and the two throwables.
  jumpTap: false, dashTap: false, meleeTap: false, grenadeTap: false, stunTap: false,
  lookPointer: null, stickPointer: null,
  // The controller's state this frame, or null when it is not in use during play.
  xboxState: null,
  wheelSwapAt: 0,
  locked: false,
};

// Game actions input can trigger, filled in by game.mjs.
export const commands = {
  pause() {},
  syncMusic() {},
  selectJunctionSupply() { return false; },
  toggleAiDebug() {},
};

export const canvas = byId('world');
export const pauseDialog = byId('pause-dialog');
const joystick = byId('joystick');
export const touchControls = byId('touch-controls');
const xbox = new GamepadInput();
// Controller tuning from Settings: stick dead zones, look curve and which button names to show.
let promptSetting = 'auto';
export function configureController(values) {
  xbox.configure({ moveDeadZone: values['move-deadzone'], lookDeadZone: values['look-deadzone'], curve: values['look-curve'] });
  promptSetting = values['button-prompts'] ?? 'auto';
  syncPadFamily();
}
function syncPadFamily() {
  if (setPadFamily(promptSetting === 'auto' ? padFamilyOf(xbox.id) : promptSetting)) syncPadPrompts();
}
function syncPadPrompts() {
  if (session.usingGamepad) setText(turretStatus.querySelector('kbd'), padActionKey('turret'));
}

const sprint = new SprintLatch();

// The pad that rumble goes to: only while the player is actually playing with a controller.
export const rumblePad = () => session.usingGamepad ? xbox.currentPad() : null;
const xboxMenus = new GamepadMenu({ main: byId('menu'), onBack: backFromControllerMenu });
export const keys = new Set();
export const touch = { fire: false, repair: false, reload: false, carry: false, x: 0, z: 0 };
export const input = { moveX: 0, moveZ: 0, lookX: 0, lookY: 0, fire: false, reload: false, repair: false, deploy: false, carry: false, sprint: false, aim: false, swap: false,
  jump: false, dash: false, melee: false, grenade: false, stun: false };
// Keys the game always owns in play; everything else follows the player's bindings (keybinds.mjs).
const fixedKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape']);
const supplyKeys = { Digit1: 'left', Digit2: 'right', Digit3: 'ammo' };
const supplyPad = { left: 'left', right: 'right', up: 'ammo' };
const supplyPadLabels = { left: '←', right: '→', ammo: '↑', turret: '↓' };

// The same actions serve canvas touch controls and any future platform host.
const playing = () => session.running && !session.paused && !session.sim.extractionPending;
gameUi.bindControls({
  clear: clearControls,
  pause: () => commands.pause(),
  hold(name, down) {
    if (down && !playing()) return;
    if (['fire', 'repair', 'reload'].includes(name)) touch[name] = down;
    if (name === 'turret') {
      if (down && !session.sim.tutorial && !session.sim.turret && session.sim.turretCharges > 0) controls.deployTap = true;
      touch.carry = down && !!session.sim.turret;
    }
    if (name === 'fire' && down) controls.fireTap = true;
  },
  tap(name) {
    if (!playing()) return;
    if (name === 'swap' && !session.sim.tutorial) controls.swapTap = true;
    if (['jump', 'dash', 'melee', 'grenade', 'stun'].includes(name)) controls[name + 'Tap'] = true;
    if (name === 'turret' && !session.sim.tutorial && !session.sim.turret && session.sim.turretCharges > 0) controls.deployTap = true;
  },
  stick(value) { touch.x = value.x; touch.z = value.z; },
  look(phase, point, id) {
    if (!playing()) return;
    if (point.pointerType === 'mouse') {
      controls.leftButton = phase !== 'end' && !!(point.buttons & 1); controls.rightButton = phase !== 'end' && !!(point.buttons & 2);
      if (phase === 'start' && point.button === 0) { controls.fireTap = true; requestMouse(); }
    }
    if (phase === 'start' && !controls.locked) controls.lookPointer = { id, x: point.x, y: point.y };
    if (phase === 'move' && !controls.locked && controls.lookPointer?.id === id) {
      const multiplier = session.sensitivity * (point.pointerType === 'touch' ? 1.35 : 1);
      input.lookX += (point.x - controls.lookPointer.x) * multiplier;
      input.lookY += (point.y - controls.lookPointer.y) * multiplier;
      controls.lookPointer.x = point.x; controls.lookPointer.y = point.y;
    }
    if (phase === 'end' && controls.lookPointer?.id === id) controls.lookPointer = null;
  },
});

export function requestMouse() {
  if (isTouch || session.usingGamepad || !canvas.requestPointerLock) return;
  try {
    const pending = canvas.requestPointerLock();
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
  } catch { /* Drag and arrow controls work in an embedded browser. */ }
}

export function releaseMouse() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

export function clearControls() {
  xbox.reset();
  xboxMenus.reset();
  controls.xboxState = null;
  sprint.reset();
  keys.clear();
  controls.leftButton = false;
  controls.rightButton = false;
  controls.fireTap = false;
  controls.reloadTap = false;
  controls.deployTap = false;
  for (const tap of ['jumpTap', 'dashTap', 'meleeTap', 'grenadeTap', 'stunTap']) controls[tap] = false;
  controls.keyCarry = false;
  controls.padCarry = false;
  controls.swapTap = false;
  controls.lookPointer = null;
  controls.stickPointer = null;
  touch.fire = false;
  touch.repair = false;
  touch.carry = false;
  touch.reload = false;
  touch.x = 0;
  touch.z = 0;
  input.lookX = 0;
  input.lookY = 0;
  joystick.firstElementChild.style.transform = '';
}

export function syncControllerAudioHint() {
  byId('controller-audio-hint').hidden = !session.usingGamepad || session.muted ||
    navigator.userActivation?.hasBeenActive !== false || session.audio.context?.state === 'running';
}

function setGamepadMode(active) {
  if (session.usingGamepad === active) return;
  session.usingGamepad = active;
  document.documentElement.dataset.input = active ? 'gamepad' : isTouch ? 'touch' : 'keyboard';
  byId('controller-menu-hint').hidden = !active;
  byId('controller-field-hint').hidden = !active;
  byId('field-hint').hidden = active;
  if (session.running) touchControls.hidden = !isTouch || active;
  setText(turretStatus.querySelector('kbd'), active ? padActionKey('turret') : 'Q');
  supplyButtons.forEach((button, index) => {
    setText(button.querySelector('kbd'), active ? supplyPadLabels[button.dataset.junctionSupply] : index + 1);
  });
  if (!active) xboxMenus.reset();
  syncControllerAudioHint();
}

function backFromControllerMenu(dialog, action) {
  if (!dialog || (action === 'pause' && dialog !== pauseDialog)) return;
  if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
}

let lastPadId = '';
export function controllerFrame(now) {
  requestAnimationFrame(controllerFrame);
  if (document.hidden || !document.hasFocus()) return;
  const current = xbox.poll();
  if (current.disconnected && session.usingGamepad) {
    setGamepadMode(false);
    if (session.running && !session.paused && !session.sim.extractionPending) {
      commands.pause();
      setText(byId('pause-detail'), session.onlineRun ? 'Controller disconnected. Your teammates can keep playing.'
        : 'Controller disconnected. Reconnect it or resume with your other controls.');
      return;
    }
  }
  if (current.connected && current.id !== lastPadId) {
    lastPadId = current.id;
    syncPadFamily();
  }
  if (current.active) setGamepadMode(true);
  if (!session.running || session.paused || session.sim.extractionPending) {
    controls.xboxState = null;
    // While Settings waits for a button to bind, the menus leave the controller alone.
    if (document.documentElement.dataset.rebinding) return;
    if (current.connected && session.usingGamepad && !gameUi.menuGamepad(current, now)) xboxMenus.update(current, now);
    return;
  }
  if (current.pressed.pause) {
    commands.pause();
    return;
  }
  // Gameplay follows the player's controller bindings (keybinds.mjs); held actions are read from
  // the same bindings, so game.mjs sees fire/aim/repair/sprint exactly as bound.
  // A copy: with no controller connected, poll() returns a shared frozen state.
  const state = { ...current, fire: padHeld(current, 'fire'), aim: padHeld(current, 'aim'), repair: padHeld(current, 'repair') };
  state.sprint = sprint.update(state, session.options?.['sprint-mode'] ?? 'toggle', padHeld(current, 'sprint'), padPressed(current, 'sprint'));
  controls.xboxState = state;
  // During a Capillary Junction break the D-pad picks support, so D-pad bindings wait.
  const supplyOpen = !junctionSupply.hidden;
  const pressed = action => padPressed(current, action) && !(supplyOpen && padButtonOf(action) >= 12);
  controls.reloadTap ||= pressed('reload');
  if (pressed('turret') && !session.sim.tutorial && !session.sim.turret && session.sim.turretCharges > 0) controls.deployTap = true;
  // Holding the turret button on a placed turret drags it; the press that deploys one does not also pick it up.
  if (pressed('turret')) controls.padCarry = !!session.sim.turret;
  if (!padHeld(current, 'turret')) controls.padCarry = false;
  if (pressed('swap') && !session.sim.tutorial) controls.swapTap = true;
  controls.jumpTap ||= pressed('jump');
  controls.dashTap ||= pressed('dash');
  controls.meleeTap ||= pressed('melee');
  controls.grenadeTap ||= pressed('grenade');
  controls.stunTap ||= pressed('stun');
  if (!junctionSupply.hidden) {
    const direction = Object.keys(supplyPad).find(key => current.pressed[key]);
    if (direction) supplyButtons.find(button => button.dataset.junctionSupply === supplyPad[direction])?.click();
  }
}

document.addEventListener('pointerlockchange', () => {
  const wasLocked = controls.locked;
  controls.locked = document.pointerLockElement === canvas;
  if (wasLocked && !controls.locked && session.running && !session.paused) commands.pause();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) commands.pause();
  commands.syncMusic();
});

window.addEventListener('blur', () => {
  xbox.reset();
  xboxMenus.reset();
  controls.xboxState = null;
  if (session.running) commands.pause();
});

function switchFromGamepad(event) {
  if (!event.isTrusted || !session.usingGamepad) return;
  if (!session.muted && session.audio.context?.state !== 'running') session.audio.unlock().catch(() => {});
  setGamepadMode(false);
}

window.addEventListener('keydown', switchFromGamepad, { capture: true });

window.addEventListener('pointerdown', switchFromGamepad, { capture: true, passive: true });

window.addEventListener('keydown', event => {
  // F3 shows the pathogen AI debug overlay (Shift+F3 for every enemy).
  if (event.code === 'F3' && session.running) {
    event.preventDefault();
    if (!event.repeat) commands.toggleAiDebug(event.shiftKey);
    return;
  }
  if (!session.running || session.paused || session.sim.extractionPending) return;
  const supply = supplyKeys[event.code];
  if (supply && !junctionSupply.hidden) {
    event.preventDefault();
    if (!event.repeat && commands.selectJunctionSupply(supply)) {
      drawJunctionStatus();
      drawTurretHud();
    }
    return;
  }
  const action = actionFor(event.code);
  if (action === 'primary' || action === 'secondary') {
    event.preventDefault();
    if (!event.repeat && !session.sim.tutorial && session.sim.weaponLoadout?.slot !== action) controls.swapTap = true;
    return;
  }
  if (!action && !fixedKeys.has(event.code)) return;
  // In play every control key belongs to the game, even if a hidden menu button still holds focus.
  event.preventDefault();
  if ((event.code === 'Escape' || action === 'pause') && !event.repeat) {
    commands.pause();
    return;
  }
  if (!event.repeat) {
    const tap = { fire: 'fireTap', jump: 'jumpTap', dash: 'dashTap', melee: 'meleeTap', grenade: 'grenadeTap', stun: 'stunTap', reload: 'reloadTap' }[action];
    if (tap) controls[tap] = true;
  }
  if (!event.repeat && action === 'turret' && !session.sim.tutorial && !session.sim.turret && session.sim.turretCharges > 0) controls.deployTap = true;
  // Holding the turret key on a placed turret drags it; the press that deploys one does not also pick it up.
  if (!event.repeat && action === 'turret') controls.keyCarry = !!session.sim.turret;
  keys.add(event.code);
});

window.addEventListener('keyup', event => {
  keys.delete(event.code);
  if (actionFor(event.code) === 'turret') controls.keyCarry = false;
});

window.addEventListener('wheel', event => {
  if (!session.running || session.paused || session.sim.extractionPending || session.sim.tutorial || !controls.locked || !event.deltaY) return;
  const now = performance.now();
  if (now - controls.wheelSwapAt < 260) return;
  controls.wheelSwapAt = now;
  controls.swapTap = true;
}, { passive: true });

window.addEventListener('mousemove', event => {
  if (session.running && !session.paused && !session.sim.extractionPending && controls.locked) {
    if (event.movementX || event.movementY) switchFromGamepad(event);
    input.lookX += event.movementX * session.sensitivity;
    input.lookY += event.movementY * session.sensitivity;
  }
});

canvas.addEventListener('contextmenu', event => event.preventDefault());

canvas.addEventListener('mousedown', event => {
  if (!session.running || session.paused || session.sim.extractionPending) return;
  if (event.button === 0) {
    if (!controls.locked) requestMouse();
    controls.leftButton = true;
    controls.fireTap = true;
  }
  if (event.button === 2) controls.rightButton = true;
});

window.addEventListener('mouseup', event => {
  if (event.button === 0) controls.leftButton = false;
  if (event.button === 2) controls.rightButton = false;
});

canvas.addEventListener('pointerdown', event => {
  if (!session.running || session.paused || session.sim.extractionPending || controls.locked) return;
  if (event.pointerType === 'touch') event.preventDefault();
  controls.lookPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', event => {
  if (controls.locked || controls.lookPointer?.id !== event.pointerId) return;
  const multiplier = session.sensitivity * (event.pointerType === 'touch' ? 1.35 : 1);
  input.lookX += (event.clientX - controls.lookPointer.x) * multiplier;
  input.lookY += (event.clientY - controls.lookPointer.y) * multiplier;
  controls.lookPointer.x = event.clientX;
  controls.lookPointer.y = event.clientY;
});

window.addEventListener('pointerup', event => {
  if (event.pointerId === controls.lookPointer?.id) controls.lookPointer = null;
});

canvas.addEventListener('pointercancel', () => { controls.lookPointer = null; controls.leftButton = false; controls.rightButton = false; });

joystick.addEventListener('pointerdown', event => {
  if (!session.running || session.paused || session.sim.extractionPending) return;
  event.preventDefault();
  controls.stickPointer = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  moveStick(event);
});

joystick.addEventListener('pointermove', moveStick);

function moveStick(event) {
  if (event.pointerId !== controls.stickPointer) return;
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
    if (event.pointerId !== controls.stickPointer) return;
    controls.stickPointer = null;
    touch.x = 0;
    touch.z = 0;
    joystick.firstElementChild.style.transform = '';
  });
}

byId('touch-swap').addEventListener('click', () => {
  if (session.running && !session.paused && !session.sim.extractionPending && !session.sim.tutorial) controls.swapTap = true;
});

touchControls.querySelectorAll('[data-touch]:not([data-touch="turret"]):not([data-touch="swap"])').forEach(button => {
  const name = button.dataset.touch;
  button.addEventListener('pointerdown', event => {
    if (!session.running || session.paused || session.sim.extractionPending) return;
    event.preventDefault();
    touch[name] = true;
    if (name === 'fire') controls.fireTap = true;
    button.setPointerCapture(event.pointerId);
  });
  if (name !== 'reload') {
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => { touch[name] = false; });
  }
});
